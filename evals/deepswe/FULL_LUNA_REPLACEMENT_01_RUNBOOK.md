# Full Luna replacement 01 runbook

This runbook governs the outcome-blind replacements authorized after
`jobs/full-v1-luna-k3-relaunch-02/` reached terminal state. Preserve the primary and all earlier
job directories unchanged.

The replacement rule uses only the primary's public exception records: every
`VerifierTimeoutError` receives exactly one new attempt in the same arm and task, regardless of
reward or any task-specific evidence. The five frozen replacements are:

- one control attempt for `pwntools-tube-multiplexing`;
- three code-contracts attempts for `pwntools-tube-multiplexing`;
- one code-contracts attempt for `aiomonitor-task-snapshots-diff`.

Each replacement config inherits the selected primary agent verbatim, including model, reasoning,
prompt digest, tools, runtime, full-manifest digest, credential placeholder, and zero-retry rule.
The only other changes are immutable job name, exact task selection, replacement attempt count, and
matching concurrency.

## Frozen inputs

- Control pwntools config SHA-256:
  `1dd935dce207ae70bfcf554e45b53622e00ecb3c465fe58bedc8f96c9ba664d3`
- Code-contracts pwntools config SHA-256:
  `0cd7e10c1ed2847d7377f5daee95b9f345e3c33462c9999697d89a7d72a70332`
- Code-contracts aiomonitor config SHA-256:
  `de262a546b49aa62ea9be4a20f12449507f97778441131e12a94dee1d7f5218d`
- Full manifest / agent / analyzer / preflight SHA-256:
  `85d96539172c71a38fffd07a5ef18d481d2e2efee4adc8a5647742666f41e772` /
  `74583488e2f8d3031fbfa5b74827471838f7b70aeeba4bc93f3d0143684c13e5` /
  `afadeb95a1104f37c1db6eeaab3c897727ddcf26bfc9d377677b7ee9dd78951a` /
  `e24c26e91fb2092c505164a39ab573c9b3e487a898359453149f7801adde0799`
- Harness lock / `cc-check` bundle / skill SHA-256:
  `3e411d2eb53ee7d229371227c11669ff1ba96313f5c6993370104121ad0d18c1` /
  `5b4de4d3221e78fe9e9825ed2ae060833ad5f6608dd8d9837fb5d99b68c6f32f` /
  `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`

## Preflight

From `evals/deepswe`, require Docker Compose v2, a clean pinned DeepSWE checkout, passing project
and contract checks, and exact config resolution. The three configs must resolve respectively to
one, three, and one trials, with matching concurrency and zero retries. The DeepSWE checkout must
be clean at `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`.

Confirm that all three raw targets are absent before launch:

```text
jobs/full-v1-luna-k3-replacement-01-control-pwntools/
jobs/full-v1-luna-k3-replacement-01-code-contracts-pwntools/
jobs/full-v1-luna-k3-replacement-01-code-contracts-aiomonitor/
```

## Launch exactly once

Supply the API key only through the tmux server's inherited environment. Never put it in a command,
file, log, or process-inspection output. Launch the three immutable jobs in separate retained tmux
sessions; together they run at most five trials, below the primary's concurrency of eight.

```bash
PYTHONPATH=. uv run pier run \
  --config config/full-v1-luna-k3-replacement-01-control-pwntools.json \
  --yes

PYTHONPATH=. uv run pier run \
  --config config/full-v1-luna-k3-replacement-01-code-contracts-pwntools.json \
  --yes

PYTHONPATH=. uv run pier run \
  --config config/full-v1-luna-k3-replacement-01-code-contracts-aiomonitor.json \
  --yes
```

Require initial public states of 1/1/0, 3/3/0, and 1/1/0 for total/running/pending. Monitor only
the retained tmux panes and aggregate public results. Do not inspect process arguments, solutions,
verifier implementations, held-out tests, or information derived from them. Do not edit raw job
files or manually retry any failure.

## Completion and analysis

If all five replacements produce valid binary results, analyze the immutable primary plus all three
replacement directories with:

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/full-v1-luna-k3-relaunch-02 \
  jobs/full-v1-luna-k3-replacement-01-control-pwntools \
  jobs/full-v1-luna-k3-replacement-01-code-contracts-pwntools \
  jobs/full-v1-luna-k3-replacement-01-code-contracts-aiomonitor \
  --manifest config/full-v1.json \
  --attempts 3 \
  --allow-error-type VerifierTimeoutError \
  --format markdown
```

The analyzer must report exactly 324 valid binary results per arm and the five excluded primary
timeouts. If any replacement errors, preserve every job and stop for a new explicit decision; do
not weaken the analyzer. After successful analysis, append aggregate usage, provenance,
public-artifact, adoption, count-only credential-scan, and analysis results to
`REPRODUCIBILITY.md`.
