# Full Luna relaunch runbook

This addendum governs the user-authorized `full-v1-luna-k3-relaunch-01` job. The original
`jobs/full-v1-luna-k3/` directory remains immutable and must not be deleted, overwritten, or
resumed. The relaunch config differs from the original frozen full Luna config only by `job_name`.

## Operational gate

The remote host must have Docker Compose v2 as `docker compose`. From `evals/deepswe`, run:

```bash
docker compose version
git -C resolved/deep-swe status --short
git -C resolved/deep-swe rev-parse HEAD
uv run python -m deepswe_eval.preflight
```

The DeepSWE status must be empty and its commit must be
`0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`. Preflight must pass. The completed remote operational
gate consists of a successful non-model `nop` task/verifier smoke followed by one matched
control/code-contracts smoke with zero infrastructure errors or retries.

Resolve the relaunch config without model calls and require exactly 108 tasks, 648 trials,
concurrency eight, and zero retries:

```bash
uv run python - <<'PY'
import asyncio
from pathlib import Path

from pier.models.job.config import JobConfig

config = JobConfig.model_validate_json(
    Path("config/full-v1-luna-k3-relaunch-01.json").read_text()
)
tasks = asyncio.run(config.datasets[0].get_task_configs())
print(f"tasks={len(tasks)}")
print(f"trials={len(tasks) * config.n_attempts * len(config.agents)}")
print(f"concurrency={config.n_concurrent_trials}")
print(f"retries={config.retry.max_retries}")
PY
```

## Launch exactly once

Confirm that `jobs/full-v1-luna-k3-relaunch-01/` does not exist. Start a persistent tmux shell,
enable `remain-on-exit`, and supply the key only through the tmux server's inherited environment.
Do not put the key in the command, a file, a log, or process inspection output.

```bash
tmux new-session -d -s deepswe-full-luna-relaunch \
  -c /absolute/path/to/code-contracts/evals/deepswe
tmux set-option -t deepswe-full-luna-relaunch remain-on-exit on
tmux send-keys -t deepswe-full-luna-relaunch -l -- \
  'PYTHONPATH=. uv run pier run --config config/full-v1-luna-k3-relaunch-01.json --yes'
tmux send-keys -t deepswe-full-luna-relaunch Enter
```

At initial dispatch, require 648 total trials, eight running, and 640 pending. Stop and report any
different total before substantive execution. Do not inspect process arguments, solutions,
verifier implementations, held-out tests, or information derived from them.

## Monitor and analyze

Use only tmux output and the aggregate public result while the job runs:

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
}' jobs/full-v1-luna-k3-relaunch-01/result.json
```

Do not modify raw job files or retry a failed trial. If all 648 trials produce valid binary results,
run:

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/full-v1-luna-k3-relaunch-01 \
  --manifest config/full-v1.json \
  --attempts 3 \
  --format markdown
```

If any infrastructure error or missing binary result occurs, preserve it and stop for a separately
frozen, outcome-blind replacement decision. After completion, append all required aggregate usage,
analysis, provenance, public-artifact, adoption, and count-only credential-scan results to
`REPRODUCIBILITY.md`.
