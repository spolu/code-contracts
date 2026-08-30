# DeepSWE evaluation harness

This directory implements the matched Pier harness described in [PLAN.md](PLAN.md): a stock
mini-swe-agent control and a code-contracts treatment. Both arms use the same pinned mini-swe-agent,
Node, `cc-check` bundle, model route, reasoning effort, runtime settings, and task verifier. The
treatment's only model-visible difference is the frozen skill and workflow appended to the task
instruction.

Execution commands, immutable inputs, and outcomes are recorded chronologically in
[REPRODUCIBILITY.md](REPRODUCIBILITY.md). Phase 3 results and their interpretation are in
[PHASE3_ANALYSIS.md](PHASE3_ANALYSIS.md).

## Build and preflight

Requirements: Node 24.16.0, npm 11.11 or newer, and uv.

```bash
cd evals/deepswe
make bundle
make check
```

`make bundle` rebuilds `cc-check`, creates a normalized gzip archive, and prints its SHA-256 digest.
If that digest changes, update both agents in `config/ablation.json`. `make check` verifies bundle and
skill digests, harness and pilot locks, scored and smoke-task selection metadata, arm parity,
control prompt neutrality, result identities, and runtime-only credential placeholders.

## Run local smoke trials

Clone DeepSWE at the commit in `config/pilot-v1.json`, export the API key only in the invoking
shell, and keep this directory on `PYTHONPATH` so Pier can import the two custom agents. Local Docker
is the default execution environment for smoke tests and the pilot.

```bash
cd evals/deepswe
export OPENAI_API_KEY=...

# Task and verifier plumbing. A nop reward of 0 and oracle reward of 1 are expected.
uv run pier run \
  --path /path/to/deep-swe/tasks/<smoke-task> \
  --agent nop --env docker --n-concurrent 1 --yes
uv run pier run \
  --path /path/to/deep-swe/tasks/<smoke-task> \
  --agent oracle --env docker --n-concurrent 1 --yes

# Upstream mini-swe-agent baseline for adapter-neutrality comparison.
uv run pier run \
  --path /path/to/deep-swe/tasks/<smoke-task> \
  --agent mini-swe-agent --model openai/gpt-5.6-luna \
  --agent-kwarg version=2.4.6 \
  --agent-kwarg reasoning_effort=max \
  --agent-kwarg model_class=litellm_response \
  --agent-env 'OPENAI_API_KEY=${OPENAI_API_KEY}' \
  --env docker --n-concurrent 1 --yes

# Matched control and code-contracts smoke trials.
PYTHONPATH=. uv run pier run \
  --config config/ablation.json \
  --path /path/to/deep-swe/tasks/<smoke-task> \
  --yes
```

Pier writes its sanitized `lock.json` plus trial outputs under `jobs/`. Each trial adds
`agent/deepswe-provenance.json` after the agent process exits; it contains only public configuration
and digests, never prompts, skill text, or environment values.

## Run and analyze Phase 3

Phase 3 runs the twelve frozen `pilot-v1` tasks with three attempts per arm: 72 trials total. Both
arms use `openai/gpt-5.6-luna` with reasoning effort `max`; concurrency is four and retries are
disabled.

```bash
cd evals/deepswe
export OPENAI_API_KEY=...
make check

PYTHONPATH=. uv run pier run \
  --config config/phase3-luna.json \
  --yes

PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/pilot-v1-luna-k3 \
  --manifest config/pilot-v1.json \
  --attempts 3 \
  --format markdown
```

The analyzer reads only public per-trial `result.json` files and refuses to report a balanced result
unless every task/arm cell contains exactly three binary rewards. It reports micro and task-macro
average pass rates plus task-macro pass@1, pass@2, and pass@3.

If an outcome-blind replacement job is required for an infrastructure failure, pass both immutable
job directories and explicitly name the allowed error type. The analyzer reports the exclusion and
still requires exactly three binary outcomes in every cell:

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/pilot-v1-luna-k3 \
  jobs/pilot-v1-luna-k3-replacement-01 \
  --manifest config/pilot-v1.json \
  --attempts 3 \
  --allow-error-type VerifierTimeoutError \
  --format markdown
```

## Run the Terra/xhigh replication

The Terra replication keeps the twelve tasks and two arms frozen while changing the model to
`openai/gpt-5.6-terra`, reasoning effort to `xhigh`, attempts to four per task/arm, and concurrency
to eight. It runs 96 trials with retries disabled.

```bash
cd evals/deepswe
export OPENAI_API_KEY=...
make check

PYTHONPATH=. uv run pier run \
  --config config/phase4-terra-xhigh-k4.json \
  --yes

PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/pilot-v1-terra-xhigh-k4 \
  --manifest config/pilot-v1.json \
  --attempts 4 \
  --format markdown
```
