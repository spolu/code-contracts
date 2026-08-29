from __future__ import annotations

import asyncio
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from pier.agents.installed.base import NonZeroAgentExitCodeError

from deepswe_eval.agents import CodeContractsAgent, ControlAgent

EVAL_ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((EVAL_ROOT / "config" / "phase1.json").read_text())


def _agent(agent_class, logs_dir: Path):
    config = next(
        agent
        for agent in CONFIG["agents"]
        if agent["import_path"].endswith(f":{agent_class.__name__}")
    )
    return agent_class(
        logs_dir=logs_dir,
        model_name=config["model_name"],
        **config["kwargs"],
    )


class AgentTests(unittest.TestCase):
    def test_arm_prompts_and_install_specs_are_matched(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            control = _agent(ControlAgent, root / "control")
            treatment = _agent(CodeContractsAgent, root / "code-contracts")

            instruction = "Keep this instruction unchanged."
            self.assertEqual(control.render_instruction(instruction), instruction)
            self.assertTrue(treatment.render_instruction(instruction).startswith(instruction))
            self.assertEqual(
                control.install_spec().model_dump(), treatment.install_spec().model_dump()
            )
            self.assertEqual(
                control.install_spec().fingerprint(), treatment.install_spec().fingerprint()
            )
            for step in control.install_spec().steps:
                subprocess.run(["bash", "-n"], input=step.run, text=True, check=True)

    def test_provenance_contains_no_prompt_skill_or_secret(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            logs_dir = Path(temporary_directory)
            agent = _agent(ControlAgent, logs_dir)
            agent._extra_env["OPENAI_API_KEY"] = "test-secret-value"
            instruction = "private task instruction marker"

            agent._write_provenance(instruction)

            serialized = (logs_dir / "deepswe-provenance.json").read_text()
            self.assertNotIn(instruction, serialized)
            self.assertNotIn(agent._skill_content, serialized)
            self.assertNotIn("test-secret-value", serialized)
            provenance = json.loads(serialized)
            self.assertEqual(provenance["arm"], "control")
            self.assertIn("resolved_prompt_sha256", provenance)

    def test_exec_passes_but_does_not_report_secret_values(self) -> None:
        class FailingEnvironment:
            received_env = None

            @staticmethod
            def agent_process_env(env):
                return env

            async def exec(self, **kwargs):
                self.received_env = kwargs["env"]
                return SimpleNamespace(
                    return_code=1,
                    stdout="provider repeated test-secret-value",
                    stderr="test-secret-value failed",
                )

        with tempfile.TemporaryDirectory() as temporary_directory:
            agent = _agent(ControlAgent, Path(temporary_directory))
            agent._extra_env["OPENAI_API_KEY"] = "test-secret-value"
            environment = FailingEnvironment()

            with self.assertRaises(NonZeroAgentExitCodeError) as raised:
                asyncio.run(agent._exec(environment, "false"))

            self.assertEqual(environment.received_env["OPENAI_API_KEY"], "test-secret-value")
            self.assertNotIn("test-secret-value", str(raised.exception))
            self.assertIn("[REDACTED]", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
