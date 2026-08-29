# DeepSWE evaluation harness

This directory implements phase 1 of [PLAN.md](PLAN.md): a matched Pier configuration for a stock
mini-swe-agent control and a code-contracts treatment. Both arms use the same pinned
mini-swe-agent, Node, `cc-check` bundle, model route, reasoning effort, runtime settings, and task
verifier. The treatment's only model-visible difference is the frozen skill appended to the task
instruction.

## Build and preflight

Requirements: Node 24.16.0, npm 11.11 or newer, and uv.

```bash
cd evals/deepswe
make bundle
make check
```

`make bundle` rebuilds `cc-check`, creates a normalized gzip archive, and prints its SHA-256 digest.
If that digest changes, update both agents in `config/phase1.json`. `make check` verifies bundle and
skill digests, harness and pilot locks, scored and smoke-task selection metadata, arm parity,
control prompt neutrality, result identities, and runtime-only credential placeholders.

## Run the paired preflight

Clone DeepSWE at the commit in `config/pilot-v1.json`, export the API key only in the invoking
shell, and keep this directory on `PYTHONPATH` so Pier can import the two agents:

```bash
cd evals/deepswe
export OPENAI_API_KEY=...
PYTHONPATH=. uv run pier run \
  --config config/phase1.json \
  --path /path/to/deep-swe/tasks/<smoke-task> \
  --yes
```

Pier writes its sanitized `lock.json` plus trial outputs under `jobs/`. Each trial adds
`agent/deepswe-provenance.json` after the agent process exits; it contains only public configuration
and digests, never prompts, skill text, or environment values.
