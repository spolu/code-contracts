from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from deepswe_eval.analyze import analyze_job, render_markdown


class AnalyzeTests(unittest.TestCase):
    @staticmethod
    def _write_manifest(root: Path) -> Path:
        path = root / "manifest.json"
        path.write_text(json.dumps({"tasks": [{"task_id": "task-a"}, {"task_id": "task-b"}]}))
        return path

    @staticmethod
    def _write_trial(root: Path, index: int, task: str, arm: str, reward: int) -> None:
        trial_name = f"{task}-{arm}-{index}"
        trial_dir = root / trial_name
        trial_dir.mkdir()
        (trial_dir / "result.json").write_text(
            json.dumps(
                {
                    "trial_name": trial_name,
                    "task_name": f"datacurve/{task}",
                    "agent_info": {"name": arm},
                    "verifier_result": {"rewards": {"reward": reward, "partial": reward}},
                }
            )
        )

    @staticmethod
    def _write_failure(root: Path, index: int, task: str, arm: str, error_type: str) -> None:
        trial_name = f"{task}-{arm}-failure-{index}"
        trial_dir = root / trial_name
        trial_dir.mkdir()
        (trial_dir / "result.json").write_text(
            json.dumps(
                {
                    "trial_name": trial_name,
                    "task_name": f"datacurve/{task}",
                    "agent_info": {"name": arm},
                    "verifier_result": None,
                    "exception_info": {"exception_type": error_type},
                }
            )
        )

    def test_balanced_pass_rates_and_pass_at_k(self) -> None:
        rewards = {
            ("control", "task-a"): [1, 0, 0],
            ("control", "task-b"): [0, 0, 0],
            ("code-contracts", "task-a"): [1, 1, 0],
            ("code-contracts", "task-b"): [1, 0, 0],
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = self._write_manifest(root)
            index = 0
            for (arm, task), values in rewards.items():
                for reward in values:
                    self._write_trial(root, index, task, arm, reward)
                    index += 1

            analysis = analyze_job(root, manifest, 3)

        control = analysis["arms"]["control"]
        treatment = analysis["arms"]["code-contracts"]
        self.assertAlmostEqual(control["micro_pass_rate"], 1 / 6)
        self.assertAlmostEqual(control["macro_pass_rate"], 1 / 6)
        self.assertAlmostEqual(control["pass_at_k"]["2"], 1 / 3)
        self.assertAlmostEqual(control["pass_at_k"]["3"], 1 / 2)
        self.assertAlmostEqual(treatment["micro_pass_rate"], 1 / 2)
        self.assertAlmostEqual(treatment["pass_at_k"]["2"], 5 / 6)
        self.assertAlmostEqual(treatment["pass_at_k"]["3"], 1.0)
        markdown = render_markdown(analysis)
        self.assertIn("| code-contracts | 3/6 |", markdown)
        self.assertIn("| code-contracts - control | +2 |", markdown)
        self.assertIn("Excluded infrastructure failures:\n\nNone.", markdown)

    def test_incomplete_cells_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = self._write_manifest(root)
            self._write_trial(root, 0, "task-a", "control", 1)

            with self.assertRaisesRegex(ValueError, "Every task/arm cell"):
                analyze_job(root, manifest, 3)

    def test_digest_pinned_full_manifest_selection(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_manifest = root / "source-manifest.json"
            source_manifest.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {"task_id": "task-a"},
                            {"task_id": "task-js"},
                            {"task_id": "task-b"},
                        ]
                    }
                )
            )
            source_digest = f"sha256:{hashlib.sha256(source_manifest.read_bytes()).hexdigest()}"
            manifest = root / "full-manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "version": "full-v1",
                        "source_manifest_sha256": source_digest,
                        "selection": {"task_count": 2},
                        "excluded_tasks": ["task-js"],
                    }
                )
            )
            index = 0
            for arm in ("control", "code-contracts"):
                for task in ("task-a", "task-b"):
                    for reward in (1, 0, 0):
                        self._write_trial(root, index, task, arm, reward)
                        index += 1

            analysis = analyze_job(
                root,
                manifest,
                3,
                source_manifest_path=source_manifest,
            )

        self.assertEqual(analysis["n_tasks"], 2)
        self.assertEqual(analysis["arms"]["control"]["passed"], 2)
        self.assertEqual(analysis["arms"]["code-contracts"]["passed"], 2)

    def test_allowed_infrastructure_failure_is_reported_and_excluded(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = self._write_manifest(root)
            index = 0
            for arm in ("control", "code-contracts"):
                for task in ("task-a", "task-b"):
                    for reward in (1, 0, 0):
                        self._write_trial(root, index, task, arm, reward)
                        index += 1
            self._write_failure(root, index, "task-a", "control", "VerifierTimeoutError")

            analysis = analyze_job(
                root,
                manifest,
                3,
                frozenset({"VerifierTimeoutError"}),
            )

        self.assertEqual(
            analysis["excluded_infrastructure_failures"],
            [
                {
                    "trial_name": f"task-a-control-failure-{index}",
                    "task": "task-a",
                    "arm": "control",
                    "error_type": "VerifierTimeoutError",
                }
            ],
        )
        self.assertIn(
            f"- `task-a-control-failure-{index}`: `control/task-a` (`VerifierTimeoutError`)",
            render_markdown(analysis),
        )

    def test_allowed_infrastructure_failure_for_unexpected_task_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = self._write_manifest(root)
            self._write_failure(root, 0, "task-c", "control", "VerifierTimeoutError")

            with self.assertRaisesRegex(ValueError, "Unexpected task in job failures"):
                analyze_job(
                    root,
                    manifest,
                    3,
                    frozenset({"VerifierTimeoutError"}),
                )


if __name__ == "__main__":
    unittest.main()
