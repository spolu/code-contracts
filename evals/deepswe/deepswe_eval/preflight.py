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

from harbor.models.job.config import JobConfig as HarborJobConfig
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
DEFAULT_PROMPT_V3_SMOKE = EVAL_ROOT / "config" / "prompt-v3-smoke.json"
DEFAULT_PROMPT_V4_SMOKE = EVAL_ROOT / "config" / "prompt-v4-smoke.json"
DEFAULT_PHASE3_CONFIG = EVAL_ROOT / "config" / "phase3-luna.json"
DEFAULT_PHASE4_CONFIG = EVAL_ROOT / "config" / "phase4-terra-xhigh-k4.json"
DEFAULT_FULL_MANIFEST = EVAL_ROOT / "config" / "full-v1.json"
DEFAULT_PHASE5_CONFIG = EVAL_ROOT / "config" / "full-v1-luna-k3.json"
DEFAULT_PHASE5_RELAUNCH_CONFIG = EVAL_ROOT / "config" / "full-v1-luna-k3-relaunch-01.json"
DEFAULT_PHASE5_RELAUNCH_02_CONFIG = EVAL_ROOT / "config" / "full-v1-luna-k3-relaunch-02.json"
DEFAULT_PHASE5_REPLACEMENT_CONTROL_PWNTOOLS = (
    EVAL_ROOT / "config" / "full-v1-luna-k3-replacement-01-control-pwntools.json"
)
DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_PWNTOOLS = (
    EVAL_ROOT / "config" / "full-v1-luna-k3-replacement-01-code-contracts-pwntools.json"
)
DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_AIOMONITOR = (
    EVAL_ROOT / "config" / "full-v1-luna-k3-replacement-01-code-contracts-aiomonitor.json"
)
DEFAULT_PHASE5_REGRADE_CONTROL_PWNTOOLS = (
    EVAL_ROOT / "config" / "full-v1-luna-k3-regrade-01-control-pwntools.json"
)
DEFAULT_PHASE5_REGRADE_CODE_CONTRACTS_PWNTOOLS = (
    EVAL_ROOT / "config" / "full-v1-luna-k3-regrade-01-code-contracts-pwntools.json"
)
DEFAULT_FULL_FALLBACK_MANIFEST = EVAL_ROOT / "config" / "full-v1-minus-pwntools.json"
SOURCE_DEEPSWE_MANIFEST = EVAL_ROOT / "resolved" / "deep-swe" / "tasks" / "manifest.json"
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


def _assert_prompt_v3_smoke(
    smoke: dict[str, Any], pilot: dict[str, Any], prompt_v2_smoke: dict[str, Any]
) -> None:
    if smoke.get("version") != "prompt-v3-smoke":
        raise ValueError("Unexpected prompt-v3 smoke manifest version.")
    if smoke.get("deep_swe_commit") != pilot.get("deep_swe_commit"):
        raise ValueError("Prompt-v3 smoke and pilot manifests must pin the same DeepSWE commit.")
    tasks = smoke.get("tasks")
    if not isinstance(tasks, list) or len(tasks) != 1:
        raise ValueError("Prompt-v3 smoke manifest must contain exactly one task.")
    task = tasks[0]
    excluded_ids = {
        item["task_id"] for key in ("tasks", "smoke_tasks") for item in pilot.get(key, [])
    }
    excluded_ids.update(item["task_id"] for item in prompt_v2_smoke.get("tasks", []))
    if task.get("task_id") in excluded_ids:
        raise ValueError("Prompt-v3 smoke task must not overlap prior pilot or prompt-smoke tasks.")
    if task.get("language") not in {"typescript", "python", "go", "rust"}:
        raise ValueError("Prompt-v3 smoke task must use an included language.")
    expected = hashlib.sha256(f"code-contracts-smoke-v3:{task.get('task_id')}".encode()).hexdigest()
    if task.get("selection_sha256") != expected:
        raise ValueError("Prompt-v3 smoke selection digest mismatch.")


def _assert_prompt_v4_smoke(
    smoke: dict[str, Any],
    pilot: dict[str, Any],
    prior_prompt_smokes: tuple[dict[str, Any], ...],
) -> None:
    if smoke.get("version") != "prompt-v4-smoke":
        raise ValueError("Unexpected prompt-v4 smoke manifest version.")
    if smoke.get("deep_swe_commit") != pilot.get("deep_swe_commit"):
        raise ValueError("Prompt-v4 smoke and pilot manifests must pin the same DeepSWE commit.")
    tasks = smoke.get("tasks")
    if not isinstance(tasks, list) or len(tasks) != 1:
        raise ValueError("Prompt-v4 smoke manifest must contain exactly one task.")
    task = tasks[0]
    excluded_ids = {
        item["task_id"] for key in ("tasks", "smoke_tasks") for item in pilot.get(key, [])
    }
    for prior_smoke in prior_prompt_smokes:
        excluded_ids.update(item["task_id"] for item in prior_smoke.get("tasks", []))
    if task.get("task_id") in excluded_ids:
        raise ValueError("Prompt-v4 smoke task must not overlap prior pilot or prompt-smoke tasks.")
    if task.get("language") not in {"typescript", "python", "go", "rust"}:
        raise ValueError("Prompt-v4 smoke task must use an included language.")
    expected = hashlib.sha256(f"code-contracts-smoke-v4:{task.get('task_id')}".encode()).hexdigest()
    if task.get("selection_sha256") != expected:
        raise ValueError("Prompt-v4 smoke selection digest mismatch.")


def _assert_phase3_config(
    phase3_config: dict[str, Any], ablation_config: dict[str, Any], pilot: dict[str, Any]
) -> None:
    """@cc [author:spolu,label:evaluation] frozen-phase3-config
    Phase 3 differs from the frozen ablation config only by its job name, exactly three attempts,
    concurrency four, and a dataset containing the twelve pilot tasks in manifest order.
    """
    JobConfig.model_validate(phase3_config)
    task_names = [task["task_id"] for task in pilot["tasks"]]
    expected = copy.deepcopy(ablation_config)
    expected.update(
        {
            "job_name": "pilot-v1-luna-k3",
            "n_attempts": 3,
            "n_concurrent_trials": 4,
            "datasets": [
                {
                    "path": "resolved/deep-swe/tasks",
                    "task_names": task_names,
                }
            ],
        }
    )
    if phase3_config != expected:
        raise ValueError(
            "Phase 3 must differ from the frozen ablation only in its preregistered run settings."
        )

    task_root = EVAL_ROOT / phase3_config["datasets"][0]["path"]
    missing_tasks = [task_name for task_name in task_names if not (task_root / task_name).is_dir()]
    if missing_tasks:
        raise FileNotFoundError(f"Phase 3 task directories are missing: {missing_tasks}")


def _assert_phase4_config(phase4_config: dict[str, Any], phase3_config: dict[str, Any]) -> None:
    """@cc [author:spolu,label:evaluation] frozen-phase4-config
    The Terra pilot differs from Phase 3 only by job name, four attempts, concurrency eight,
    `openai/gpt-5.6-terra`, and `xhigh` reasoning in both arms.
    """
    JobConfig.model_validate(phase4_config)
    expected = copy.deepcopy(phase3_config)
    expected.update(
        {
            "job_name": "pilot-v1-terra-xhigh-k4",
            "n_attempts": 4,
            "n_concurrent_trials": 8,
        }
    )
    for agent in expected["agents"]:
        agent["model_name"] = "openai/gpt-5.6-terra"
        agent["kwargs"]["reasoning_effort"] = "xhigh"
    if phase4_config != expected:
        raise ValueError(
            "Phase 4 must differ from Phase 3 only in its preregistered Terra run settings."
        )


def _assert_full_manifest(full_manifest: dict[str, Any], pilot: dict[str, Any]) -> None:
    """@cc [author:spolu,label:evaluation] full-v1-selection
    `full-v1` contains every TypeScript, Python, Go, and Rust task and excludes exactly the five
    JavaScript tasks from the pinned 113-task DeepSWE source manifest.
    """
    source_manifest = _load_json(SOURCE_DEEPSWE_MANIFEST)
    if full_manifest.get("version") != "full-v1":
        raise ValueError("Unexpected full-corpus manifest version.")
    if full_manifest.get("deep_swe_commit") != pilot.get("deep_swe_commit"):
        raise ValueError("Full and pilot manifests must pin the same DeepSWE commit.")
    if full_manifest.get("source_dataset") != source_manifest.get("dataset"):
        raise ValueError("Full manifest must identify the pinned DeepSWE source dataset.")
    if full_manifest.get("source_manifest_sha256") != sha256_file(SOURCE_DEEPSWE_MANIFEST):
        raise ValueError("Full manifest source digest does not match DeepSWE's task manifest.")

    source_tasks = source_manifest.get("tasks")
    if not isinstance(source_tasks, list) or len(source_tasks) != 113:
        raise ValueError("The pinned DeepSWE source manifest must contain 113 tasks.")
    language_counts = Counter(task["language"] for task in source_tasks)
    expected_source_counts = Counter(
        {"typescript": 35, "python": 34, "go": 34, "rust": 5, "javascript": 5}
    )
    if language_counts != expected_source_counts:
        raise ValueError(f"Unexpected full-corpus source languages: {language_counts}")

    excluded_tasks = sorted(
        task["task_id"] for task in source_tasks if task["language"] == "javascript"
    )
    if full_manifest.get("excluded_tasks") != excluded_tasks:
        raise ValueError("full-v1 must exclude exactly the five JavaScript tasks.")
    expected_selection = {
        "algorithm": (
            "Include every source-manifest task whose language is TypeScript, Python, Go, or "
            "Rust; exclude JavaScript."
        ),
        "included_languages": ["typescript", "python", "go", "rust"],
        "excluded_languages": ["javascript"],
        "language_counts": {"typescript": 35, "python": 34, "go": 34, "rust": 5},
        "task_count": 108,
    }
    if full_manifest.get("selection") != expected_selection:
        raise ValueError("Unexpected full-v1 selection metadata.")
    if full_manifest.get("source_task_count") != len(source_tasks):
        raise ValueError("Full manifest source task count is inconsistent.")

    task_root = SOURCE_DEEPSWE_MANIFEST.parent
    actual_task_ids = {path.name for path in task_root.iterdir() if path.is_dir()}
    source_task_ids = {task["task_id"] for task in source_tasks}
    if actual_task_ids != source_task_ids:
        raise ValueError("Resolved DeepSWE task directories do not match the source manifest.")


def _assert_full_fallback_manifest(
    fallback_manifest: dict[str, Any], full_manifest: dict[str, Any]
) -> None:
    """@cc [author:spolu,label:evaluation] frozen-pwntools-exclusion-fallback
    The predeclared fallback differs from `full-v1` only by excluding
    `pwntools-tube-multiplexing` and reducing the Python and total task counts by one.
    """
    expected = copy.deepcopy(full_manifest)
    expected["version"] = "full-v1-minus-pwntools"
    expected["selection"]["algorithm"] = (
        "Include every source-manifest task whose language is TypeScript, Python, Go, or Rust; "
        "exclude JavaScript and pwntools-tube-multiplexing."
    )
    expected["selection"]["language_counts"]["python"] = 33
    expected["selection"]["task_count"] = 107
    expected["excluded_tasks"] = sorted(
        [*full_manifest["excluded_tasks"], "pwntools-tube-multiplexing"]
    )
    if fallback_manifest != expected:
        raise ValueError("The full-run fallback may differ only by the frozen pwntools exclusion.")


def _assert_phase5_config(
    phase5_config: dict[str, Any],
    phase3_config: dict[str, Any],
    full_manifest: dict[str, Any],
    full_manifest_digest: str,
) -> None:
    """@cc [author:spolu,label:evaluation] frozen-full-luna-config
    The full Luna job preserves Phase 3's two arms, model, reasoning, tools, limits, and three
    attempts while selecting all 108 included-language tasks and using concurrency eight.
    """
    JobConfig.model_validate(phase5_config)
    expected = copy.deepcopy(phase3_config)
    expected.update(
        {
            "job_name": "full-v1-luna-k3",
            "n_concurrent_trials": 8,
            "datasets": [
                {
                    "path": "resolved/deep-swe/tasks",
                    "exclude_task_names": full_manifest["excluded_tasks"],
                }
            ],
        }
    )
    for agent in expected["agents"]:
        agent["kwargs"]["pilot_manifest_sha256"] = full_manifest_digest
    if phase5_config != expected:
        raise ValueError(
            "Phase 5 must differ from Phase 3 only in its frozen full-corpus run settings."
        )


def _assert_phase5_relaunch_config(
    relaunch_config: dict[str, Any], phase5_config: dict[str, Any], expected_job_name: str
) -> None:
    """@cc [author:spolu,label:evaluation] frozen-full-luna-relaunch-config
    Each full Luna relaunch differs from the original full job only by its predeclared immutable job
    name.
    """
    JobConfig.model_validate(relaunch_config)
    expected = copy.deepcopy(phase5_config)
    expected["job_name"] = expected_job_name
    if relaunch_config != expected:
        raise ValueError("The Phase 5 relaunch may differ from the original only by job name.")


def _assert_phase5_replacement_config(
    replacement_config: dict[str, Any],
    phase5_config: dict[str, Any],
    expected_job_name: str,
    expected_task_name: str,
    expected_agent_import_path: str,
    expected_attempts: int,
) -> None:
    """@cc [author:spolu,label:evaluation] frozen-full-luna-timeout-replacement
    A full Luna replacement reruns only its frozen arm/task timeout cells while preserving the
    primary agent, model, prompt, tools, runtime, manifest digest, and zero-retry configuration.
    """
    JobConfig.model_validate(replacement_config)
    matching_agents = [
        agent
        for agent in phase5_config["agents"]
        if agent["import_path"] == expected_agent_import_path
    ]
    if len(matching_agents) != 1:
        raise ValueError("The replacement arm must select exactly one frozen primary agent.")
    expected = copy.deepcopy(phase5_config)
    expected.update(
        {
            "job_name": expected_job_name,
            "n_attempts": expected_attempts,
            "n_concurrent_trials": expected_attempts,
            "datasets": [
                {
                    "path": "resolved/deep-swe/tasks",
                    "task_names": [expected_task_name],
                }
            ],
            "agents": [copy.deepcopy(matching_agents[0])],
        }
    )
    if replacement_config != expected:
        raise ValueError(
            "A Phase 5 replacement may differ only in its frozen job, arm, task, attempt count, "
            "and matching concurrency."
        )


def _assert_phase5_regrade_config(
    regrade_config: dict[str, Any],
    expected_job_name: str,
    expected_source_job_name: str,
    expected_source_job_id: str,
    expected_trials: int,
) -> None:
    """@cc [author:spolu,label:evaluation] frozen-pwntools-verifier-regrade
    A pwntools regrade reruns every recorded source submission without an agent, changes only the
    verifier timeout multiplier to `2.0`, and preserves environment build timeout and zero retries.
    """
    HarborJobConfig.model_validate(regrade_config)
    expected = {
        "job_name": expected_job_name,
        "jobs_dir": "jobs",
        "n_attempts": 1,
        "timeout_multiplier": 1.0,
        "verifier_timeout_multiplier": 2.0,
        "environment_build_timeout_multiplier": 1.0,
        "n_concurrent_trials": expected_trials,
        "quiet": False,
        "debug": False,
        "retry": {"max_retries": 0},
        "environment": {"type": "docker", "force_build": False, "delete": True},
        "verifier": {"disable": False},
        "tasks": [{"path": "resolved/deep-swe/tasks/pwntools-tube-multiplexing"}],
        "source_jobs": [
            {
                "action": "regrade",
                "type": "local",
                "job_id": expected_source_job_id,
                "path": f"jobs/{expected_source_job_name}",
            }
        ],
    }
    if regrade_config != expected:
        raise ValueError(
            "A Phase 5 regrade may differ only in its frozen job/source identity and matching "
            "concurrency."
        )


def run_preflight(
    config_path: Path,
    manifest_path: Path,
    prompt_v2_smoke_path: Path = DEFAULT_PROMPT_V2_SMOKE,
    prompt_v3_smoke_path: Path = DEFAULT_PROMPT_V3_SMOKE,
    prompt_v4_smoke_path: Path = DEFAULT_PROMPT_V4_SMOKE,
    phase3_config_path: Path = DEFAULT_PHASE3_CONFIG,
    phase4_config_path: Path = DEFAULT_PHASE4_CONFIG,
    full_manifest_path: Path = DEFAULT_FULL_MANIFEST,
    phase5_config_path: Path = DEFAULT_PHASE5_CONFIG,
    phase5_relaunch_config_path: Path = DEFAULT_PHASE5_RELAUNCH_CONFIG,
    phase5_relaunch_02_config_path: Path = DEFAULT_PHASE5_RELAUNCH_02_CONFIG,
    phase5_replacement_control_pwntools_path: Path = DEFAULT_PHASE5_REPLACEMENT_CONTROL_PWNTOOLS,
    phase5_replacement_code_contracts_pwntools_path: Path = (
        DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_PWNTOOLS
    ),
    phase5_replacement_code_contracts_aiomonitor_path: Path = (
        DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_AIOMONITOR
    ),
    phase5_regrade_control_pwntools_path: Path = DEFAULT_PHASE5_REGRADE_CONTROL_PWNTOOLS,
    phase5_regrade_code_contracts_pwntools_path: Path = (
        DEFAULT_PHASE5_REGRADE_CODE_CONTRACTS_PWNTOOLS
    ),
    full_fallback_manifest_path: Path = DEFAULT_FULL_FALLBACK_MANIFEST,
) -> None:
    config = _load_json(config_path)
    manifest = _load_json(manifest_path)
    prompt_v2_smoke = _load_json(prompt_v2_smoke_path)
    prompt_v3_smoke = _load_json(prompt_v3_smoke_path)
    prompt_v4_smoke = _load_json(prompt_v4_smoke_path)
    phase3_config = _load_json(phase3_config_path)
    phase4_config = _load_json(phase4_config_path)
    full_manifest = _load_json(full_manifest_path)
    phase5_config = _load_json(phase5_config_path)
    phase5_relaunch_config = _load_json(phase5_relaunch_config_path)
    phase5_relaunch_02_config = _load_json(phase5_relaunch_02_config_path)
    phase5_replacement_control_pwntools = _load_json(phase5_replacement_control_pwntools_path)
    phase5_replacement_code_contracts_pwntools = _load_json(
        phase5_replacement_code_contracts_pwntools_path
    )
    phase5_replacement_code_contracts_aiomonitor = _load_json(
        phase5_replacement_code_contracts_aiomonitor_path
    )
    phase5_regrade_control_pwntools = _load_json(phase5_regrade_control_pwntools_path)
    phase5_regrade_code_contracts_pwntools = _load_json(phase5_regrade_code_contracts_pwntools_path)
    full_fallback_manifest = _load_json(full_fallback_manifest_path)
    _assert_config_parity(config)
    _assert_manifest(manifest)
    _assert_prompt_v2_smoke(prompt_v2_smoke, manifest)
    _assert_prompt_v3_smoke(prompt_v3_smoke, manifest, prompt_v2_smoke)
    _assert_prompt_v4_smoke(prompt_v4_smoke, manifest, (prompt_v2_smoke, prompt_v3_smoke))
    _assert_phase3_config(phase3_config, config, manifest)
    _assert_phase4_config(phase4_config, phase3_config)
    _assert_full_manifest(full_manifest, manifest)
    _assert_full_fallback_manifest(full_fallback_manifest, full_manifest)
    _assert_phase5_config(
        phase5_config, phase3_config, full_manifest, sha256_file(full_manifest_path)
    )
    _assert_phase5_relaunch_config(
        phase5_relaunch_config, phase5_config, "full-v1-luna-k3-relaunch-01"
    )
    _assert_phase5_relaunch_config(
        phase5_relaunch_02_config, phase5_config, "full-v1-luna-k3-relaunch-02"
    )
    _assert_phase5_replacement_config(
        phase5_replacement_control_pwntools,
        phase5_config,
        "full-v1-luna-k3-replacement-01-control-pwntools",
        "pwntools-tube-multiplexing",
        "deepswe_eval.agents:ControlAgent",
        1,
    )
    _assert_phase5_regrade_config(
        phase5_regrade_control_pwntools,
        "full-v1-luna-k3-regrade-01-control-pwntools",
        "full-v1-luna-k3-replacement-01-control-pwntools",
        "44d11593-db34-4864-bb59-f28787618b3d",
        1,
    )
    _assert_phase5_regrade_config(
        phase5_regrade_code_contracts_pwntools,
        "full-v1-luna-k3-regrade-01-code-contracts-pwntools",
        "full-v1-luna-k3-replacement-01-code-contracts-pwntools",
        "1606519f-34bc-44f0-b59b-b834a47338f1",
        3,
    )
    _assert_phase5_replacement_config(
        phase5_replacement_code_contracts_pwntools,
        phase5_config,
        "full-v1-luna-k3-replacement-01-code-contracts-pwntools",
        "pwntools-tube-multiplexing",
        "deepswe_eval.agents:CodeContractsAgent",
        3,
    )
    _assert_phase5_replacement_config(
        phase5_replacement_code_contracts_aiomonitor,
        phase5_config,
        "full-v1-luna-k3-replacement-01-code-contracts-aiomonitor",
        "aiomonitor-task-snapshots-diff",
        "deepswe_eval.agents:CodeContractsAgent",
        1,
    )

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
        if "<code-contracts-instructions>" in treatment.render_instruction(sample_instruction):
            raise ValueError("Treatment workflow must not use an additional XML wrapper.")
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

        full_instances = []
        for agent_config in phase5_relaunch_02_config["agents"]:
            agent_class = EXPECTED_ARMS[agent_config["import_path"]]
            full_instances.append(
                agent_class(
                    logs_dir=Path(temporary_directory) / f"full-{agent_class.VARIANT}",
                    model_name=agent_config["model_name"],
                    **agent_config["kwargs"],
                )
            )
        if any(
            agent._pilot_manifest_path != full_manifest_path.resolve() for agent in full_instances
        ):
            raise ValueError("Full-run agents must resolve the frozen full-corpus manifest.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate the frozen DeepSWE ablation harness.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--prompt-v2-smoke", type=Path, default=DEFAULT_PROMPT_V2_SMOKE)
    parser.add_argument("--prompt-v3-smoke", type=Path, default=DEFAULT_PROMPT_V3_SMOKE)
    parser.add_argument("--prompt-v4-smoke", type=Path, default=DEFAULT_PROMPT_V4_SMOKE)
    parser.add_argument("--phase3-config", type=Path, default=DEFAULT_PHASE3_CONFIG)
    parser.add_argument("--phase4-config", type=Path, default=DEFAULT_PHASE4_CONFIG)
    parser.add_argument("--full-manifest", type=Path, default=DEFAULT_FULL_MANIFEST)
    parser.add_argument("--phase5-config", type=Path, default=DEFAULT_PHASE5_CONFIG)
    parser.add_argument(
        "--phase5-relaunch-config", type=Path, default=DEFAULT_PHASE5_RELAUNCH_CONFIG
    )
    parser.add_argument(
        "--phase5-relaunch-02-config",
        type=Path,
        default=DEFAULT_PHASE5_RELAUNCH_02_CONFIG,
    )
    parser.add_argument(
        "--phase5-replacement-control-pwntools",
        type=Path,
        default=DEFAULT_PHASE5_REPLACEMENT_CONTROL_PWNTOOLS,
    )
    parser.add_argument(
        "--phase5-replacement-code-contracts-pwntools",
        type=Path,
        default=DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_PWNTOOLS,
    )
    parser.add_argument(
        "--phase5-replacement-code-contracts-aiomonitor",
        type=Path,
        default=DEFAULT_PHASE5_REPLACEMENT_CODE_CONTRACTS_AIOMONITOR,
    )
    parser.add_argument(
        "--phase5-regrade-control-pwntools",
        type=Path,
        default=DEFAULT_PHASE5_REGRADE_CONTROL_PWNTOOLS,
    )
    parser.add_argument(
        "--phase5-regrade-code-contracts-pwntools",
        type=Path,
        default=DEFAULT_PHASE5_REGRADE_CODE_CONTRACTS_PWNTOOLS,
    )
    parser.add_argument(
        "--full-fallback-manifest",
        type=Path,
        default=DEFAULT_FULL_FALLBACK_MANIFEST,
    )
    arguments = parser.parse_args()
    run_preflight(
        arguments.config.resolve(),
        arguments.manifest.resolve(),
        arguments.prompt_v2_smoke.resolve(),
        arguments.prompt_v3_smoke.resolve(),
        arguments.prompt_v4_smoke.resolve(),
        arguments.phase3_config.resolve(),
        arguments.phase4_config.resolve(),
        arguments.full_manifest.resolve(),
        arguments.phase5_config.resolve(),
        arguments.phase5_relaunch_config.resolve(),
        arguments.phase5_relaunch_02_config.resolve(),
        arguments.phase5_replacement_control_pwntools.resolve(),
        arguments.phase5_replacement_code_contracts_pwntools.resolve(),
        arguments.phase5_replacement_code_contracts_aiomonitor.resolve(),
        arguments.phase5_regrade_control_pwntools.resolve(),
        arguments.phase5_regrade_code_contracts_pwntools.resolve(),
        arguments.full_fallback_manifest.resolve(),
    )
    print("DeepSWE ablation preflight passed.")


if __name__ == "__main__":
    main()
