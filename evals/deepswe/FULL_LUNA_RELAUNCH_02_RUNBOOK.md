# Full Luna relaunch 02 runbook

This runbook governs `full-v1-luna-k3-relaunch-02`. Preserve the earlier
`jobs/full-v1-luna-k3/` and `jobs/full-v1-luna-k3-relaunch-01/` directories unchanged. Both exited
before dispatch and produced no arm outcome or model cost.

The relaunch-02 config differs from the original frozen full config only by `job_name`. The shared
agent adapter now resolves the frozen task manifest from its configured digest, and preflight
instantiates both full-run agents to verify that `full-v1.json` is selected. This fix applies
identically to both arms and changes no task, model, reasoning, prompt, tool, limit, or verifier.

## Preflight

From `evals/deepswe`, require Docker Compose v2, a clean pinned DeepSWE checkout, a passing project
check, and exact dataset resolution:

```bash
docker compose version
git -C resolved/deep-swe status --short
git -C resolved/deep-swe rev-parse HEAD
make check

uv run python - <<'PY'
import asyncio
from pathlib import Path

from pier.models.job.config import JobConfig

config = JobConfig.model_validate_json(
    Path("config/full-v1-luna-k3-relaunch-02.json").read_text()
)
tasks = asyncio.run(config.datasets[0].get_task_configs())
print(f"tasks={len(tasks)}")
print(f"trials={len(tasks) * config.n_attempts * len(config.agents)}")
print(f"concurrency={config.n_concurrent_trials}")
print(f"retries={config.retry.max_retries}")
PY
```

The DeepSWE status must be empty, its commit must be
`0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`, and resolution must report 108 tasks, 648 trials,
concurrency eight, and zero retries.

## Launch exactly once

Confirm that `jobs/full-v1-luna-k3-relaunch-02/` does not exist. Supply the key only through the
tmux server's inherited environment; never put it in a command, file, log, or process inspection
output.

```bash
tmux new-session -d -s deepswe-full-luna-relaunch-02 \
  -c /absolute/path/to/code-contracts/evals/deepswe
tmux set-option -t deepswe-full-luna-relaunch-02 remain-on-exit on
tmux send-keys -t deepswe-full-luna-relaunch-02 -l -- \
  'PYTHONPATH=. uv run pier run --config config/full-v1-luna-k3-relaunch-02.json --yes'
tmux send-keys -t deepswe-full-luna-relaunch-02 Enter
```

Require the initial public state to reach 648 total, eight running, and 640 pending. Use only the
retained tmux pane and aggregate public result for monitoring. Do not inspect process arguments,
solutions, verifier implementations, held-out tests, or information derived from them.

```bash
jq '{
  updated_at,
  finished_at,
  total: .n_total_trials,
  completed: .stats.n_completed_trials,
  errors: .stats.n_errored_trials,
  running: .stats.n_running_trials,
  pending: .stats.n_pending_trials,
  cancelled: .stats.n_cancelled_trials,
  retries: .stats.n_retries,
  cost_usd: .stats.cost_usd
}' jobs/full-v1-luna-k3-relaunch-02/result.json
```

Do not edit raw job files or manually retry any failure. If all 648 trials produce valid binary
results, analyze with:

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/full-v1-luna-k3-relaunch-02 \
  --manifest config/full-v1.json \
  --attempts 3 \
  --format markdown
```

Otherwise preserve the job and stop for a separately frozen, outcome-blind replacement decision.
After terminal completion, append aggregate usage, analysis, provenance, public-artifact, adoption,
and count-only credential-scan results to `REPRODUCIBILITY.md`.
