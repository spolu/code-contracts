# DeepSWE Code-Contracts Ablation

## Objective

Measure whether a coding agent using code contracts solves more DeepSWE tasks, misses fewer stated
requirements, or works more efficiently than the same agent without the code-contracts skill.

The first experiment uses a pilot spanning TypeScript, Python, Go, and Rust. It compares exactly two
arms:

- `control`: stock mini-swe-agent behavior.
- `code-contracts`: the same mini-swe-agent with the code-contracts skill enabled.

The pilot is an ablation of the skill and its workflows, not a comparison of different model
scaffolds. Both arms use the same model, task images, timeouts, submission mechanism, and verifier.

## Evaluation stack

- DeepSWE supplies the Harbor-format tasks and behavioral verifiers.
- Pier runs the tasks and provides the mini-swe-agent adapter, sandbox lifecycle, network policy,
  trajectories, and job results.
- mini-swe-agent supplies the shared bash-only agent loop.
- The OpenAI API supplies the model endpoint directly.
- `cc-check` is installed in both agent environments so installation and image differences do not
  confound the skill ablation.

All dependencies and inputs must be pinned before a scored run: DeepSWE commit, Pier version,
mini-swe-agent version, `cc-check` commit and build digest, skill digest, model identifier,
reasoning configuration, and pilot task manifest.

## Agent architecture

The two arms share one custom Pier adapter built on Pier's `MiniSweAgent`. The adapter owns common
installation and configuration, while a variant flag selects the prompt presented to the model.

```text
                           DeepSWE task
                                |
                                v
                     Pier trial orchestration
                                |
                  +-------------+-------------+
                  |                           |
                  v                           v
             control agent             code-contracts agent
                  |                           |
                  +-------------+-------------+
                                |
          mini-swe-agent + bash + cc-check + identical model
                                |
                                v
                 DeepSWE separate verifier environment
```

### Shared base

The shared adapter must:

1. Install the pinned mini-swe-agent and `cc-check` builds.
2. Put `cc-check` on `PATH` without mentioning it to the control agent.
3. Use the same upstream mini-swe-agent configuration, model parameters, environment variables,
   cost limits, step limits, and timeouts in both arms.
4. Preserve Pier's normal DeepSWE submission and trajectory behavior.
5. Record the resolved versions, prompt digest, model route, token usage, cost, and timing in the job
   artifacts.

### `control`

`control` receives the frozen upstream mini-swe-agent prompt and the unmodified DeepSWE task
instruction. It is not told that the code-contracts skill or `cc-check` exists.

### `code-contracts`

`code-contracts` receives the same prompt plus the frozen contents of the repository's
`code-contracts` skill and a frozen user-message workflow. The workflow requires task-relevant
contracts to be added and validated before uncovered implementation code is edited. Because
mini-swe-agent does not provide a native skill loader, the eval harness renders the skill and
workflow into a deterministic user-message extension and records its digest.

The treatment receives no task-specific contracts, verifier information, or reference-solution
information. It must discover applicable contracts and may create or update contracts from the
visible task instruction and repository evidence. This keeps the intervention representative of a
developer enabling the skill on an existing repository.

The scored comparison is intention-to-treat: a treatment trial remains in the treatment arm even if
the model ignores the skill or never invokes `cc-check`.

## Pilot subset

The pilot contains twelve tasks from twelve repositories: four TypeScript, three Go, three Python,
and two Rust. JavaScript tasks are excluded. Within each included language, the subset is selected
before any scored trajectories are inspected by sorting
`SHA256("code-contracts-pilot-v1:" + task_id)` and taking the first task from each unique repository
until that language's quota is filled.

The proposed frozen subset is:

### TypeScript

1. `sql-formatter-bigquery-pipe-formatting`
2. `drizzle-orm-window-function-builders`
3. `meriyah-explicit-resource-declarations`
4. `ts-pattern-match-each`

### Go

1. `etree-xml-diff-patch`
2. `task-task-graph-export`
3. `dasel-html-document-format`

### Python

1. `psd-tools-blend-range-api`
2. `sqlfmt-create-table-ddl-formatting`
3. `pwntools-tube-multiplexing`

### Rust

1. `wasmi-trap-coredumps`
2. `pest-character-class-coalescing`

The committed subset manifest must include each task ID, repository, language, DeepSWE commit, and
selection algorithm. Changing the subset creates a new named version rather than rewriting
`pilot-v1`.

Two additional tasks from the included languages should be reserved for infrastructure and prompt
smoke tests. They must not contribute to the scored pilot or be used to tune the skill after it is
frozen.

## Execution phases

### 1. Build and preflight

- Package `cc-check` for deterministic installation in heterogeneous DeepSWE images.
- Implement the two named Pier agent variants.
- Generate both resolved mini-swe-agent configurations and assert that only agent name, prompt
  digest, and skill content differ.
- Verify that credentials are passed at runtime and never copied into task images or job artifacts.

### 2. Smoke tests

Run single-task trials with local Docker:

- DeepSWE `nop` and `oracle` to validate task and verifier plumbing.
- Stock mini-swe-agent and `control` to establish adapter neutrality.
- `code-contracts` to confirm skill delivery, `cc-check` availability, valid submission, and complete
  trajectory capture.

Do not start scored runs until both arms have a harness-completion rate of at least 95% and no known
configuration drift.

### 3. Pilot

Run the two arms in one Pier job on local Docker so every task and attempt has a matched control and
treatment trial. Use one attempt first for operational validation, then three attempts per arm for
the scored pilot. Use an even concurrency level so paired trials run near each other in time.

Start with `gpt-5.6-luna` directly through the OpenAI API. Pier must use its OpenAI mini-swe-agent
route, and credentials must be supplied through `OPENAI_API_KEY`. Freeze the reasoning effort and all
request parameters before treatment outcomes are examined.

### 4. Expansion

If the pilot shows a useful and explainable effect:

1. Run the same frozen two-arm experiment over all 108 DeepSWE tasks written in TypeScript, Python,
   Go, or Rust.
2. Replicate the twelve-task pilot with `gpt-5.6-terra`, changing only the model identifier and any
   explicitly preregistered model-specific reasoning setting.
3. Replicate it with `gpt-5.6-sol` if the Terra result remains useful.
4. Expand the stronger-model runs to all 108 included-language tasks only after their pilot
   replications pass the same decision gate.

The five JavaScript tasks remain out of scope for this experiment version. Adding them later requires
a new version because broader language support may change the treatment's capabilities.

The model ladder is therefore Luna, then Terra, then Sol. The official model identifiers and their
supported reasoning levels are recorded in the
[OpenAI model catalog](https://developers.openai.com/api/docs/models).

## Measurements

### Primary

- Binary DeepSWE reward.
- Treatment-minus-control pass-rate difference.

### Secondary

- Fail-to-pass fraction, pass-to-pass fraction, and partial verifier score.
- Input and output tokens, cost, agent steps, peak context, and wall-clock duration.
- Timeout, malformed tool-call, API-error, and harness-error rates.
- Patch files and lines changed.

### Treatment adoption

- Whether the agent discovered, created, or edited contracts.
- Whether created contracts pass `cc-check check`.
- Number and timing of `cc-check list`, `check`, `callers`, and `references` invocations.
- Whether contracts cover the task's independently stated behavioral requirements.

Adoption metrics explain the mechanism but do not replace the intention-to-treat result.

## Analysis

Pair trials by task and attempt. Report raw arm results and the paired difference for every task.
Use exact McNemar testing for binary outcomes and repository-clustered bootstrap confidence intervals
for reward, partial score, token use, cost, and duration. With three attempts, compute pass rate from
task-level attempt means rather than treating attempts as independent tasks.

Infrastructure failures are not task failures. A predeclared symmetric retry rule must distinguish
provider or harness failures from agent timeouts and invalid submissions, which remain agent
outcomes.

Failure analysis should be blinded to the arm where practical and classify at least missed
requirements, regressions, incorrect design, incomplete implementation, invalid submission, and
external failure.

## Decision gate

Advance beyond the pilot when:

- At least 80% of treatment trials demonstrate contract usage.
- Control trials do not unexpectedly use `cc-check` or receive the skill.
- Reward or partial-score differences are positive across attempts and large enough to justify the
  added workflow.
- Missed-requirement failures decline.
- Token, cost, and duration overhead remain acceptable and are reported alongside accuracy.

The pilot is directional and mechanism-seeking; its small sample is not sufficient for a broad claim
about DeepSWE. The 108-task run across the four included languages provides the confirmatory
evidence.
