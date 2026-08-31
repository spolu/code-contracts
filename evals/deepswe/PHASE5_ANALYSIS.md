# Phase 5 full-corpus Luna analysis

Phase 5 is complete on the predeclared 107-task fallback. The matched evaluation used direct
`openai/gpt-5.6-luna` with reasoning effort `max`, three valid outcomes per task and arm, and no
automatic retries.

The original 108-task job and one outcome-blind replacement round left three pwntools verifier
timeouts. The authorized verifier-only regrade then failed before verifier startup because Harbor
could not reconcile the older Pier artifact destinations. Under the rule frozen before the regrade,
`pwntools-tube-multiplexing` is therefore excluded completely and symmetrically from both arms. The
remaining aiomonitor verifier timeout is replaced by its valid same-cell replacement. Raw jobs are
unchanged.

## Primary results

| Arm | Passed | Pass rate | pass@1 | pass@2 | pass@3 |
| --- | --- | --- | --- | --- | --- |
| control | 49/321 | 15.26% | 15.26% | 24.30% | 29.91% |
| code-contracts | 39/321 | 12.15% | 12.15% | 20.87% | 27.10% |
| code-contracts - control | -10 | -3.12 pp | -3.12 pp | -3.43 pp | -2.80 pp |

Micro and task-macro pass rates are identical because every task/arm cell contains exactly three
valid outcomes. pass@k is computed within each task as
`1 - C(n - successes, k) / C(n, k)` and then averaged equally over all 107 tasks.

The treatment improved 10 tasks, lost 18, and tied 79. Control solved at least one attempt on 32
tasks; code-contracts did so on 29. The complete 107-task table is emitted by the frozen analyzer;
the 28 non-tied tasks are shown here.

| Direction | Task | Control | Code-contracts | Pass-rate delta |
| --- | --- | --- | --- | --- |
| lost | `actionlint-action-pinning-lint` | 2/3 | 1/3 | -33.33 pp |
| lost | `arcane-drift-detection-baselines` | 1/3 | 0/3 | -33.33 pp |
| improved | `awilix-async-container-initialization` | 0/3 | 1/3 | +33.33 pp |
| lost | `bandit-interprocedural-taint-checks` | 1/3 | 0/3 | -33.33 pp |
| lost | `cattrs-partial-structuring-recovery` | 1/3 | 0/3 | -33.33 pp |
| lost | `claude-code-by-agents-recursive-delegation` | 3/3 | 0/3 | -100.00 pp |
| lost | `cliffy-config-file-parsing` | 1/3 | 0/3 | -33.33 pp |
| improved | `drizzle-orm-window-function-builders` | 1/3 | 3/3 | +66.67 pp |
| improved | `fastapi-deprecation-response-headers` | 0/3 | 1/3 | +33.33 pp |
| lost | `fd-deterministic-multi-key-sorting` | 2/3 | 0/3 | -66.67 pp |
| improved | `go-critic-doc-link-checker` | 0/3 | 1/3 | +33.33 pp |
| lost | `happy-dom-deterministic-intersectionobserver` | 2/3 | 1/3 | -33.33 pp |
| improved | `httpx-deterministic-cookie-store` | 1/3 | 2/3 | +33.33 pp |
| lost | `httpx-multipart-response-parsing` | 2/3 | 1/3 | -33.33 pp |
| lost | `ipython-session-bundle-replay` | 2/3 | 0/3 | -66.67 pp |
| lost | `kcp-go-multiplexed-kcp-streams` | 1/3 | 0/3 | -33.33 pp |
| lost | `mnamer-daemon-watch-lifecycle` | 1/3 | 0/3 | -33.33 pp |
| improved | `obsidian-linter-link-format-conversion` | 0/3 | 1/3 | +33.33 pp |
| lost | `ofetch-per-origin-circuit-breaker` | 3/3 | 2/3 | -33.33 pp |
| lost | `query-persist-restored-query-state` | 3/3 | 2/3 | -33.33 pp |
| lost | `scc-bounded-memory-spilling` | 1/3 | 0/3 | -33.33 pp |
| improved | `sql-formatter-bigquery-pipe-formatting` | 0/3 | 1/3 | +33.33 pp |
| improved | `sqlite-utils-safe-import-checkpoints` | 0/3 | 1/3 | +33.33 pp |
| lost | `task-task-graph-export` | 1/3 | 0/3 | -33.33 pp |
| lost | `true-myth-iterable-collection-combinators` | 2/3 | 1/3 | -33.33 pp |
| lost | `ts-pattern-match-each` | 2/3 | 1/3 | -33.33 pp |
| improved | `updo-policy-alerting` | 0/3 | 2/3 | +66.67 pp |
| improved | `vulture-persistent-analysis-cache` | 0/3 | 1/3 | +33.33 pp |

## Language results

| Language | Tasks | Control pass rate | Code-contracts pass rate | Delta |
| --- | --- | --- | --- | --- |
| TypeScript | 35 | 19.05% | 16.19% | -2.86 pp |
| Python | 33 | 12.12% | 9.09% | -3.03 pp |
| Go | 34 | 14.71% | 12.75% | -1.96 pp |
| Rust | 5 | 13.33% | 0.00% | -13.33 pp |

The point estimate is negative in every included language. The Rust stratum has only five tasks and
should not be interpreted separately as a precise effect estimate.

## Secondary results

These means use the same 321 valid outcomes per arm. Duration is total trial wall time. Patch lines
are added plus deleted lines in the submitted model patch.

| Metric | Control | Code-contracts | Treatment delta |
| --- | --- | --- | --- |
| Partial verifier score | 0.8924 | 0.8899 | -0.0025 |
| Fail-to-pass fraction | 0.6807 | 0.6841 | +0.0034 |
| Pass-to-pass fraction | 0.9691 | 0.9636 | -0.0055 |
| Input tokens per valid trial | 774,626 | 982,266 | +26.81% |
| Cached tokens per valid trial | 718,383 | 911,739 | +26.92% |
| Output tokens per valid trial | 9,386 | 10,905 | +16.19% |
| Cost per valid trial | $0.03967 | $0.04895 | +23.38% |
| Agent steps | 26.55 | 29.98 | +12.89% |
| Peak context tokens | 41,453 | 47,456 | +14.48% |
| Agent duration | 196.41 s | 226.83 s | +15.49% |
| Trial duration | 306.60 s | 328.92 s | +7.28% |
| Patch files | 5.58 | 6.39 | +14.52% |
| Patch lines | 277.09 | 304.95 | +10.05% |

Across all 643 included-corpus model executions, including the preserved aiomonitor timeout and its
replacement, control used 248,654,955 input / 230,601,034 cached / 3,012,875 output tokens and cost
`$12.73489973`; code-contracts used 315,940,368 input / 293,257,028 cached / 3,509,975 output tokens
and cost `$15.74649761`. Total included-corpus model cost was `$28.48139734`.

## Repository-clustered uncertainty

The confidence intervals are percentile intervals from 50,000 deterministic bootstrap replicates
with seed `20260831`. Each replicate resamples the 86 repositories with replacement, retains every
task belonging to each sampled repository, and recomputes the equally task-weighted treatment-minus-
control difference from task-level three-attempt means.

For pass@1, each task's finite-sample estimate is its success count divided by three, and these 107
estimates are averaged equally. This uses all three attempts instead of selecting one arbitrary run.
The repository-clustered pass@1 estimates are 15.26% for control (95% CI 10.00%–21.07%, bootstrap
SE 2.83 pp) and 12.15% for code-contracts (95% CI 7.77%–16.99%, bootstrap SE 2.37 pp).

| Metric | Treatment delta | 95% repository-clustered bootstrap CI |
| --- | --- | --- |
| Binary pass rate | -3.12 pp | [-7.37 pp, +0.93 pp] |
| Partial verifier score | -0.0025 | [-0.0243, +0.0201] |
| Input tokens per trial | +207,640 | [+164,017, +251,689] |
| Cached tokens per trial | +193,356 | [+151,196, +236,653] |
| Output tokens per trial | +1,519 | [+966, +2,449] |
| Cost per trial | +$0.00928 | [+$0.00736, +$0.01120] |
| Trial duration | +22.31 s | [+12.73 s, +32.20 s] |

The binary interval includes zero, while the resource-overhead intervals do not. This experiment
therefore estimates a negative binary point effect with meaningful uncertainty, alongside clear
increases in token use, cost, and duration.

## Treatment adoption

- All 322 included code-contracts executions, including the preserved aiomonitor timeout and its
  replacement, issued at least one bash command containing `cc-check`; 2,294 matching commands were
  recorded in total.
- All 322 included treatment patches added an `@cc` marker.
- None of the 321 included control executions invoked `cc-check` or added an `@cc` marker.

These are observable mechanism-adoption markers, not a semantic contract-quality score. They do not
establish that every contract was useful or that every trajectory completed a successful bounded
final audit.

## Interpretation

The full-corpus Luna result does not support the hypothesis that enabling the frozen code-contracts
workflow improves DeepSWE binary success. The treatment point estimate is lower overall and in each
language, improves fewer tasks than it loses, and adds material resource overhead. Partial and
fail-to-pass scores are essentially unchanged, so the binary loss is not offset by a broad increase
in verifier progress.

The analysis remains descriptive in one respect: public Pier artifacts do not expose a stable
shared attempt identifier across arms, so the preregistered exact task-and-attempt McNemar test
cannot be reconstructed. The task-level repository-clustered bootstrap preserves the matched task
structure that is observable. Failure-mode classification would require a separately authorized,
arm-blinded review and is not inferred from hidden verifier or solution artifacts here.

## Post-hoc review of sharp control-to-treatment reversals

After the aggregate analysis, three public task cells were reviewed because control passed 3/3 or
2/3 while code-contracts passed 0/3: `claude-code-by-agents-recursive-delegation` (3/3 versus 0/3),
`fd-deterministic-multi-key-sorting` (2/3 versus 0/3), and `ipython-session-bundle-replay` (2/3
versus 0/3). This review used only public task instructions, result metadata, trajectories, and
model patches. It did not inspect verifier implementation, held-out tests, or solution artifacts.

The reversals do not indicate base-code regressions: pass-to-pass was `1.0` in all eighteen trials.
They are new-feature completeness differences. Binary scoring also makes the latter two cells look
more discontinuous than their partial progress: fd treatment fail-to-pass fractions were `0.9070`,
`0.9767`, and `0.9070`, while IPython treatment fractions were `0.9412`, `0.7059`, and `0.8824`.
The delegation treatment was the clear systematic failure: all three attempts reached the same
`0.2857` fail-to-pass fraction, while all three controls reached `1.0`.

The intervention was not a compute-only extension. It appended a frozen 12,538-byte, 1,795-word
policy prompt that required contracts before implementation edits, required materially changed
behavior and new declarations to receive contracts, and required repeated `cc-check list` and
`check` operations. Relative to control, treatment used 87.5% more mean input tokens on delegation,
35.9% more on fd, and 25.7% more on IPython. It did not retain a control candidate, generate both
policies and choose the better patch, or receive a semantic oracle. Extra input and tool activity
therefore changed the sampled implementation policy rather than creating a dominance guarantee.

The public patches contain concrete semantic mistakes despite syntactically valid contracts:

- One delegation treatment suppresses child assistant chunks when `emitOutput` is false, then tries
  to accumulate those suppressed chunks, so successful child text falls back to a placeholder.
  Another streams a `tool_result` whose `content` is the entire serialized feedback object and
  omits the directly specified `is_error` field at that level. The three treatment implementations
  used different recursive generator designs, but all mixed internal collection with external
  stream representation more heavily than the passing control implementations.
- One fd treatment contract says reverse is applied before `max-results`, but the adjacent code
  truncates first and reverses second. Two treatment comparators also use raw casing as an immediate
  tie-break after a case-folded comparison, preventing later user sort keys from breaking a folded
  equality as required. The treatment attempt that avoids that premature tie-break reached the
  highest fail-to-pass fraction (`0.9767`).
- One IPython treatment implements `%session_bundle status` by printing the mapping and returning
  `None`, despite the public requirement that status produce the mapping. Another parses magic
  arguments with plain whitespace splitting instead of the shell-style parsing used by the other
  implementations, making quoted paths and redaction patterns fragile. Recording and replay designs
  also varied substantially across the three treatment attempts.

Across these cells, treatment issued 65 commands containing `cc-check`—25 for delegation, 19 for
fd, and 21 for IPython—but issued no `cc-check callers` or `references` command. Most invocations
were repeated `list` and `check` operations. As the skill itself specifies, `cc-check check`
validates grammar and identity, not whether contract prose matches implementation behavior. The fd
reverse/truncation contradiction is direct evidence that the workflow supplied a green syntactic
signal without a semantic guarantee. Full-corpus task categories do not show a simple dose effect:
lost tasks averaged 7.50 treatment `cc-check` commands, improved tasks 6.97, and tied tasks 7.05.

The sharp cells are also post-selected from 107 tasks. The experiment contains large reversals in
the other direction, including `updo-policy-alerting` at 0/3 control versus 2/3 treatment and
`drizzle-orm-window-function-builders` at 1/3 versus 3/3. The unique-solve imbalance is modest: eight
tasks were solved only by code-contracts and eleven only by control. Combined with the aggregate
binary confidence interval crossing zero, the evidence supports a small negative point effect plus
task-specific prompt sensitivity, not a claim that contracts deterministically damage these tasks.

The most informative follow-up is a preregistered multi-arm ablation on fresh tasks or fresh
attempts: (1) the original control, (2) an equal-length neutral-prompt placebo, (3) advisory contract
instructions without the hard pre-edit stop rule, and (4) contract extraction and audit after an
initial implementation-and-test pass. Keeping model and attempt budgets identical would distinguish
context load, forced sequencing, and contract semantics. A separate candidate-preserving design
could generate both a control and contract-guided patch and select using only public tests; that
would test whether extra compute can be made monotonic, unlike the current single-policy treatment.
