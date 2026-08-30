# Phase 3 Luna pilot analysis

Phase 3 is complete. The matched pilot used `openai/gpt-5.6-luna` with reasoning effort `max`
across the twelve frozen `pilot-v1` tasks. Each task has three valid binary outcomes per arm.

One of the original 72 trial processes, a control verifier for
`pwntools-tube-multiplexing`, ended with `VerifierTimeoutError`. Following the predeclared symmetric
infrastructure-failure rule, it was excluded and replaced once with the same arm, task, model,
prompt, and runtime settings. The original job remains unchanged. The final analysis therefore uses
72 valid outcomes from 73 executions.

## Primary results

| Arm | Passed | Average pass rate | pass@1 | pass@2 | pass@3 |
| --- | --- | --- | --- | --- | --- |
| control | 7/36 | 19.44% | 19.44% | 27.78% | 33.33% |
| code-contracts | 9/36 | 25.00% | 25.00% | 36.11% | 41.67% |
| code-contracts - control | +2 | +5.56 pp | +5.56 pp | +8.33 pp | +8.33 pp |

Micro and task-macro average pass rates are identical because every task/arm cell contains exactly
three valid outcomes. pass@k is calculated within each task as
`1 - C(n - successes, k) / C(n, k)` and then averaged equally over the twelve tasks.

| Task | Control | Code-contracts | Pass-rate delta |
| --- | --- | --- | --- |
| `sql-formatter-bigquery-pipe-formatting` | 0/3 | 2/3 | +66.67 pp |
| `drizzle-orm-window-function-builders` | 3/3 | 3/3 | 0.00 pp |
| `meriyah-explicit-resource-declarations` | 0/3 | 0/3 | 0.00 pp |
| `ts-pattern-match-each` | 1/3 | 0/3 | -33.33 pp |
| `etree-xml-diff-patch` | 0/3 | 0/3 | 0.00 pp |
| `task-task-graph-export` | 1/3 | 1/3 | 0.00 pp |
| `dasel-html-document-format` | 0/3 | 0/3 | 0.00 pp |
| `psd-tools-blend-range-api` | 2/3 | 2/3 | 0.00 pp |
| `sqlfmt-create-table-ddl-formatting` | 0/3 | 1/3 | +33.33 pp |
| `pwntools-tube-multiplexing` | 0/3 | 0/3 | 0.00 pp |
| `wasmi-trap-coredumps` | 0/3 | 0/3 | 0.00 pp |
| `pest-character-class-coalescing` | 0/3 | 0/3 | 0.00 pp |

The binary result is directionally positive but not broad. Code-contracts improved two tasks, lost
one, and tied nine. Six tasks had no success in either arm. The gains are concentrated in the two
SQL-formatting tasks, while the treatment lost one success on `ts-pattern-match-each`. At least one
attempt passed on five of twelve treatment tasks and four of twelve control tasks.

## Secondary results

The following means use the same 36 valid outcomes per arm. Cost includes only valid outcomes in the
per-trial row; total run cost below includes the failed verifier execution and its replacement.

| Metric | Control | Code-contracts | Treatment delta |
| --- | --- | --- | --- |
| Partial verifier score | 0.9001 | 0.8505 | -0.0496 |
| Fail-to-pass fraction | 0.7427 | 0.7242 | -0.0185 |
| Pass-to-pass fraction | 0.9881 | 0.9978 | +0.0097 |
| Cost per valid trial | $0.03210 | $0.04332 | +34.95% |
| Agent steps | 22.97 | 28.17 | +22.61% |
| Trial duration | 285.94 s | 296.24 s | +3.60% |

The higher binary pass rate therefore comes with more steps and higher model cost, while partial and
fail-to-pass scores move slightly against the treatment. The complete 73-execution run cost
`$2.73342557`: `$1.17378371` for 37 control executions and `$1.55964186` for 36 treatment
executions.

## Treatment adoption

- All 36 treatment trajectories issued at least one command containing `cc-check`; across them,
  268 bash tool-call commands contained `cc-check`.
- All 36 treatment patches added at least one `@cc` marker.
- None of the 37 control executions invoked `cc-check` or added an `@cc` marker.

These are mechanism-adoption markers, not a semantic quality score. This analysis does not claim
that every introduced contract was complete, useful, or subjected to a successful final per-file
audit.

## Interpretation and next gate

This three-attempt pilot is a useful directional signal, but it is not strong evidence of a general
capability improvement. There are only twelve repositories, most task-level estimates are 0/3, and
the positive difference is driven by two related formatting tasks. The secondary scores are mixed.

The result is strong enough to justify preserving the frozen setup and gathering more evidence, but
not to expand directly to all 108 tasks. A sound next step is to add five Luna attempts per cell to
reach the originally contemplated eight, then recompute the same task-macro metrics. Terra and Sol
replications should follow only if that larger Luna sample retains an explainable improvement.

The analysis is descriptive. Pier's public trial artifacts do not expose a stable shared attempt
identifier across arms, so an exact task-and-attempt McNemar analysis cannot be reconstructed without
adding pairing provenance to a future harness version.
