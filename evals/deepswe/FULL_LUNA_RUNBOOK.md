# Full Luna runbook

This runbook is the operator handoff for the prepared `full-v1-luna-k3` DeepSWE evaluation. It is
written for a coding agent operating a persistent remote Linux machine. Do not change the frozen
configuration or start additional scored jobs without explicit user approval.

## Frozen design and estimate

- Dataset: all 108 DeepSWE tasks written in TypeScript, Python, Go, or Rust; the five JavaScript
  tasks are excluded.
- Arms: `control` and `code-contracts`.
- Model: direct OpenAI `openai/gpt-5.6-luna` with reasoning effort `max` in both arms.
- Attempts: three per task and arm, for 648 trials total.
- Runtime: local Docker, concurrency eight, zero retries.
- Point estimate: 8 hours 15 minutes and `$24.3`.
- Operational range: 8-12 hours and `$25-40` to cover the broader task mix and long-tail trials.

The estimate scales the completed Phase 3 Luna run by trial count and concurrency. It is not a
spending limit. Stop before launch and ask the user if the range is not acceptable.

## Prepare the remote checkout

Start from the repository commit containing this runbook after its pull request is merged. The
machine needs Docker, Git LFS, and uv. Use a newly rotated OpenAI key; do not reuse the key exposed
in the earlier private operator transcript.

```bash
git pull --ff-only origin main
git lfs pull --include='evals/deepswe/artifacts/*.tar.gz'

cd evals/deepswe
git clone https://github.com/datacurve-ai/deep-swe resolved/deep-swe
git -C resolved/deep-swe checkout 0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea

uv sync --frozen
make check
```

If `resolved/deep-swe` already exists, do not overwrite it. Verify that it is clean and at the
exact commit instead:

```bash
git -C resolved/deep-swe status --short
git -C resolved/deep-swe rev-parse HEAD
```

The status output must be empty and the commit must be
`0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`.

Resolve the frozen dataset without making model calls:

```bash
uv run python - <<'PY'
import asyncio
from pathlib import Path

from pier.models.job.config import JobConfig

config = JobConfig.model_validate_json(Path("config/full-v1-luna-k3.json").read_text())
tasks = asyncio.run(config.datasets[0].get_task_configs())
print(f"tasks={len(tasks)}")
print(f"trials={len(tasks) * config.n_attempts * len(config.agents)}")
print(f"concurrency={config.n_concurrent_trials}")
print(f"retries={config.retry.max_retries}")
PY
```

The output must be exactly 108 tasks, 648 trials, concurrency eight, and zero retries. Stop and
report the mismatch instead of launching if any value differs.

## Launch exactly once

Confirm that `jobs/full-v1-luna-k3/` does not exist. If it exists, stop and report it; never delete,
overwrite, or silently resume a scored job.

Enter a persistent terminal such as tmux, provide the key only through the shell environment, and
run the frozen command without overrides:

```bash
tmux new -s deepswe-full-luna
cd /absolute/path/to/code-contracts/evals/deepswe
export OPENAI_API_KEY=...

PYTHONPATH=. uv run pier run \
  --config config/full-v1-luna-k3.json \
  --yes
```

Do not write the key to a repository file, `.env` file, prompt, log, or command argument. Do not run
`ps`, `pgrep -a`, Docker process inspection, or another command that prints process arguments: the
Docker launch command can contain the runtime key.

At initial resolution, Pier must report 648 total trials, eight running, and 640 pending. Stop the
runner and report the discrepancy before substantive execution if the total differs.

## Monitor safely

Use tmux output and the aggregate public result only. Do not inspect DeepSWE solutions, verifier
implementations, held-out tests, or information derived from them.

```bash
tmux attach -t deepswe-full-luna

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
}' jobs/full-v1-luna-k3/result.json
```

Do not alter raw job files. Do not manually retry any failed trial. With retries frozen at zero, an
infrastructure error must remain in the original job and be reported for an outcome-blind,
symmetrically configured replacement decision.

## Complete and analyze

The normal terminal condition is 648 completed trials, zero running and pending trials, and a
non-null `finished_at`. Preserve the complete `jobs/full-v1-luna-k3/` directory; it is intentionally
ignored by Git.

If every task/arm cell has three valid binary outcomes, run:

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/full-v1-luna-k3 \
  --manifest config/full-v1.json \
  --attempts 3 \
  --format markdown
```

If any trial has an infrastructure error or missing binary result, do not weaken the analyzer and
do not launch a replacement. Report the exact public exception type and affected arm/task to the
user. A replacement configuration must be frozen and reviewed separately.

After completion, report:

- start, finish, and wall-clock duration;
- completed, errored, cancelled, and retried process counts;
- aggregate input, cached-input, and output tokens plus cost;
- analyzer output, including average pass rate and pass@1 through pass@3 for both arms;
- treatment adoption counts for `cc-check` commands and patches adding `@cc`;
- resolved config, lock, result, public-artifact manifest, and input digests;
- a literal credential scan count without printing the credential.

Keep the raw job immutable and retain it until the analysis and artifact transfer are complete.
