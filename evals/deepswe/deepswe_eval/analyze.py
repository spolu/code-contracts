from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

EVAL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = EVAL_ROOT / "config" / "pilot-v1.json"
EXPECTED_ARMS = ("control", "code-contracts")


@dataclass(frozen=True)
class TrialOutcome:
    task: str
    arm: str
    reward: int


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise TypeError(f"Expected a JSON object in {path}.")
    return value


def _task_id(task_name: str) -> str:
    return task_name.rsplit("/", maxsplit=1)[-1]


def collect_outcomes(job_dir: Path) -> list[TrialOutcome]:
    """@cc [author:spolu,label:evaluation] aggregate-public-results
    Analysis reads only each trial's public `result.json`, treats `verifier_result.rewards.reward` as
    the binary outcome, and rejects missing, duplicate, unexpected-arm, or non-binary results.
    """
    result_paths = sorted(job_dir.glob("*/result.json"))
    if not result_paths:
        raise FileNotFoundError(f"No trial results found under {job_dir}.")

    outcomes: list[TrialOutcome] = []
    trial_names: set[str] = set()
    for result_path in result_paths:
        result = _load_json(result_path)
        trial_name = result.get("trial_name")
        if not isinstance(trial_name, str) or not trial_name:
            raise ValueError(f"Trial name missing in {result_path}.")
        if trial_name in trial_names:
            raise ValueError(f"Duplicate trial name: {trial_name}.")
        trial_names.add(trial_name)

        task_name = result.get("task_name")
        if not isinstance(task_name, str) or not task_name:
            raise ValueError(f"Task name missing in {result_path}.")
        agent_info = result.get("agent_info")
        arm = agent_info.get("name") if isinstance(agent_info, dict) else None
        if arm not in EXPECTED_ARMS:
            raise ValueError(f"Unexpected arm {arm!r} in {result_path}.")

        verifier_result = result.get("verifier_result")
        rewards = verifier_result.get("rewards") if isinstance(verifier_result, dict) else None
        reward = rewards.get("reward") if isinstance(rewards, dict) else None
        if not isinstance(reward, int | float) or reward not in (0, 1):
            raise ValueError(f"Missing or non-binary reward in {result_path}.")
        outcomes.append(TrialOutcome(task=_task_id(task_name), arm=arm, reward=int(reward)))

    return outcomes


def _pass_at_k(n: int, successes: int, k: int) -> float:
    """@cc [author:spolu,label:evaluation] finite-sample-pass-at-k
    For `n` attempts with `successes` passes, pass@k is the unbiased finite-sample estimator
    `1 - C(n - successes, k) / C(n, k)` for `1 <= k <= n`.
    """
    if not 1 <= k <= n:
        raise ValueError(f"k must be between 1 and n; got k={k}, n={n}.")
    if not 0 <= successes <= n:
        raise ValueError(f"successes must be between 0 and n; got {successes}.")
    if n - successes < k:
        return 1.0
    return 1.0 - math.comb(n - successes, k) / math.comb(n, k)


def analyze_job(job_dir: Path, manifest_path: Path, expected_attempts: int) -> dict[str, Any]:
    """@cc [author:spolu,label:evaluation] balanced-pilot-analysis
    Pilot analysis requires exactly `expected_attempts` binary results for every manifest task and
    arm, then reports micro/macro pass rates and task-macro pass@k for every `1 <= k <= attempts`.
    """
    if expected_attempts < 1:
        raise ValueError("Expected attempts must be positive.")
    manifest = _load_json(manifest_path)
    tasks = [task["task_id"] for task in manifest.get("tasks", [])]
    if not tasks or len(tasks) != len(set(tasks)):
        raise ValueError("Manifest tasks must be a non-empty unique list.")

    outcomes = collect_outcomes(job_dir)
    cells: dict[tuple[str, str], list[int]] = defaultdict(list)
    expected_tasks = set(tasks)
    for outcome in outcomes:
        if outcome.task not in expected_tasks:
            raise ValueError(f"Unexpected task in job results: {outcome.task}.")
        cells[(outcome.arm, outcome.task)].append(outcome.reward)

    incomplete = {
        f"{arm}/{task}": len(cells[(arm, task)])
        for arm in EXPECTED_ARMS
        for task in tasks
        if len(cells[(arm, task)]) != expected_attempts
    }
    if incomplete:
        raise ValueError(
            f"Every task/arm cell must contain {expected_attempts} results; got {incomplete}."
        )

    k_values = list(range(1, expected_attempts + 1))
    arm_results: dict[str, Any] = {}
    for arm in EXPECTED_ARMS:
        task_results: dict[str, Any] = {}
        for task in tasks:
            rewards = cells[(arm, task)]
            passed = sum(rewards)
            task_results[task] = {
                "passed": passed,
                "attempts": expected_attempts,
                "pass_rate": passed / expected_attempts,
                "pass_at_k": {str(k): _pass_at_k(expected_attempts, passed, k) for k in k_values},
            }

        total_passed = sum(result["passed"] for result in task_results.values())
        total_trials = len(tasks) * expected_attempts
        arm_results[arm] = {
            "passed": total_passed,
            "trials": total_trials,
            "micro_pass_rate": total_passed / total_trials,
            "macro_pass_rate": sum(result["pass_rate"] for result in task_results.values())
            / len(tasks),
            "pass_at_k": {
                str(k): sum(result["pass_at_k"][str(k)] for result in task_results.values())
                / len(tasks)
                for k in k_values
            },
            "tasks": task_results,
        }

    treatment = arm_results["code-contracts"]
    control = arm_results["control"]
    return {
        "schema_version": 1,
        "job_dir": str(job_dir),
        "manifest": str(manifest_path),
        "n_tasks": len(tasks),
        "attempts_per_task_arm": expected_attempts,
        "arms": arm_results,
        "treatment_minus_control": {
            "micro_pass_rate": treatment["micro_pass_rate"] - control["micro_pass_rate"],
            "macro_pass_rate": treatment["macro_pass_rate"] - control["macro_pass_rate"],
            "pass_at_k": {
                str(k): treatment["pass_at_k"][str(k)] - control["pass_at_k"][str(k)]
                for k in k_values
            },
        },
    }


def render_markdown(analysis: dict[str, Any]) -> str:
    attempts = analysis["attempts_per_task_arm"]
    k_values = list(range(1, attempts + 1))
    headers = ["Arm", "Passed", "Micro pass rate", "Macro pass rate"] + [
        f"pass@{k}" for k in k_values
    ]
    rows = []
    for arm in EXPECTED_ARMS:
        result = analysis["arms"][arm]
        rows.append(
            [
                arm,
                f"{result['passed']}/{result['trials']}",
                f"{result['micro_pass_rate']:.4f}",
                f"{result['macro_pass_rate']:.4f}",
                *[f"{result['pass_at_k'][str(k)]:.4f}" for k in k_values],
            ]
        )

    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
        *("| " + " | ".join(row) + " |" for row in rows),
        "",
        "| Task | Control | Code-contracts | Pass-rate delta |",
        "| --- | --- | --- | --- |",
    ]
    control_tasks = analysis["arms"]["control"]["tasks"]
    treatment_tasks = analysis["arms"]["code-contracts"]["tasks"]
    for task, control in control_tasks.items():
        treatment = treatment_tasks[task]
        lines.append(
            "| "
            + " | ".join(
                [
                    task,
                    f"{control['passed']}/{control['attempts']}",
                    f"{treatment['passed']}/{treatment['attempts']}",
                    f"{treatment['pass_rate'] - control['pass_rate']:+.4f}",
                ]
            )
            + " |"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze a matched DeepSWE pilot job.")
    parser.add_argument("job_dir", type=Path)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--attempts", type=int, required=True)
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    arguments = parser.parse_args()
    analysis = analyze_job(
        arguments.job_dir.resolve(), arguments.manifest.resolve(), arguments.attempts
    )
    if arguments.format == "json":
        print(json.dumps(analysis, indent=2, sort_keys=True))
    else:
        print(render_markdown(analysis))


if __name__ == "__main__":
    main()
