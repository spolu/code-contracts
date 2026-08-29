from __future__ import annotations

import argparse
import copy
import hashlib
import json
import tarfile
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

from pier.models.job.config import JobConfig

from deepswe_eval.agents import (
    CODE_CONTRACTS_INSTRUCTIONS,
    CodeContractsAgent,
    ControlAgent,
    sha256_bytes,
    sha256_file,
    skill_prompt_extension,
)

EVAL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = EVAL_ROOT / "config" / "ablation.json"
DEFAULT_MANIFEST = EVAL_ROOT / "config" / "pilot-v1.json"
DEFAULT_PROMPT_V2_SMOKE = EVAL_ROOT / "config" / "prompt-v2-smoke.json"
EXPECTED_ARMS = {
    "deepswe_eval.agents:CodeContractsAgent": CodeContractsAgent,
    "deepswe_eval.agents:ControlAgent": ControlAgent,
}


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise TypeError(f"Expected a JSON object in {path}.")
    return value


def _agent_config_without_arm(agent: dict[str, Any]) -> dict[str, Any]:
    normalized = copy.deepcopy(agent)
    normalized.pop("import_path")
    normalized["kwargs"].pop("prompt_extension_sha256")
    return normalized


def _assert_config_parity(config: dict[str, Any]) -> None:
    pier_config = JobConfig.model_validate(config)
    serialized_config = pier_config.model_dump(mode="json")
    if any(
        agent["env"] != {"OPENAI_API_KEY": "${OPENAI_API_KEY}"}
        for agent in serialized_config["agents"]
    ):
        raise ValueError("Pier serialization must preserve the API key placeholder.")
    agents = config.get("agents")
    if not isinstance(agents, list) or len(agents) != 2:
        raise ValueError("Ablation config must contain exactly two agents.")
    import_paths = {agent.get("import_path") for agent in agents}
    if import_paths != set(EXPECTED_ARMS):
        raise ValueError(f"Unexpected agent imports: {sorted(import_paths)}")
    if _agent_config_without_arm(agents[0]) != _agent_config_without_arm(agents[1]):
        raise ValueError(
            "Arm configuration drift exceeds the allowed agent identity and prompt digest fields."
        )
    for agent in agents:
        if agent.get("model_name") != "openai/gpt-5.6-luna":
            raise ValueError("The ablation must use gpt-5.6-luna through Pier's OpenAI route.")
        if agent.get("env") != {"OPENAI_API_KEY": "${OPENAI_API_KEY}"}:
            raise ValueError("OPENAI_API_KEY must remain a runtime-only environment placeholder.")


def _assert_bundle(path: Path, expected_digest: str) -> None:
    if sha256_file(path) != expected_digest:
        raise ValueError("Configured cc-check bundle digest does not match the artifact.")
    with tarfile.open(path, mode="r:gz") as archive:
        names = set(archive.getnames())
        if "package.json" not in names or "package-lock.json" not in names:
            raise ValueError("cc-check bundle is missing its npm manifests.")
        if "dist/cc-check.js" not in names:
            raise ValueError("cc-check bundle is missing the compiled CLI entry point.")
        if any(name.startswith("/") or ".." in Path(name).parts for name in names):
            raise ValueError("cc-check bundle contains an unsafe archive path.")


def _assert_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("version") != "pilot-v1":
        raise ValueError("Unexpected pilot manifest version.")
    if not isinstance(manifest.get("deep_swe_commit"), str):
        raise TypeError("Pilot manifest must pin a DeepSWE commit.")
    tasks = manifest.get("tasks")
    if not isinstance(tasks, list) or len(tasks) != 12:
        raise ValueError("pilot-v1 must contain exactly twelve scored tasks.")
    language_counts = Counter(task["language"] for task in tasks)
    if language_counts != Counter({"typescript": 4, "go": 3, "python": 3, "rust": 2}):
        raise ValueError(f"Unexpected pilot language quotas: {language_counts}")
    if len({task["repository"] for task in tasks}) != len(tasks):
        raise ValueError("pilot-v1 must use one task per repository.")
    if any(task["language"] == "javascript" for task in tasks):
        raise ValueError("JavaScript tasks are out of scope for pilot-v1.")
    for task in tasks:
        expected = hashlib.sha256(f"code-contracts-pilot-v1:{task['task_id']}".encode()).hexdigest()
        if task.get("selection_sha256") != expected:
            raise ValueError(f"Selection digest mismatch for {task['task_id']}.")

    smoke_tasks = manifest.get("smoke_tasks")
    if not isinstance(smoke_tasks, list) or len(smoke_tasks) != 2:
        raise ValueError("pilot-v1 must reserve exactly two unscored smoke tasks.")
    pilot_ids = {task["task_id"] for task in tasks}
    if pilot_ids.intersection(task["task_id"] for task in smoke_tasks):
        raise ValueError("Smoke tasks must not overlap the scored pilot.")
    for task in smoke_tasks:
        if task["language"] not in {"typescript", "python", "go", "rust"}:
            raise ValueError("Smoke tasks must use an included pilot language.")
        expected = hashlib.sha256(f"code-contracts-smoke-v1:{task['task_id']}".encode()).hexdigest()
        if task.get("selection_sha256") != expected:
            raise ValueError(f"Smoke selection digest mismatch for {task['task_id']}.")


def _assert_prompt_v2_smoke(smoke: dict[str, Any], pilot: dict[str, Any]) -> None:
    if smoke.get("version") != "prompt-v2-smoke":
        raise ValueError("Unexpected prompt-v2 smoke manifest version.")
    if smoke.get("deep_swe_commit") != pilot.get("deep_swe_commit"):
        raise ValueError("Prompt-v2 smoke and pilot manifests must pin the same DeepSWE commit.")
    tasks = smoke.get("tasks")
    if not isinstance(tasks, list) or len(tasks) != 1:
        raise ValueError("Prompt-v2 smoke manifest must contain exactly one task.")
    task = tasks[0]
    excluded_ids = {
        item["task_id"] for key in ("tasks", "smoke_tasks") for item in pilot.get(key, [])
    }
    if task.get("task_id") in excluded_ids:
        raise ValueError("Prompt-v2 smoke task must not overlap pilot-v1 tasks.")
    if task.get("language") not in {"typescript", "python", "go", "rust"}:
        raise ValueError("Prompt-v2 smoke task must use an included language.")
    expected = hashlib.sha256(f"code-contracts-smoke-v2:{task.get('task_id')}".encode()).hexdigest()
    if task.get("selection_sha256") != expected:
        raise ValueError("Prompt-v2 smoke selection digest mismatch.")


def run_preflight(
    config_path: Path,
    manifest_path: Path,
    prompt_v2_smoke_path: Path = DEFAULT_PROMPT_V2_SMOKE,
) -> None:
    config = _load_json(config_path)
    manifest = _load_json(manifest_path)
    prompt_v2_smoke = _load_json(prompt_v2_smoke_path)
    _assert_config_parity(config)
    _assert_manifest(manifest)
    _assert_prompt_v2_smoke(prompt_v2_smoke, manifest)

    agents = config["agents"]
    shared_kwargs = agents[0]["kwargs"]
    bundle_path = EVAL_ROOT / "artifacts" / "cc-check.tar.gz"
    _assert_bundle(bundle_path, shared_kwargs["cc_check_bundle_sha256"])

    with tempfile.TemporaryDirectory() as temporary_directory:
        instances = []
        for agent_config in agents:
            agent_class = EXPECTED_ARMS[agent_config["import_path"]]
            instances.append(
                agent_class(
                    logs_dir=Path(temporary_directory) / agent_class.VARIANT,
                    model_name=agent_config["model_name"],
                    **agent_config["kwargs"],
                )
            )

        by_arm = {agent.VARIANT: agent for agent in instances}
        control = by_arm["control"]
        treatment = by_arm["code-contracts"]
        if control.install_spec().model_dump() != treatment.install_spec().model_dump():
            raise ValueError("The two arm install specifications are not identical.")
        if control.install_spec().fingerprint() != treatment.install_spec().fingerprint():
            raise ValueError("The two arm install fingerprints are not identical.")

        sample_instruction = "Implement the requested change."
        if control.render_instruction(sample_instruction) != sample_instruction:
            raise ValueError("Control prompt is not byte-for-byte neutral.")
        expected_treatment = sample_instruction + skill_prompt_extension(treatment._skill_content)
        if treatment.render_instruction(sample_instruction) != expected_treatment:
            raise ValueError(
                "Treatment prompt does not contain exactly the frozen skill extension."
            )
        if CODE_CONTRACTS_INSTRUCTIONS not in treatment.render_instruction(sample_instruction):
            raise ValueError("Treatment prompt is missing the frozen activation instructions.")
        if CODE_CONTRACTS_INSTRUCTIONS in control.render_instruction(sample_instruction):
            raise ValueError("Control prompt contains the treatment activation instructions.")
        if control.to_agent_info().name != "control":
            raise ValueError("Control result identity is incorrect.")
        if treatment.to_agent_info().name != "code-contracts":
            raise ValueError("Treatment result identity is incorrect.")
        config_by_arm = {EXPECTED_ARMS[agent["import_path"]].VARIANT: agent for agent in agents}
        if sha256_bytes(treatment._prompt_extension.encode()) != config_by_arm["code-contracts"][
            "kwargs"
        ].get("prompt_extension_sha256"):
            raise ValueError("Treatment prompt extension digest is not recorded in the config.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate the frozen DeepSWE ablation harness.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--prompt-v2-smoke", type=Path, default=DEFAULT_PROMPT_V2_SMOKE)
    arguments = parser.parse_args()
    run_preflight(
        arguments.config.resolve(),
        arguments.manifest.resolve(),
        arguments.prompt_v2_smoke.resolve(),
    )
    print("DeepSWE ablation preflight passed.")


if __name__ == "__main__":
    main()
