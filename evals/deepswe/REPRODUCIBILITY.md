# DeepSWE run ledger

This append-only ledger records the commands and immutable inputs used for smoke tests, pilots, and
expansion runs. Commands run from `evals/deepswe` unless stated otherwise. Raw Pier job directories
remain unmodified under ignored `jobs/`; this file records only public configuration, aggregate
outcomes, and artifact hashes. Secret values are never recorded: `${OPENAI_API_KEY}` denotes the
runtime environment variable, not its value.

## Smoke v1 frozen inputs

- Repository base commit: `06f5729391315f091bf742f58550c545c6b28150`
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Pilot manifest SHA-256: `20f9ffb6333ee4474011a814437168c37754c7cb3a9f8e0d1300e4a9159b6788`
- Ablation config SHA-256: `f051ca45a5b58671df014b70871e213bcd8e0076c6c6a618a992eea723d191d0`
- Harness lock SHA-256: `3e411d2eb53ee7d229371227c11669ff1ba96313f5c6993370104121ad0d18c1`
- Agent source SHA-256: `068d030be5a1820fd9d777ffe86d09f3a29f56017fbbd50b674c5d0bfdac678a`
- `cc-check` bundle SHA-256: `5b4de4d3221e78fe9e9825ed2ae060833ad5f6608dd8d9837fb5d99b68c6f32f`
- Code-contracts skill SHA-256: `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`
- Treatment prompt-extension SHA-256:
  `738b9157c48cb0faa0628c8d78f3e4a7f42d5a8ac1d80ad6215562b8fd2fb4f7`
- Pier: `0.3.1`; mini-swe-agent: `2.4.6`; Node: `24.16.0`
- Model route: `openai/gpt-5.6-luna`; reasoning effort: `max`; model class:
  `litellm_response`

## Local environment

Recorded at `2026-08-29 21:27:51 CEST`:

- Host: `Darwin 25.5.0 arm64`
- Git: `2.50.1 (Apple Git-155)`
- uv: `0.11.1`
- Docker client/server: `29.1.3` / `29.1.3`
- Execution backend: local Docker

The pinned benchmark checkout was created with:

```bash
git clone --filter=blob:none https://github.com/datacurve-ai/deep-swe resolved/deep-swe
git -C resolved/deep-swe checkout 0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea
```

## Phase 2 smoke tests

### S01 — `nop` task/verifier plumbing

- Started: `2026-08-29 21:22:46 CEST`
- Task: `claude-code-by-agents-recursive-delegation` (unscored TypeScript smoke task)
- Command:

```bash
uv run pier run \
  --path resolved/deep-swe/tasks/claude-code-by-agents-recursive-delegation \
  --agent nop --env docker --jobs-dir jobs --job-name smoke-nop-typescript \
  --n-attempts 1 --n-concurrent 1 --max-retries 0 --yes
```

- Result: completed without execution errors in 46 seconds; reward `0`, partial `0.8157894736842105`
- Raw job: `jobs/smoke-nop-typescript/`
- `result.json` SHA-256: `d62da54399c255a635114cb1bd4e11a6c02101e0ac618fec92e225ef1f128d57`

### S02 — `oracle` task/verifier plumbing

- Started: `2026-08-29 21:23:40 CEST`
- Task: `claude-code-by-agents-recursive-delegation` (unscored TypeScript smoke task)
- Command:

```bash
uv run pier run \
  --path resolved/deep-swe/tasks/claude-code-by-agents-recursive-delegation \
  --agent oracle --env docker --jobs-dir jobs --job-name smoke-oracle-typescript \
  --n-attempts 1 --n-concurrent 1 --max-retries 0 --yes
```

- Result: completed without execution errors in 15 seconds; reward `1`, partial `1`
- Raw job: `jobs/smoke-oracle-typescript/`
- `result.json` SHA-256: `135c51be1c2e45bbbe692c7e41b97142bcc72609e0055650aba68d7b9fdc3f65`

### S03 — upstream mini-swe-agent baseline

- Started: `2026-08-29 21:25:25 CEST`
- Task: `goreleaser-retry-publish-auditing` (unscored Go smoke task)
- Command:

```bash
uv run pier run \
  --path resolved/deep-swe/tasks/goreleaser-retry-publish-auditing \
  --agent mini-swe-agent --model openai/gpt-5.6-luna \
  --agent-kwarg version=2.4.6 \
  --agent-kwarg reasoning_effort=max \
  --agent-kwarg model_class=litellm_response \
  --agent-kwarg cost_limit=0 \
  --agent-env 'OPENAI_API_KEY=${OPENAI_API_KEY}' \
  --env docker --jobs-dir jobs --job-name smoke-stock-go \
  --n-attempts 1 --n-concurrent 1 --max-retries 0 --yes
```

- Completed: `2026-08-29 21:34:18 CEST` after 8 minutes 52 seconds
- Result: completed without execution errors or retries; reward `0`, partial
  `0.5344827586206896`, F2P `0.06896551724137931`, P2P `1`
- Usage: 427,691 input tokens, 395,885 cache tokens, 6,774 output tokens, `$0.02399485`
- Trajectory: native mini-swe-agent and converted ATIF trajectories both captured
- Credential check: the runtime value was absent from the job tree; `lock.json` retained the literal
  `${OPENAI_API_KEY}` placeholder
- Raw job: `jobs/smoke-stock-go/`
- `result.json` SHA-256: `ae745c9b7e8e9a464dff7ccb3eaafb4bcee0d5b04e3e7d1ccef6e28f790c2131`

### S04/S05 — matched custom-agent smoke pair

- Task: `goreleaser-retry-publish-auditing` (unscored Go smoke task)
- Arms: `control` and `code-contracts`, one attempt each
- Started: `2026-08-29 21:34:58 CEST`
- Command:

```bash
PYTHONPATH=. uv run pier run \
  --config config/ablation.json \
  --path resolved/deep-swe/tasks/goreleaser-retry-publish-auditing \
  --job-name smoke-paired-go --yes
```

- Completed: `2026-08-29 21:44:48 CEST` after 9 minutes 50 seconds
- Harness result: two completed trials, zero execution errors, zero retries; both native trajectories
  converted to ATIF and both separate verifiers completed
- Control: reward/F2P/P2P/partial all `1`; 603,945 input tokens, 564,472 cache tokens, 7,122
  output tokens, 23 steps, `$0.02970064`
- Code-contracts: reward/F2P/P2P/partial all `1`; 1,158,350 input tokens, 1,106,730 cache
  tokens, 9,479 output tokens, 34 steps, `$0.04640930`
- Adapter neutrality: the stock and control native user-content SHA-256 values were identical at
  `a97b10849b3a686e7e99e6b83dffcaf2ae04c84c05c3feeb0721dd2640cfcd86`; the treatment value
  differed as expected
- Treatment delivery/adoption: frozen skill content was present only in treatment; control made zero
  `cc-check` calls, while treatment verified `/root/.local/bin/cc-check` and made three related tool
  calls, including successful file-scoped checks after one unsupported multi-file invocation
- Provenance: both arms recorded the frozen model, reasoning, agent, DeepSWE, manifest, harness,
  bundle, skill, and prompt digests after agent execution
- Credential check: the runtime value was absent from the complete job tree; `lock.json` retained
  `${OPENAI_API_KEY}` for both arms
- Raw job: `jobs/smoke-paired-go/`
- Aggregate `result.json` SHA-256:
  `3a4bc5b1c718677196b164867b74bcac4e3131b1ed438c1e33de75b1689f7a91`
- Control trial/provenance SHA-256: `bb7deea4ac1633fef0e5403210d72cded2387e3de52dfd045b3eab1a30d48dfb`
  / `9e9695989c3812e4ad64ab36dda60d51fb35e6c8deb87b2f00b8601d0e574d7d`
- Code-contracts trial/provenance SHA-256:
  `b3e8a660956f7d976e651d51b352216a424a94ffee55d044b0d99906ada71e5d` /
  `db48376a44cb289f7bdedf7a31cfa9275562792424fdeb87376e5c848070d578`

The stock baseline scored `0` while control scored `1`; one stochastic smoke attempt does not
estimate an adapter effect. The byte-identical stock/control user content and matched runtime
configuration are the adapter-neutrality checks used here.

### Phase 2 operational gate

- Plumbing and agent trials completed: `5/5` (`nop`, `oracle`, stock, control, code-contracts)
- Custom-arm harness completion: `2/2` (`100%` observed; one attempt per arm)
- Known arm configuration drift: none
- Control contamination: none observed
- Treatment delivery and `cc-check` adoption: observed
- Decision: local smoke gate passed for prompt v1; no scored pilot was started

### Prompt v2 refreeze

Recorded at `2026-08-29 21:53:28 CEST` after inspecting only the unscored v1 smoke trajectory. The v1
treatment used `cc-check` but did not create or update a code contract. The canonical skill remains
unchanged; prompt v2 appends this frozen eval-specific instruction after the skill:

```text
Use the code-contracts skill for every code change. Before editing, discover applicable contracts.
For every materially changed behavior, add or update precise, task-relevant contracts; when no
contracts exist, introduce them at the narrowest stable declaration or directory perimeter. A
behavior-preserving mechanical change need not invent a new behavioral contract. Do not finish until
`cc-check list` confirms the new or updated contracts are discoverable and `cc-check check` has
validated each affected file separately; a passing check that discovers no contracts does not
satisfy this requirement. In this non-interactive evaluation, omit `author` metadata when no
authenticated GitHub identity is available.
```

- Code-contracts skill SHA-256: unchanged at
  `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`
- Activation-instruction SHA-256:
  `321d3c07cec84121741ba8a93fb634f670b581ea487f45e5450d40b472fc6e0e`
- Treatment prompt-extension SHA-256:
  `45cd7d0a397a415ca9131500787fdb4c1d9a6c330dd9a4d6bc52fc0755536b61`
- Ablation config SHA-256: `3eb410e189e47db7c261037ed5ef927cd6ece39cb669141b9432765b806ff07c`
- Agent source SHA-256: `bd41834e4404363128b73a7c072636d8209247989bcc935dbde83787d93dea73`
- Fresh smoke manifest SHA-256:
  `6e09dc5347b5dd7c1bd56a7acfb812214293c0feb776a8c784f689e9cb7a694e`
- Fresh smoke task: `obsidian-linter-link-format-conversion`, selected by sorting eligible tasks by
  `SHA256("code-contracts-smoke-v2:" + task_id)` after excluding all pilot-v1 scored and smoke tasks
- Status: prompt v2 is frozen but untested; the Phase 2 gate is reopened and no scored run may start
  until a fresh unscored paired smoke passes

### S06/S07 — prompt-v2 matched smoke pair

- Task: `obsidian-linter-link-format-conversion` (fresh unscored TypeScript smoke task)
- Arms: `control` and `code-contracts`, one attempt each
- Command:

```bash
PYTHONPATH=. uv run pier run \
  --config config/ablation.json \
  --path resolved/deep-swe/tasks/obsidian-linter-link-format-conversion \
  --job-name smoke-prompt-v2-typescript --yes
```

- Pre-run status: pending local execution
- Required treatment evidence: frozen activation instruction delivered after the canonical skill;
  task-relevant contracts added or updated; `cc-check list` discovers them; file-scoped `cc-check
  check` succeeds; valid submission, trajectories, provenance, verifier, and credential checks pass

The run started at `2026-08-29 21:54:57 CEST`. At `2026-08-29 21:55:44 CEST`, while both agents
were still running, the activation instruction was edited. The run was stopped before verification
and is retained only as an interrupted record; it is not evidence for prompt v2 or any scored
comparison.

- Repository commit: `06f5729391315f091bf742f58550c545c6b28150` plus the uncommitted prompt-v2
  evaluation changes recorded above
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Backend: direct OpenAI `gpt-5.6-luna`, reasoning effort `max`
- End time: `2026-08-29 21:56:24 CEST`
- Attempts/retries: one attempt per arm; zero retries
- Outcome: both trials cancelled during agent execution with `CancelledError`; no verifier ran and no
  reward was produced
- Aggregate usage before cancellation: 300,645 input tokens, 240,727 cached tokens, 3,277 output
  tokens, and `$0.02372374`
- Frozen input SHA-256 values: smoke manifest
  `6e09dc5347b5dd7c1bd56a7acfb812214293c0feb776a8c784f689e9cb7a694e`, resolved job config
  `1989c0bb9737b6e7b85ee7e25444f9cabaac512b5936f746cd67c8f404f8529a`, and job lock
  `8f69cbf91ca97d78d53337333dbc765ef9093215b9f01d384dd420d787231008`
- Raw job: `jobs/smoke-prompt-v2-typescript/`
- Aggregate `result.json` SHA-256:
  `ec514d883c75d7e4f83332f7cf5e875d20f825425ad1d8b6cc8efecb34ba3599`
- Credential check: the runtime value was absent from the complete job tree; `lock.json` retained
  `${OPENAI_API_KEY}` for both arms
- Deviation: user-edited treatment instructions superseded the frozen prompt after launch; the
  interrupted job name will not be reused

### Prompt v2.1 refreeze

Recorded after reloading the user-edited activation instruction. The canonical skill and fresh
unscored task remain unchanged. Prompt v2.1 appends this frozen eval-specific instruction after the
skill:

```text
Use the code-contracts skill for every code change. Before tackling
coding tasks, discover applicable contracts or introduce code contracts relevant to the code
peripheral to the task at hand. For every materially changed behavior, add or update precise,
task-relevant contracts; when no contracts exist, introduce them at the narrowest stable declaration
or directory perimeter. A behavior-preserving mechanical change need not invent a new behavioral
contract. Do not finish until `cc-check list` confirms the new or updated contracts are discoverable
and `cc-check check` has validated each affected file separately; a passing check that discovers no
contracts does not satisfy this requirement. In this non-interactive evaluation, omit `author`
metadata when no authenticated GitHub identity is available.
```

- Code-contracts skill SHA-256: unchanged at
  `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`
- Activation-instruction SHA-256:
  `2f5c52c58b788cf3039152c8aba87277ee520896b84acdbc8cbf5125c49b9fcf`
- Treatment prompt-extension SHA-256:
  `9117bfa30c6983ecfadd5edcd2cef386670050c4e01b8d6592eee794b5ec76a1`
- Ablation config SHA-256: `b83b47a4b54c394517fc606607779a4f0043b3b283f78caaa0d059de543eb360`
- Agent source SHA-256: `8c47dc7739b0016d64075d0861f3d0ba5aeb18fcf8fff2bb4c2bb20f2c1870cc`
- Fresh smoke manifest SHA-256: unchanged at
  `6e09dc5347b5dd7c1bd56a7acfb812214293c0feb776a8c784f689e9cb7a694e`
- Status: prompt v2.1 is frozen but untested; no scored run may start until a fresh unscored paired
  smoke passes

### S08/S09 — prompt-v2.1 matched smoke pair

- Task: `obsidian-linter-link-format-conversion` (fresh unscored TypeScript smoke task)
- Arms: `control` and `code-contracts`, one attempt each
- Command:

```bash
PYTHONPATH=. uv run pier run \
  --config config/ablation.json \
  --path resolved/deep-swe/tasks/obsidian-linter-link-format-conversion \
  --job-name smoke-prompt-v2-1-typescript --yes
```

- Pre-run status: pending local execution
- Required treatment evidence: frozen activation instruction delivered after the canonical skill;
  task-relevant contracts added or updated; `cc-check list` discovers them; file-scoped `cc-check
  check` succeeds; valid submission, trajectories, provenance, verifier, and credential checks pass

The run completed locally without harness errors. Both patches failed the binary task threshold but
retained all prior passing tests and achieved near-complete partial scores. This is an operational
smoke result, not a scored estimate of treatment effect.

- Repository commit: `06f5729391315f091bf742f58550c545c6b28150` plus the uncommitted prompt-v2.1
  evaluation changes recorded above
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Backend: direct OpenAI `gpt-5.6-luna`, reasoning effort `max`
- Start/end: `2026-08-29 21:58:32 CEST` / `2026-08-29 22:03:01 CEST`
- Attempts/retries: one attempt per arm; zero retries
- Frozen input SHA-256 values: smoke manifest
  `6e09dc5347b5dd7c1bd56a7acfb812214293c0feb776a8c784f689e9cb7a694e`, source ablation config
  `b83b47a4b54c394517fc606607779a4f0043b3b283f78caaa0d059de543eb360`, resolved job config
  `2019a02ef22c9918c4137c6998c0c47003d5383d3d93ef1e3b7ecf3f83565c9b`, and job lock
  `c6f6f757bbbb8c42911a668bc8b54f1038025d635fbde11f98a80b6b34b84e4b`
- Task selection SHA-256:
  `016ddfe877c87fa56e94aa794c4a015340099a59fc10ab5776b568129a91facb`
- Aggregate result: two completed trials, zero errors/cancellations/retries; 1,473,045 input tokens,
  1,377,550 cached tokens, 15,980 output tokens, and `$0.07059340`
- Control: reward `0`, F2P `58/60`, P2P `1131/1131`, partial `0.998320738874895`, 21 agent
  steps, 495,799 input tokens, 458,525 cached tokens, 6,887 output tokens, `$0.02675025`, and
  approximately 194 seconds of agent execution
- Code-contracts: reward `0`, F2P `59/60`, P2P `1131/1131`, partial
  `0.9991603694374476`, 28 agent steps, 977,246 input tokens, 919,025 cached tokens, 9,093 output
  tokens, `$0.04384315`, and approximately 269 seconds of agent execution
- Model-visible parity: removing the single frozen extension from the treatment user content yields
  the control user content byte-for-byte
- Treatment delivery/adoption: only treatment received the skill and activation markers; it added
  `@cc link-style-conversion` to `LinkStyle`, successfully rediscovered it with `cc-check list`, and
  completed a final file-scoped `cc-check check` followed by `list` with exit code `0`
- Adoption limitation: the contract constrains style selection and protected Markdown regions but
  summarizes rather than enumerates the task's many conversion edge cases
- Control contamination: no skill marker, activation text, `cc-check` invocation, or contract was
  present in the control prompt, trajectory, or patch
- Provenance: both arms recorded the same activation, agent, bundle, DeepSWE, harness, manifest,
  model, reasoning, and skill digests; only the expected prompt-extension and resolved-prompt digests
  differed
- Credential check: the runtime value was absent from the complete job tree; `lock.json` retained
  exactly two `${OPENAI_API_KEY}` placeholders
- Raw job: `jobs/smoke-prompt-v2-1-typescript/`
- Aggregate `result.json` SHA-256:
  `c8ed003c2e3a96cbfac371c09ea0b4c225071f93d34a3bf33d1eabee83cfc36d`
- Control trial/provenance/patch SHA-256:
  `7f18c27bc94db5bb34194600cbdf53d5338c635465a552703a0cd1b003786826` /
  `3a14e8c60b6af405fd43d2efce7fd2cfed389ab55c5e00a89ba8da8b575009ad` /
  `980e675223c83ef131694a30989303652aee67d8143c6603276141b2665715a6`
- Code-contracts trial/provenance/patch SHA-256:
  `aaa07a271147914aa03bebbfcbba0da32c3f7e0677d22686b2683cc4d8a7f62b` /
  `46117efb198a8f7685fdd94f2680a4b37a229977583d2afd6175c363395b1c62` /
  `4779144ea72990e460b4f373fe8abaa6e178a9a48cbb7e19737d4b2eef3a3615`

### Phase 2 prompt-v2.1 operational gate

- Custom-arm harness completion: `2/2` (`100%` observed; one attempt per arm)
- Known arm configuration drift: none
- Control contamination: none observed
- Treatment delivery, contract creation, and successful `cc-check` validation: observed
- Decision: the local Phase 2 operational gate passes for prompt v2.1; the two binary failures are
  recorded as task outcomes rather than infrastructure failures, and no scored pilot was started

## Required continuation entries

Append an entry before interpreting results for each of the following:

1. Fresh prompt-v2 paired smoke on a newly selected unscored task, including contract creation,
   skill-delivery, `cc-check`, submission, trajectory, provenance, and credential-persistence checks.
2. One-attempt paired pilot job.
3. Three-attempt paired pilot job if the operational gate passes.
4. Any full-corpus or Terra/Sol replication.

Each entry must include the repository and DeepSWE commits, config and input digests, exact command,
start/end timestamps, backend, task/attempt counts, retries, result path and SHA-256, aggregate
reward/error/usage/timing data, and any deviation from the frozen plan. Failed and interrupted runs
remain in the ledger; they are never silently replaced.
