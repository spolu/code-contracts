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

### Prompt v3 refreeze

Recorded at `2026-08-30 09:22:03 CEST` after the activation instruction was simplified following
inspection of the unscored v2.1 smoke. The canonical skill remains unchanged. One grammatical
correction changed “relevant or related to the task that are still not covered” to “relevant to or
related to the task and are not yet covered” without changing the requested meaning. Prompt v3
appends this frozen eval-specific instruction after the skill:

```text
Important instructions: Use the code-contracts skill for every code
change. Before tackling coding tasks, discover applicable code contracts and/or introduce new code
contracts for parts of the codebase that are relevant to or related to the task and are not yet
covered.
```

- Repository commit: `2a878bb7b1878a1cb078915a42d59d3804d29f2e` plus the uncommitted prompt-v3
  evaluation changes recorded here
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Code-contracts skill SHA-256: unchanged at
  `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`
- Activation-instruction SHA-256:
  `06420de9c016da3541648c08861dc6a5d54818f47c542cc43f9e7f5e0b5e7778`
- Treatment prompt-extension SHA-256:
  `164dadd796ea22ab1a0208a8592d9d76f2e03584eaf259a3a38d64b3818c51b0`
- Ablation config SHA-256: `a11baf372392316738f1a6143e09ed94fb4c7b0185d98c0e4481b41b4a93cfa6`
- Agent source SHA-256: `1b1b76039e07fc0faae5ade49907f53d6ba5fe807b70db7d57082948251e9ce0`
- Preflight source SHA-256:
  `795651f6531c5ae9c9098ca89242cac263a87b6ed3a933ffecbc831bece9e641`
- Fresh smoke manifest SHA-256:
  `be6a1732cc140f45e0e440fcdaafa747da0e98221a8448e44aac88d77d94f791`
- Fresh smoke task: `clack-async-autocomplete-options`, selected by sorting eligible tasks by
  `SHA256("code-contracts-smoke-v3:" + task_id)` after excluding all pilot-v1 and prior
  prompt-smoke tasks
- Task selection SHA-256:
  `009158b9737afe169976da828993cfbb87268bef49441d7b43eca9a05f829927`
- Status: prompt v3 is frozen but untested; no scored run may start until its fresh unscored matched
  smoke completes

### S10/S11 — prompt-v3 matched smoke pair

- Task: `clack-async-autocomplete-options` (fresh unscored TypeScript smoke task)
- Arms: `control` and `code-contracts`, one attempt each
- Command:

```bash
PYTHONPATH=. uv run pier run \
  --config config/ablation.json \
  --path resolved/deep-swe/tasks/clack-async-autocomplete-options \
  --job-name smoke-prompt-v3-typescript --yes
```

- Pre-run status: pending local execution
- Required treatment evidence: frozen simplified activation instruction delivered after the
  canonical skill; a task-relevant contract added or updated when uncovered relevant code exists;
  `cc-check` adoption, valid submission, trajectories, provenance, verifier, and credential checks
  recorded for both arms

The run completed locally without harness errors. Both patches failed the binary task threshold,
and treatment underperformed control on the partial metrics. This is an unscored smoke result, not
an estimate of treatment effect.

- Repository commit: `2a878bb7b1878a1cb078915a42d59d3804d29f2e` plus the uncommitted prompt-v3
  evaluation changes recorded above
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Backend: direct OpenAI `gpt-5.6-luna`, reasoning effort `max`
- Start/end: `2026-08-30 09:22:28 CEST` / `2026-08-30 09:29:18 CEST`
- Attempts/retries: one attempt per arm; zero retries
- Frozen input SHA-256 values: prompt-v3 smoke manifest
  `be6a1732cc140f45e0e440fcdaafa747da0e98221a8448e44aac88d77d94f791`, source ablation config
  `a11baf372392316738f1a6143e09ed94fb4c7b0185d98c0e4481b41b4a93cfa6`, resolved job config
  `d6e165d8d296e0b1a9fafd15016919d054fb4ad1e3ef64d8ef459f2a63e61a48`, and job lock
  `c7d0f288c93d907cba04363dd2b0fe2227553ad5ab8a6542ec2a1dc9b1ff19dc`
- Aggregate result: two completed trials, zero errors/cancellations/retries; 1,834,855 input tokens,
  1,726,966 cached tokens, 21,302 output tokens, and `$0.08706647`
- Control: reward `0`, F2P `70/82`, P2P `643/643`, partial `0.983448275862069`, 22 agent
  steps, 598,690 input tokens, 556,440 cached tokens, 10,278 output tokens, `$0.03402160`, and
  approximately 281 seconds of agent execution
- Code-contracts: reward `0`, F2P `49/82`, P2P `643/643`, partial
  `0.9544827586206897`, 28 agent steps, 1,236,165 input tokens, 1,170,526 cached tokens, 11,024
  output tokens, `$0.05304487`, and approximately 410 seconds of agent execution
- Model-visible parity: removing the single frozen extension from the treatment user content yields
  the control user content byte-for-byte
- Treatment delivery: the canonical skill and simplified activation instruction appeared exactly
  once in treatment and were absent from control
- Treatment adoption: treatment searched the repository for `CONTRACTS` files but made no
  `cc-check` invocation and added no `@cc` directive or `CONTRACTS` file to its final patch
- Control contamination: no skill marker, activation text, `cc-check` invocation, or contract was
  present in the control prompt, trajectory, or patch
- Provenance: both arms recorded the same activation, agent, bundle, DeepSWE, harness, manifest,
  model, reasoning, and skill digests; only the expected prompt-extension and resolved-prompt digests
  differed
- Credential check: the runtime value was absent from the complete job tree; `lock.json` retained
  exactly two `${OPENAI_API_KEY}` placeholders
- Raw job: `jobs/smoke-prompt-v3-typescript/`
- Aggregate `result.json` SHA-256:
  `a0ea05fe0479eb29a4a91934625d875f2369c95fbe34b1fd5635a2dfb5332b4b`
- Control trial/provenance/patch SHA-256:
  `3088d33ef6c0702a104d6b4a34dbe57cf2a5d02bf51524c9e24e11c1c1180445` /
  `eb6c244abbe7131203ae2cc5d3921d048ef17084d2e164cbc7f0cbbf961a0ff5` /
  `10d07b0331eb0863125b71b980482d3827ebe0f5efce896da1850b2412be887a`
- Code-contracts trial/provenance/patch SHA-256:
  `32cc37105e98722990a44afc800fa2fc2fbb414d6e634268820704e2f8bafcf8` /
  `cb11889a65c3696b4a0258a27fb4499edc126b195b2c0d727682ca0328d65a0f` /
  `9fc1885f064c5874e9a2554c592394c044fae07a6a4982cadd7efad0b3b9551c`

### Phase 2 prompt-v3 gate

- Custom-arm harness completion: `2/2` (`100%` observed; one attempt per arm)
- Known arm configuration drift: none
- Control contamination: none observed
- Treatment delivery: observed
- Treatment contract creation and `cc-check` adoption: not observed
- Decision: prompt v3 passes the harness-completion checks but fails the treatment-mechanism gate;
  no scored pilot was started

### Prompt v4 refreeze

Recorded at `2026-08-30 09:52:31 CEST` after prompt v3 failed to produce contract creation or a
`cc-check` invocation. Prompt v4 retains the canonical skill and replaces the short user activation
with a workflow aligned to mini-swe-agent's own headings and imperative language. The workflow is
plain user-message text immediately after `</skill>`; it has no additional XML wrapper. Both arms
retain mini-swe-agent's stock system prompt. A proposed treatment-only system override was removed
before execution and was never used in a model call.

Frozen user-message workflow appended after the skill:

```text
## Code Contracts Workflow

Complete this workflow for every task that changes code.

1. Identify every declaration, file, or directory whose implementation you may change.
2. Before making any implementation edit, run `cc-check list <path>` for each target to discover its
   applicable contracts.
3. If a target has no task-relevant contracts governing the behavior you will change, STOP and cover
   it first:
   a. Add precise `@cc` contracts at the narrowest stable declaration or directory boundary.
   b. Run `cc-check list <path>` and confirm that the new contracts are discoverable.
   c. Run `cc-check check <path>` and confirm that it passes.
   d. Do not edit the implementation until these checks succeed.
4. Make the implementation changes while preserving or updating the applicable contracts.
5. Introduce every new declaration together with precise contracts governing its material behavior.
6. After implementation, run `cc-check list <path>` and `cc-check check <path>` separately for every
   affected supported source file.
7. Only after these checks pass and contract / code coherence is ensured, consider the task done.

**CRITICAL REQUIREMENTS:**

- You MUST use the code-contracts skill for every code change.
- You MUST NOT edit existing implementation code that lacks task-relevant behavioral contracts. Add
  and validate contracts first.
- Every materially changed behavior MUST be covered by new or updated contracts in the final patch.
- A successful `cc-check check` that discovers no task-relevant contracts does not satisfy this
  workflow.
- Do not invent speculative obligations; derive contracts from the task requirements and observable
  code behavior.
- If no authenticated GitHub identity is available, omit `author` metadata.
```

- Repository commit: `2a878bb7b1878a1cb078915a42d59d3804d29f2e` plus the uncommitted prompt-v4
  evaluation changes recorded here
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Code-contracts skill SHA-256: unchanged at
  `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`
- User-workflow SHA-256:
  `628db52a689dc6fedb6e297bf9f2038fcabca85db276b5edbbd618271df87f22`
- Treatment user-extension SHA-256:
  `3847d9406419e923fed112643bb714f88c6560876f1111758469d9fd8be87da3`
- Ablation config SHA-256: `da0319088f6f9c77b03b445a3a6aa8e8948cc9c446cf8393daaff5f7c0367e3c`
- Agent source SHA-256: `78b2563f6d03f7de239fe32864937ad79e5514c836eec4a7f01564dc1174f0fa`
- Preflight source SHA-256:
  `5aaccc0a6f4e8192b5bdb2765d92b96f3f064f1187e80ca51554835abb875d02`
- Fresh smoke manifest SHA-256:
  `4a2c004a759def8a3f921dc9b10d306398c7f9764e736684b653f0c4e9ebb40c`
- Fresh smoke task: `helm-array-merge-strategies`, selected by sorting eligible tasks by
  `SHA256("code-contracts-smoke-v4:" + task_id)` after excluding all pilot-v1 and prior
  prompt-smoke tasks
- Task selection SHA-256:
  `01adb98f1c3546fbfb0af7ce4c66a2c54c71135eb1282500166d3e1787d85b07`
- Status: prompt v4 configuration passes local preflight but is untested in a task environment; no
  scored pilot may start before the treatment-mechanism gate passes

### S12/S13 — prompt-v4 matched smoke pair

- Task: `helm-array-merge-strategies` (fresh unscored Go smoke task)
- Arms: `control` and `code-contracts`, one attempt each
- Command:

```bash
PYTHONPATH=. uv run pier run \
  --config config/ablation.json \
  --path resolved/deep-swe/tasks/helm-array-merge-strategies \
  --job-name smoke-prompt-v4-go --yes
```

- Pre-run status: pending local execution
- Required treatment evidence: the canonical skill and unwrapped frozen workflow are delivered only
  to treatment; contracts are introduced and validated before implementation edits; final contracts,
  `cc-check` adoption, submission, trajectories, provenance, verifier, and credential checks are
  recorded for both arms

The run completed locally without harness errors. Both patches failed the binary task threshold,
and treatment underperformed control on the partial metrics. This is an unscored smoke result, not
an estimate of treatment effect.

- Repository commit: `2a878bb7b1878a1cb078915a42d59d3804d29f2e` plus the uncommitted prompt-v4
  evaluation changes recorded above
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Backend: local Docker, direct OpenAI `gpt-5.6-luna`, reasoning effort `max`
- Start/end: `2026-08-30 09:53:27 CEST` / `2026-08-30 10:42:42 CEST`
- Attempts/retries: one attempt per arm; zero retries
- Frozen input SHA-256 values: prompt-v4 smoke manifest
  `4a2c004a759def8a3f921dc9b10d306398c7f9764e736684b653f0c4e9ebb40c`, source ablation config
  `da0319088f6f9c77b03b445a3a6aa8e8948cc9c446cf8393daaff5f7c0367e3c`, resolved job config
  `df6bf0039631fbcb50847c7f474e60b80dea7934269c69d2fa36e2206a8efad9`, and job lock
  `45ee440187102715d2c2852789dd765a2f6b9ff1f53fefd8c1b0b54158aaa3ac`
- Aggregate result: two completed trials, zero errors/cancellations/retries; 2,228,215 input tokens,
  2,135,587 cached tokens, 20,695 output tokens, and `$0.09069224`
- Control: reward `0`, F2P `35/47`, P2P `12/12`, partial `0.7966101694915254`, 35 agent
  steps, 999,445 input tokens, 957,400 cached tokens, 10,068 output tokens, `$0.04173560`, and
  approximately 2,869 seconds of agent execution
- Code-contracts: reward `0`, F2P `29/47`, P2P `12/12`, partial
  `0.6949152542372882`, 35 agent steps, 1,228,770 input tokens, 1,178,187 cached tokens, 10,627
  output tokens, `$0.04895664`, and approximately 2,955 seconds of agent execution
- Model-visible parity: both arms received byte-identical stock system messages; the unwrapped
  treatment extension appeared exactly once, and removing it from treatment user content yielded
  control user content byte-for-byte
- Treatment pre-edit adoption: treatment first found no existing contracts, then created a root
  `CONTRACTS` file with `chart-coalescing`, `merge-null-semantics`, and `strategy-extraction`; its
  next command successfully rediscovered the contracts for target source paths and checked the
  `CONTRACTS` file before the first implementation edit
- Treatment final-audit limitation: the contracts remained in the final patch and later
  `cc-check` commands succeeded, but the agent checked only a subset of affected source files and
  made a subsequent cleanup implementation edit before committing without rerunning `cc-check`;
  prompt v4 therefore achieved contract creation and pre-edit validation but not the required
  bounded final audit
- Control contamination: no skill workflow, `cc-check` invocation, `@cc` directive, or `CONTRACTS`
  file was present in the control prompt, trajectory, or patch
- Provenance: both arms recorded the same workflow, agent, bundle, DeepSWE, harness, manifest,
  model, reasoning, and skill digests; only the expected prompt-extension and resolved-prompt
  digests differed
- Credential check: the runtime value was absent from the complete job tree; `lock.json` retained
  exactly two `${OPENAI_API_KEY}` placeholders
- Raw job: `jobs/smoke-prompt-v4-go/`
- Aggregate `result.json` SHA-256:
  `5feebf3d95ecc596079a792120e30a6345ff1838f430fe1e5b56d50627ab9b46`
- Control trial/provenance/patch/trajectory SHA-256:
  `b208016449d28bd71a047dac984ba0e23333b0c8b6600bbb4f5e61327bf52fc4` /
  `e06e5729b6954083cd1017382f6f8530e24f76625cf4d9313518a1786b13793d` /
  `caeedc96f79c2b6408be8f86611ae57d2cbad870f14e5036b31c8dcfc68dd901` /
  `abc5f72c67db230eb30f291f8859c35dedea9ec32d7f5b90d524adb2f4d40e8f`
- Code-contracts trial/provenance/patch/trajectory SHA-256:
  `3166c2877f9a4818bed6a9bc617025635558b9b1bd044569695428769ebf37c1` /
  `a6d360ad6adae0a91d167144d96b2178a043a87de2a2ace7c27e5b425a188a8f` /
  `331c480074277d8e9204b7b37e6432334ecf269717bd58d939c0d54884e7a838` /
  `71fc886b1a80c958f005e9a78eba68058b20833772fdf666d9c9daf96e6703bb`

### Phase 2 prompt-v4 gate

- Custom-arm harness completion: `2/2` (`100%` observed; one attempt per arm)
- Known arm configuration drift: none
- Control contamination: none observed
- Treatment delivery, contract creation, and pre-edit contract validation: observed
- Treatment bounded final audit after the last implementation edit: not observed
- Decision: prompt v4 passes the harness and pre-edit mechanism checks but fails the complete
  treatment-mechanism gate; no scored pilot was started

## Required continuation entries

Append an entry before interpreting results for each of the following:

1. Any subsequent prompt-revision smoke on a newly selected unscored task, including contract
   creation, skill-delivery, `cc-check`, submission, trajectory, provenance, and
   credential-persistence checks.
2. One-attempt paired pilot job after the active prompt passes its mechanism gate.
3. Three-attempt paired pilot job if the operational gate passes.
4. Any full-corpus or Terra/Sol replication.

Each entry must include the repository and DeepSWE commits, config and input digests, exact command,
start/end timestamps, backend, task/attempt counts, retries, result path and SHA-256, aggregate
reward/error/usage/timing data, and any deviation from the frozen plan. Failed and interrupted runs
remain in the ledger; they are never silently replaced.

## Phase 3 Luna pilot

### Phase 2 closure decision

Recorded at `2026-08-30 12:22:54 CEST`. The user accepted Phase 2 as complete and explicitly
authorized the scored Phase 3 pilot after reviewing prompt v4's successful contract creation and
pre-edit validation together with its incomplete final per-file audit. This supersedes the earlier
operational hold without rewriting the Phase 2 record.

### P01 — three-attempt matched pilot

- Pre-run status: frozen and pending local execution
- Repository commit: `034f3d76872a9f046c1cc2052fc5cf1483943cae`
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Backend: local Docker; direct OpenAI `gpt-5.6-luna`; reasoning effort `max`
- Design: twelve `pilot-v1` tasks, two arms, three attempts per task/arm, 72 total trials,
  concurrency four, and zero retries
- Request adjustment: the initial request for eight attempts was revised to exactly three before
  the Phase 3 config was frozen and before any scored model call
- Expected cost: `$2.92` from the mean completed Luna smoke-trial cost; `$4–6` practical allowance
- Phase 3 config SHA-256:
  `375bfad156a487cc44169075557ebd30b4ed537e7738510d687ab495c7fd1354`
- Pilot manifest SHA-256:
  `20f9ffb6333ee4474011a814437168c37754c7cb3a9f8e0d1300e4a9159b6788`
- Base ablation config SHA-256:
  `da0319088f6f9c77b03b445a3a6aa8e8948cc9c446cf8393daaff5f7c0367e3c`
- Agent/analyzer/preflight source SHA-256:
  `78b2563f6d03f7de239fe32864937ad79e5514c836eec4a7f01564dc1174f0fa` /
  `2e808b34559d8d9f881900fc3cda71e44cacc117d089802be43badf1145aa4ec` /
  `a419687ef38a124327116e142355b8fc6a546cc2ea87bedf8e2ba3549e19fd2a`
- Harness lock / `cc-check` bundle / skill SHA-256:
  `3e411d2eb53ee7d229371227c11669ff1ba96313f5c6993370104121ad0d18c1` /
  `5b4de4d3221e78fe9e9825ed2ae060833ad5f6608dd8d9837fb5d99b68c6f32f` /
  `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`
- Preflight: passed with the Phase 3 config constrained to differ from the base ablation only in
  job name, exact pilot dataset, attempts, and concurrency
- Analysis: require exactly three public binary rewards in every task/arm cell; report micro and
  task-macro average pass rates plus task-macro pass@1, pass@2, and pass@3 using
  `1 - C(n - c, k) / C(n, k)` per task
- Raw job target: `jobs/pilot-v1-luna-k3/`
- Command:

```bash
PYTHONPATH=. uv run pier run \
  --config config/phase3-luna.json \
  --yes
```

- Started: `2026-08-30 12:23:27 CEST`
- Initial resolution: 72 total trials; four running and 68 pending; zero errors, cancellations, or
  retries

The scheduled job completed at `2026-08-30 14:13:28 CEST` after 1 hour 50 minutes. Pier completed
all 72 trial processes with zero cancellations or automatic retries, but one control verifier for
`pwntools-tube-multiplexing` ended with `VerifierTimeoutError` and produced no binary reward. The
other 71 trials produced binary rewards. Aggregate usage before replacement was 54,381,033 input
tokens, 50,796,934 cached tokens, 670,206 output tokens, and `$2.71578898`.

Per the frozen rule that infrastructure failures are not task failures, the failed cell receives one
outcome-blind replacement. The replacement repeats only the failed arm/task condition with identical
agent, model, reasoning, prompt, runtime, verifier timeout, and zero-retry settings. The rule applies
identically to either arm; no treatment replacement is run because no treatment trial had an
infrastructure failure. The original job remains unmodified.

- Replacement config SHA-256:
  `d610c0680cdf05e8a83e7557f849384ac19fabdf3167c13e7305df44ecb809ea`
- Replacement target: control / `pwntools-tube-multiplexing`, one attempt
- Raw replacement job target: `jobs/pilot-v1-luna-k3-replacement-01/`
- Command:

```bash
PYTHONPATH=. uv run pier run \
  --config config/phase3-luna-replacement-01.json \
  --yes
```

The replacement started at `2026-08-30 14:15:21 CEST` and completed at
`2026-08-30 14:17:11 CEST` after 1 minute 50 seconds. It produced a valid binary reward of zero with
zero errors and retries. Its usage was 177,481 input tokens, 157,077 cached tokens, 7,830 output
tokens, and `$0.01763659`.

- Primary result / resolved config / lock SHA-256:
  `4b2ec9722bcaad0b0182451b247cca50ffa277ac97c9f692829df3debe0e6502` /
  `2f56c0d1499508615ecb2541a13a91df72799bfebbbaf42b483d5cc04f05df2a` /
  `f780f21992714ba86893e081b1d2b67ff3918fbe5233fe6188e3edcbffafa46b`
- Replacement result / resolved config / lock SHA-256:
  `c425ae30b5a8f6758bb6df3df83aa048634bd98a7590ddd69e6420a1312dec74` /
  `a98f0f38a8205985ff121af4a38f21cd78a62312cf8045ff7d8c601323f5e4ea` /
  `f75f5b37cd002c56218c061810510dff552d05c074acdf3c764468be79fd45f0`
- Combined execution: 73 processes, 72 valid binary outcomes, one excluded verifier timeout, zero
  automatic retries or cancellations, 54,558,514 input tokens, 50,954,011 cached tokens, 678,036
  output tokens, and `$2.73342557`
- Sequential wall time: 1 hour 53 minutes 44 seconds from primary start through replacement finish,
  including the 1 minute 53 second operator gap

### P01 analysis

Only public `result.json` outcomes were used for the primary analysis. The raw job directories were
not edited. The analyzer was extended after the infrastructure failure only to combine immutable job
directories and explicitly report and exclude the allowed `VerifierTimeoutError`; the frozen
pass-rate and pass@k formulas were not changed.

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/pilot-v1-luna-k3 \
  jobs/pilot-v1-luna-k3-replacement-01 \
  --manifest config/pilot-v1.json \
  --attempts 3 \
  --allow-error-type VerifierTimeoutError \
  --format markdown
```

| Arm | Passed | Micro pass rate | Macro pass rate | pass@1 | pass@2 | pass@3 |
| --- | --- | --- | --- | --- | --- | --- |
| control | 7/36 | 0.1944 | 0.1944 | 0.1944 | 0.2778 | 0.3333 |
| code-contracts | 9/36 | 0.2500 | 0.2500 | 0.2500 | 0.3611 | 0.4167 |
| code-contracts - control | +2 | +0.0556 | +0.0556 | +0.0556 | +0.0833 | +0.0833 |

Treatment improved two tasks, lost one, and tied nine; six tasks had no binary success in either
arm. The complete per-task and secondary analysis is in [PHASE3_ANALYSIS.md](PHASE3_ANALYSIS.md).
Across the 36 valid outcomes per arm, code-contracts had lower mean partial score (`0.8505` versus
`0.9001`) and fail-to-pass fraction (`0.7242` versus `0.7427`), higher pass-to-pass fraction
(`0.9978` versus `0.9881`), 34.95% higher valid-trial cost, 22.61% more agent steps, and 3.60%
longer duration.

Treatment adoption was complete by the observable mechanism markers: all 36 treatment trajectories
issued at least one command containing `cc-check`, their bash tool calls contained 268 such commands,
and all 36 treatment patches added an `@cc` marker. Across 37 control executions, including the
replacement, the corresponding counts were zero. These counts do not assert semantic contract
quality or a successful final per-file audit.

All 72 primary provenance files and the replacement provenance file agree on direct OpenAI
`openai/gpt-5.6-luna`, reasoning effort `max`, DeepSWE commit, agent source, pilot manifest,
`cc-check` bundle, skill, harness lock, and activation-instruction digests. The primary job contains
36 provenance records per arm; the replacement contains one control record. Within each arm the
prompt-extension digest is constant: the control uses the empty-content digest and the treatment
uses `sha256:3847d9406419e923fed112643bb714f88c6560876f1111758469d9fd8be87da3`.

The post-run public-artifact manifest selected the top-level resolved config, lock, and result plus
each trial's public result, provenance, native trajectory, and model patch. The primary selection has
291 files and digest `0f73b3583b417d551dc95ff50bb9d0973628facf0f75ebdfafdf68ef54147a15`;
the replacement selection has seven files and digest
`deb5bcaa203086e63eac937127698f09a081e6db99586ab827a471db7a5e5541`.
Each digest hashes a newline-terminated, path-sorted manifest of
`<file SHA-256>  <job-relative path>` entries.
A full-job literal credential scan found zero runtime-key occurrences in both jobs. Sanitized lock
files contain 72 and one literal `${OPENAI_API_KEY}` placeholders, respectively.

- Final analyzer source SHA-256:
  `f6b08b5373541386983d3f58737f5f12586387a3b1b690d365d9ad444b1320b1`
- Phase 3 analysis report SHA-256:
  `a3c95413c7e9130c9fef22670d030c916caea85c22f476a103c1b5ebdfcaa398`
- Analysis limitation: the public artifacts do not expose a stable shared attempt identifier across
  arms, so exact task-and-attempt paired McNemar analysis is not reconstructed for this run
- Decision: retain this as a directional result; do not expand directly to all 108 tasks. Add five
  Luna attempts per task/arm before deciding whether to replicate with Terra and then Sol.

## Phase 4 Terra/xhigh pilot replication

### P02 — four-attempt matched pilot

Frozen at `2026-08-30 14:36:22 CEST`, before any Terra scored call.

- Frozen repository commit: `bde7c12792c9b22f1e0a17ff72eb26650b9e4f18`
- DeepSWE commit: `0b9fabbb63b9104d678fe965e1632f2dd9eaa2ea`
- Backend: local Docker; direct OpenAI `gpt-5.6-terra`; reasoning effort `xhigh`
- Design: the same twelve `pilot-v1` tasks and two arms, four attempts per task/arm, 96 total
  trials, concurrency eight, and zero retries
- User-directed deviation from the Phase 3 recommendation: proceed directly to Terra with four
  attempts per cell instead of first adding five Luna attempts per cell
- Expected cost: approximately `$36`, with a `$30–50` allowance. The estimate scales Phase 3's
  observed token mix to 96 trials using OpenAI's current Terra prices of `$2.00` per million input,
  `$0.20` per million cached-input, and `$12.00` per million output tokens.
- Phase 4 config SHA-256:
  `fff091b52577130f68df2b55bbf661698635320c7ebc189400bd5d96ba85a4da`
- Pilot manifest / Phase 3 base config SHA-256:
  `20f9ffb6333ee4474011a814437168c37754c7cb3a9f8e0d1300e4a9159b6788` /
  `375bfad156a487cc44169075557ebd30b4ed537e7738510d687ab495c7fd1354`
- Agent / preflight / analyzer source SHA-256:
  `78b2563f6d03f7de239fe32864937ad79e5514c836eec4a7f01564dc1174f0fa` /
  `bfc7cac105d1d64745692374cd0500fdad897a6b89b189a65a4f33fbd5d6be58` /
  `f6b08b5373541386983d3f58737f5f12586387a3b1b690d365d9ad444b1320b1`
- Harness lock / `cc-check` bundle / skill SHA-256:
  `3e411d2eb53ee7d229371227c11669ff1ba96313f5c6993370104121ad0d18c1` /
  `5b4de4d3221e78fe9e9825ed2ae060833ad5f6608dd8d9837fb5d99b68c6f32f` /
  `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`
- Preflight: passed; the Phase 4 config differs from frozen Phase 3 only in job name, attempts,
  concurrency, model identifier, and reasoning effort, with both arms changed symmetrically
- Analysis: require exactly four public binary rewards in every task/arm cell; report micro and
  task-macro average pass rates plus task-macro pass@1 through pass@4
- Raw job target: `jobs/pilot-v1-terra-xhigh-k4/`
- Command:

```bash
PYTHONPATH=. uv run pier run \
  --config config/phase4-terra-xhigh-k4.json \
  --yes
```

- Started: `2026-08-30 14:36:48 CEST`
- Initial resolution: 96 total trials; eight running and 88 pending; zero errors, cancellations, or
  retries

At `2026-08-30 14:43:43 CEST`, a local process-list diagnostic printed the runtime OpenAI key in the
private operator transcript because Docker Compose includes environment arguments in its process
command line. The diagnostic output is not a repository or Pier artifact, but the key must be rotated
after the run. An immediate literal scan found zero runtime-key occurrences in the Phase 4 job files;
the sanitized lock contains 96 `${OPENAI_API_KEY}` placeholders. Process-list inspection is disabled
for the remainder of the run.

The job completed at `2026-08-30 17:14:45 CEST` after 2 hours 37 minutes 57 seconds. All 96 trials
produced valid binary rewards: 48 per arm and four per task/arm cell. There were zero errors,
cancellations, and retries, so no exclusion or replacement rule was invoked. Aggregate usage was
340,217,354 input tokens, including 322,194,616 cached tokens, and 4,442,307 output tokens. Total
model cost was `$165.15773510`: `$77.66091310` for control and `$87.49682200` for code-contracts.

The `$165.16` actual cost was 4.59 times the approximately `$36` point estimate and 3.30 times the
top of the `$30-50` allowance. The estimate incorrectly transferred Phase 3 Luna's token mix to
Terra/xhigh. Relative to that 96-trial scaling, the completed run used 4.74 times as many input
tokens and 4.98 times as many output tokens. Future Terra/xhigh estimates must use a same-model
smoke sample.

- Result / resolved config / lock SHA-256:
  `d88ee7db4f7ea4c9e7cc8c8074f8e2d9d72ebd251f12be41e929dd27a2983347` /
  `c3a1879f7298175b0748dd2b8809aa70acab42e410f238dbf0ff7f57262c891b` /
  `8673a834947d496f8f0696b261564b27df1840af7fbe70dc761f8b3d39f01213`

### P02 analysis

Only public per-trial `result.json` outcomes were used for the primary analysis. The raw job
directory was not edited.

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/pilot-v1-terra-xhigh-k4 \
  --manifest config/pilot-v1.json \
  --attempts 4 \
  --format markdown
```

| Arm | Passed | Micro pass rate | Macro pass rate | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| control | 29/48 | 0.6042 | 0.6042 | 0.6042 | 0.7222 | 0.7500 | 0.7500 |
| code-contracts | 29/48 | 0.6042 | 0.6042 | 0.6042 | 0.6944 | 0.7292 | 0.7500 |
| code-contracts - control | +0 | +0.0000 | +0.0000 | +0.0000 | -0.0278 | -0.0208 | +0.0000 |

Treatment improved two tasks, lost two, and tied eight. It had higher mean partial score (`0.9974`
versus `0.9593`) and fail-to-pass fraction (`0.9795` versus `0.9410`), and a slightly lower
pass-to-pass fraction (`0.9996` versus `0.9999`). Treatment cost 12.67% more per trial, used 1.37%
more steps, and took 12.28% longer. Complete task-level and secondary results are in
[PHASE4_ANALYSIS.md](PHASE4_ANALYSIS.md).

Treatment mechanism adoption was complete by the observable markers: all 48 treatment trajectories
invoked `cc-check`, their bash tool calls contained 666 commands with `cc-check`, and all 48
treatment patches added an `@cc` marker. All corresponding control counts were zero. These markers
do not establish contract quality or a successful final per-file audit.

All 96 provenance records agree on direct OpenAI `openai/gpt-5.6-terra`, reasoning effort `xhigh`,
DeepSWE commit, mini-swe-agent and Node versions, agent source, pilot manifest, `cc-check` bundle,
skill, harness lock, and activation-instruction digests. The job contains 48 provenance records per
arm. Within each arm the prompt-extension digest is constant: control uses the empty-content digest
and treatment uses `sha256:3847d9406419e923fed112643bb714f88c6560876f1111758469d9fd8be87da3`.

The post-run public-artifact manifest selected the top-level resolved config, lock, and result plus
each trial's public result, provenance, native trajectory, and model patch. The selection contains
387 files and digest `13505f4dcbf664ffdd8b8dfe0f8a23723a7f4e0a6141c3f7c1794c6dacd5b715`.
The digest hashes a newline-terminated, path-sorted manifest of
`<file SHA-256>  <job-relative path>` entries.

A full-job literal credential scan found zero runtime-key occurrences; the sanitized lock contains
96 literal `${OPENAI_API_KEY}` placeholders. The earlier private-transcript exposure remains a
credential incident even though no repository or Pier artifact persisted the key; rotate that key
before further runs.

- Phase 4 analysis report SHA-256:
  `92ac384657db54be2b4854dbf02b8a82ad8f7666a2d3477ac2394b6f4f819b45`
- Analysis limitation: public artifacts do not expose a stable shared attempt identifier across
  arms, so exact task-and-attempt paired McNemar analysis is not reconstructed
- Decision: Terra/xhigh does not reproduce Phase 3's positive binary difference. Do not expand
  directly to all 108 tasks. A Sol run may be frozen as an independent replication, but is not a
  validation of an established positive effect.
