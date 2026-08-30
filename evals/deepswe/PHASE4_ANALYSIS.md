# Phase 4 Terra/xhigh pilot analysis

Phase 4 is complete. The matched pilot used `openai/gpt-5.6-terra` with reasoning effort `xhigh`
across the same twelve frozen `pilot-v1` tasks. Each task has four valid binary outcomes per arm.
All 96 trials completed without errors, cancellations, or retries.

## Primary results

| Arm | Passed | Average pass rate | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- |
| control | 29/48 | 60.42% | 60.42% | 72.22% | 75.00% | 75.00% |
| code-contracts | 29/48 | 60.42% | 60.42% | 69.44% | 72.92% | 75.00% |
| code-contracts - control | +0 | 0.00 pp | 0.00 pp | -2.78 pp | -2.08 pp | 0.00 pp |

Micro and task-macro average pass rates are identical because every task/arm cell contains exactly
four valid outcomes. pass@k is calculated within each task as
`1 - C(n - successes, k) / C(n, k)` and then averaged equally over the twelve tasks.

| Task | Control | Code-contracts | Pass-rate delta |
| --- | --- | --- | --- |
| `sql-formatter-bigquery-pipe-formatting` | 3/4 | 3/4 | 0.00 pp |
| `drizzle-orm-window-function-builders` | 4/4 | 4/4 | 0.00 pp |
| `meriyah-explicit-resource-declarations` | 2/4 | 2/4 | 0.00 pp |
| `ts-pattern-match-each` | 2/4 | 4/4 | +50.00 pp |
| `etree-xml-diff-patch` | 4/4 | 4/4 | 0.00 pp |
| `task-task-graph-export` | 3/4 | 4/4 | +25.00 pp |
| `dasel-html-document-format` | 0/4 | 0/4 | 0.00 pp |
| `psd-tools-blend-range-api` | 4/4 | 3/4 | -25.00 pp |
| `sqlfmt-create-table-ddl-formatting` | 0/4 | 0/4 | 0.00 pp |
| `pwntools-tube-multiplexing` | 3/4 | 1/4 | -50.00 pp |
| `wasmi-trap-coredumps` | 4/4 | 4/4 | 0.00 pp |
| `pest-character-class-coalescing` | 0/4 | 0/4 | 0.00 pp |

The treatment improved two tasks, lost two, and tied eight. Its three added successes on
`ts-pattern-match-each` and `task-task-graph-export` were exactly offset by three lost successes on
`psd-tools-blend-range-api` and `pwntools-tube-multiplexing`. Both arms solved at least one attempt
on nine of twelve tasks, which explains the identical pass@4. With the same total successes,
treatment successes were slightly more concentrated within tasks, producing the lower pass@2 and
pass@3 values.

## Secondary results

The following means use all 48 valid outcomes per arm.

| Metric | Control | Code-contracts | Treatment delta |
| --- | --- | --- | --- |
| Partial verifier score | 0.9593 | 0.9974 | +0.0381 |
| Fail-to-pass fraction | 0.9410 | 0.9795 | +0.0386 |
| Pass-to-pass fraction | 0.9999 | 0.9996 | -0.0003 |
| Cost per trial | $1.61794 | $1.82285 | +12.67% |
| Agent steps | 42.48 | 43.06 | +1.37% |
| Trial duration | 687.60 s | 772.02 s | +12.28% |

The code-contracts arm has substantially higher partial and fail-to-pass scores despite the binary
tie, suggesting that more held-out fail-to-pass tests were fixed in unsuccessful treatment trials.
That did not cross the all-tests-passing threshold more often. Treatment used slightly more steps,
cost 12.67% more, and took 12.28% longer per trial.

The control arm cost `$77.66091310`; the code-contracts arm cost `$87.49682200`; total model cost
was `$165.15773510`. Combined usage was 340,217,354 input tokens, of which 322,194,616 were cached,
and 4,442,307 output tokens. Wall-clock runtime at concurrency eight was 2 hours 37 minutes 57
seconds.

## Treatment adoption

- All 48 treatment trajectories issued at least one command containing `cc-check`; across them,
  666 bash tool-call commands contained `cc-check`.
- All 48 treatment patches added at least one `@cc` marker.
- None of the 48 control trajectories invoked `cc-check` or added an `@cc` marker.

These are mechanism-adoption markers, not a semantic quality score. They show that the intervention
was delivered and acted upon, but do not establish that every introduced contract was useful or
that every trajectory performed a successful bounded final audit.

## Cost estimate and reproducibility

The pre-run estimate was approximately `$36`, with a `$30-50` allowance. Actual cost was 4.59 times
the point estimate and 3.30 times the top of the allowance. The estimate scaled Phase 3 Luna's
observed token mix to 96 trials; Terra/xhigh actually used 4.74 times the scaled input-token volume
and 4.98 times the scaled output-token volume. Future estimates should be based on a Terra/xhigh
smoke sample rather than on Luna trajectories.

All 96 provenance records agree on the model, reasoning effort, DeepSWE commit, mini-swe-agent
version, Node version, agent source, task manifest, harness lock, `cc-check` bundle, skill, and
activation-instruction digests. There are 48 records per arm; only the expected prompt-extension and
resolved task-prompt digests differ by arm. The raw job is unchanged at
`jobs/pilot-v1-terra-xhigh-k4/` and the full chronological ledger is in
[REPRODUCIBILITY.md](REPRODUCIBILITY.md).

## Interpretation and next gate

Terra/xhigh does not reproduce Phase 3 Luna's positive binary-pass-rate difference: the Phase 4
difference is exactly zero. The treatment does improve partial verifier progress, but at higher cost
and duration, and its pass@2 and pass@3 are slightly lower. Phase 3 and Phase 4 should not be pooled
because they use different models, reasoning levels, and attempt counts.

This result does not support expanding directly to all 108 tasks or treating a Sol run as validation
of an established benefit. A Sol run would still be useful as an independent model replication if
frozen in advance. Before a full-corpus run, the stronger gate is either to complete the originally
planned Luna eight-attempt cells or freeze a broader language-balanced sample with enough tasks to
test whether the effect generalizes beyond this twelve-task subset.

As in Phase 3, the public artifacts do not expose a stable shared attempt identifier across arms, so
an exact task-and-attempt McNemar analysis cannot be reconstructed for this run.
