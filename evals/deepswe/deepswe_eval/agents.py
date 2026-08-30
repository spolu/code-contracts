from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any, ClassVar

from pier.agents.installed.base import NonZeroAgentExitCodeError
from pier.agents.installed.mini_swe_agent import MiniSweAgent
from pier.environments.base import BaseEnvironment
from pier.models.agent.context import AgentContext
from pier.models.agent.install import AgentInstallSpec, InstallStep
from pier.models.agent.network import NetworkAllowlist

EVAL_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = EVAL_ROOT.parents[1]
DEFAULT_CC_CHECK_BUNDLE = EVAL_ROOT / "artifacts" / "cc-check.tar.gz"
DEFAULT_SKILL = REPOSITORY_ROOT / "skills" / "code-contracts" / "SKILL.md"
DEFAULT_PILOT_MANIFEST = EVAL_ROOT / "config" / "pilot-v1.json"
DEFAULT_HARNESS_LOCK = EVAL_ROOT / "uv.lock"

MINI_SWE_AGENT_VERSION = "2.4.6"
NODE_VERSION = "24.16.0"
NODE_ARCHIVE_SHA256 = {
    "arm64": "589f5b6dd4fcfee4dfda73013903c966abaa8abd93dbc9d436544e472b4f0e74",
    "x64": "2faf6a387e9b62b888e21c54f01249fb27537ffecf1842f29f4c919d0a59a0ff",
}
PROVENANCE_FILENAME = "deepswe-provenance.json"
BUNDLE_CHUNK_SIZE = 24_000
CODE_CONTRACTS_INSTRUCTIONS = """## Code Contracts Workflow

Complete this workflow for every task that changes code.

1. Identify every declaration, file, or directory whose implementation you may change.
2. Before making any implementation edit, run `cc-check list <path>` for each target to discover its
   applicable contracts.
3. If a target has no task-relevant contracts governing the behavior you will change, STOP and cover
   it first:
   a. Add precise `@cc` contracts at the narrowest stable declaration or directory boundary.
   b. Run `cc-check list <path>` and confirm that the new contracts are discoverable.
   c. Run `cc-check check <path>` and confirm that it passes.
   d. Do not edit the implementation until these checks succeed.
4. Make the implementation changes while preserving or updating the applicable contracts.
5. Introduce every new declaration together with precise contracts governing its material behavior.
6. After implementation, run `cc-check list <path>` and `cc-check check <path>` separately for every
   affected supported source file.
7. Only after these checks pass and contract / code coherence is ensured, consider the task done.

**CRITICAL REQUIREMENTS:**

- You MUST use the code-contracts skill for every code change.
- You MUST NOT edit existing implementation code that lacks task-relevant behavioral contracts. Add
  and validate contracts first.
- Every materially changed behavior MUST be covered by new or updated contracts in the final patch.
- A successful `cc-check check` that discovers no task-relevant contracts does not satisfy this
  workflow.
- Do not invent speculative obligations; derive contracts from the task requirements and observable
  code behavior.
- If no authenticated GitHub identity is available, omit `author` metadata."""


def sha256_bytes(payload: bytes) -> str:
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def skill_prompt_extension(skill_content: str) -> str:
    return (
        f'\n\n<skill name="code-contracts">\n{skill_content.rstrip()}\n</skill>\n\n'
        f"{CODE_CONTRACTS_INSTRUCTIONS}\n"
    )


class _DeepSWEAgent(MiniSweAgent):
    VARIANT: ClassVar[str]

    def __init__(
        self,
        *,
        logs_dir: Path,
        model_name: str | None,
        cc_check_bundle_sha256: str,
        skill_sha256: str,
        pilot_manifest_sha256: str,
        harness_lock_sha256: str,
        prompt_extension_sha256: str,
        version: str = MINI_SWE_AGENT_VERSION,
        reasoning_effort: str = "max",
        cc_check_bundle_path: str | Path = DEFAULT_CC_CHECK_BUNDLE,
        skill_path: str | Path = DEFAULT_SKILL,
        pilot_manifest_path: str | Path = DEFAULT_PILOT_MANIFEST,
        harness_lock_path: str | Path = DEFAULT_HARNESS_LOCK,
        **kwargs: Any,
    ) -> None:
        if version != MINI_SWE_AGENT_VERSION:
            raise ValueError(
                f"mini-swe-agent must be pinned to {MINI_SWE_AGENT_VERSION}; got {version}."
            )
        if model_name is None or not model_name.startswith("openai/"):
            raise ValueError("The DeepSWE ablation requires Pier's direct OpenAI model route.")

        self._cc_check_bundle_path = Path(cc_check_bundle_path).resolve()
        self._skill_path = Path(skill_path).resolve()
        self._pilot_manifest_path = Path(pilot_manifest_path).resolve()
        self._harness_lock_path = Path(harness_lock_path).resolve()
        self._cc_check_bundle_sha256 = cc_check_bundle_sha256
        self._skill_sha256 = skill_sha256
        self._pilot_manifest_sha256 = pilot_manifest_sha256
        self._harness_lock_sha256 = harness_lock_sha256
        self._expected_prompt_extension_sha256 = prompt_extension_sha256
        self._frozen_reasoning_effort = reasoning_effort

        self._verify_digest(self._cc_check_bundle_path, cc_check_bundle_sha256, "cc-check bundle")
        self._verify_digest(self._skill_path, skill_sha256, "code-contracts skill")
        self._verify_digest(self._pilot_manifest_path, pilot_manifest_sha256, "pilot manifest")
        self._verify_digest(self._harness_lock_path, harness_lock_sha256, "harness lock")
        self._skill_content = self._skill_path.read_text()
        self._deep_swe_commit = json.loads(self._pilot_manifest_path.read_text())["deep_swe_commit"]
        self._prompt_extension = (
            skill_prompt_extension(self._skill_content) if self.VARIANT == "code-contracts" else ""
        )
        actual_extension_digest = sha256_bytes(self._prompt_extension.encode())
        if actual_extension_digest != prompt_extension_sha256:
            raise ValueError(
                "Prompt extension digest mismatch: "
                f"expected {prompt_extension_sha256}, got {actual_extension_digest}."
            )

        super().__init__(
            logs_dir=logs_dir,
            model_name=model_name,
            version=version,
            reasoning_effort=reasoning_effort,
            **kwargs,
        )

    @staticmethod
    def name() -> str:
        # The shared name makes Pier reuse an identical install-spec fingerprint for both arms.
        return "mini-swe-agent"

    def to_agent_info(self):
        return super().to_agent_info().model_copy(update={"name": self.VARIANT})

    @staticmethod
    def _verify_digest(path: Path, expected: str, label: str) -> None:
        if not path.is_file():
            raise FileNotFoundError(f"{label} not found: {path}")
        actual = sha256_file(path)
        if actual != expected:
            raise ValueError(f"{label} digest mismatch: expected {expected}, got {actual}.")

    def render_instruction(self, instruction: str) -> str:
        """@cc [author:spolu,label:evaluation] arm-prompt-boundary
        `control` returns the task instruction byte-for-byte; `code-contracts` appends exactly one
        frozen skill and activation-instruction extension with no task-specific or verifier-derived
        content.
        """
        return instruction + self._prompt_extension

    def install_spec(self) -> AgentInstallSpec:
        """@cc [author:spolu,label:evaluation] shared-install-parity
        Both variants return identical install specifications that verify pinned Node and
        `cc-check` payload digests before placing the same executables on `PATH`.
        """
        specification = super().install_spec()
        specification.steps.extend(self._cc_check_install_steps())
        specification.cache_key = specification.fingerprint()
        specification.metadata.update(
            {
                "cc_check_bundle_sha256": self._cc_check_bundle_sha256,
                "mini_swe_agent_version": MINI_SWE_AGENT_VERSION,
                "node_version": NODE_VERSION,
            }
        )
        return specification

    def _cc_check_install_steps(self) -> list[InstallStep]:
        encoded_bundle = base64.b64encode(self._cc_check_bundle_path.read_bytes()).decode()
        chunks = [
            encoded_bundle[index : index + BUNDLE_CHUNK_SIZE]
            for index in range(0, len(encoded_bundle), BUNDLE_CHUNK_SIZE)
        ]
        bundle_steps = [
            InstallStep(
                user="agent",
                run=(
                    ("rm -f /tmp/cc-check.tar.gz.b64\n" if index == 0 else "")
                    + f"printf '%s' '{chunk}' >> /tmp/cc-check.tar.gz.b64"
                ),
            )
            for index, chunk in enumerate(chunks)
        ]
        bundle_steps.append(InstallStep(user="agent", run=self._cc_check_install_command()))
        return bundle_steps

    def _cc_check_install_command(self) -> str:
        return f"""set -euo pipefail
source "$HOME/.local/bin/env"
python_bin="$(head -n 1 "$(command -v mini-swe-agent)" | sed 's/^#!//')"
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64)
    node_arch="x64"
    node_sha256="{NODE_ARCHIVE_SHA256["x64"]}"
    ;;
  aarch64|arm64)
    node_arch="arm64"
    node_sha256="{NODE_ARCHIVE_SHA256["arm64"]}"
    ;;
  *)
    echo "Unsupported architecture for pinned Node: $arch" >&2
    exit 1
    ;;
esac

node_dir="$HOME/.local/share/node-v{NODE_VERSION}-$node_arch"
node_archive="/tmp/node-v{NODE_VERSION}-linux-$node_arch.tar.gz"
curl -fsSLo "$node_archive" \
  "https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-linux-$node_arch.tar.gz"
actual_node_sha256="$("$python_bin" - "$node_archive" <<'PY'
import hashlib
import pathlib
import sys

print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
)"
if [ "$actual_node_sha256" != "$node_sha256" ]; then
  echo "Pinned Node archive digest mismatch" >&2
  exit 1
fi
rm -rf "$node_dir"
mkdir -p "$node_dir"
tar -xzf "$node_archive" --strip-components=1 -C "$node_dir"
ln -sfn "$node_dir/bin/node" "$HOME/.local/bin/node"
ln -sfn "$node_dir/bin/npm" "$HOME/.local/bin/npm"
ln -sfn "$node_dir/bin/npx" "$HOME/.local/bin/npx"
export PATH="$HOME/.local/bin:$PATH"

bundle_path="/tmp/cc-check.tar.gz"
"$python_bin" - /tmp/cc-check.tar.gz.b64 "$bundle_path" <<'PY'
import base64
import pathlib
import sys

payload = pathlib.Path(sys.argv[1]).read_bytes()
pathlib.Path(sys.argv[2]).write_bytes(base64.b64decode(payload))
PY
actual_bundle_sha256="sha256:$("$python_bin" - "$bundle_path" <<'PY'
import hashlib
import pathlib
import sys

print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
)"
if [ "$actual_bundle_sha256" != "{self._cc_check_bundle_sha256}" ]; then
  echo "cc-check bundle digest mismatch" >&2
  exit 1
fi

cc_check_dir="$HOME/.local/share/cc-check"
rm -rf "$cc_check_dir"
mkdir -p "$cc_check_dir"
tar -xzf "$bundle_path" -C "$cc_check_dir"
(
  cd "$cc_check_dir"
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
)
ln -sfn "$cc_check_dir/dist/cc-check.js" "$HOME/.local/bin/cc-check"
node --version
npm --version
cc-check --help
"""

    def network_allowlist(self) -> NetworkAllowlist:
        base_allowlist = super().network_allowlist()
        return NetworkAllowlist(
            domains=[*base_allowlist.domains, "nodejs.org", "registry.npmjs.org"]
        )

    def _secret_values(self) -> list[str]:
        secret_markers = ("CREDENTIAL", "KEY", "PASSWORD", "SECRET", "TOKEN")
        return [
            value
            for key, value in self._extra_env.items()
            if len(value) >= 4 and any(marker in key.upper() for marker in secret_markers)
        ]

    def _redact(self, value: str | None) -> str | None:
        if value is None:
            return None
        for secret in self._secret_values():
            value = value.replace(secret, "[REDACTED]")
        return value

    async def _exec(
        self,
        environment: BaseEnvironment,
        command: str,
        user: str | int | None = None,
        env: dict[str, str] | None = None,
        cwd: str | None = None,
        timeout_sec: int | None = None,
    ) -> Any:
        """@cc [author:spolu,label:security] runtime-secret-redaction
        Process environment values reach the sandbox unchanged, but secret values never appear in
        harness debug metadata, failure messages, or post-run provenance.
        """
        merged_env = dict(env) if env else {}
        merged_env.update(self._extra_env)
        redacted_env = {
            key: "[REDACTED]" if value in self._secret_values() else value
            for key, value in merged_env.items()
        }
        self.logger.debug(
            "Running command",
            extra={"user": str(user), "env": redacted_env},
        )
        result = await environment.exec(
            command=f"set -o pipefail; {command}",
            user=user,
            env=environment.agent_process_env(merged_env),
            cwd=cwd,
            timeout_sec=timeout_sec,
        )
        if result.return_code != 0:
            raise NonZeroAgentExitCodeError(
                f"Command failed (exit {result.return_code}): {command}\n"
                f"stdout: {self._redact(self._truncate_output(result.stdout))}\n"
                f"stderr: {self._redact(self._truncate_output(result.stderr))}"
            )
        return result

    def _write_provenance(self, instruction: str) -> None:
        """@cc [author:spolu,label:reproducibility] post-run-agent-provenance
        Post-run provenance contains only immutable identifiers, digests, and public configuration;
        it never contains task text, skill text, environment values, or credentials.
        """
        rendered_instruction = self.render_instruction(instruction)
        provenance = {
            "schema_version": 1,
            "activation_instruction_sha256": sha256_bytes(CODE_CONTRACTS_INSTRUCTIONS.encode()),
            "agent_source_sha256": sha256_file(Path(__file__)),
            "arm": self.VARIANT,
            "cc_check_bundle_sha256": self._cc_check_bundle_sha256,
            "deep_swe_commit": self._deep_swe_commit,
            "harness_lock_sha256": self._harness_lock_sha256,
            "mini_swe_agent_version": MINI_SWE_AGENT_VERSION,
            "model_name": self.model_name,
            "node_version": NODE_VERSION,
            "prompt_extension_sha256": sha256_bytes(self._prompt_extension.encode()),
            "pilot_manifest_sha256": self._pilot_manifest_sha256,
            "reasoning_effort": self._frozen_reasoning_effort,
            "resolved_prompt_sha256": sha256_bytes(rendered_instruction.encode()),
            "skill_sha256": self._skill_sha256,
        }
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        (self.logs_dir / PROVENANCE_FILENAME).write_text(
            json.dumps(provenance, indent=2, sort_keys=True) + "\n"
        )

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        try:
            await super().run(instruction, environment, context)
        finally:
            self._write_provenance(instruction)


class ControlAgent(_DeepSWEAgent):
    """Stock mini-swe-agent prompt with the shared deterministic installation."""

    VARIANT = "control"


class CodeContractsAgent(_DeepSWEAgent):
    """Mini-swe-agent with the frozen code-contracts skill appended to the task prompt."""

    VARIANT = "code-contracts"
