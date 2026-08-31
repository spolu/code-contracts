# Full Luna pwntools verifier regrade 01 runbook

This runbook governs the verifier-only regrade authorized after replacement 01 left three
`pwntools-tube-multiplexing` verifier timeouts. Preserve the primary, replacement, and regrade job
directories unchanged.

The regrade forks every submission in the latest pwntools replacement job for each arm: one control
submission and three code-contracts submissions. Harbor copies each source submission and its
public agent artifacts, substitutes its no-op agent at runtime, and reruns only the verifier. The
verifier timeout multiplier is doubled from `1.0` to `2.0`; the separate environment-build timeout
multiplier remains `1.0`. No model call or new patch generation is permitted.

If every one of the four regraded submissions produces a valid binary reward, use the regrade jobs
instead of both source pwntools replacement jobs in the 108-task analysis. If any regraded
submission does not produce a valid binary reward, exclude `pwntools-tube-multiplexing` completely
and symmetrically from both arms, and analyze the predeclared 107-task fallback. Do not select the
branch from rewards.

## Frozen inputs

- Control / code-contracts regrade config SHA-256:
  `fa3a6285e9fc79016266d2ba824e46a7af5b9d09c2e62b40c9ee69c2639a1397` /
  `b8b39c684903bc9eb14186e8b418aa33e097a49707ddca909bcbf9a06293a27d`
- Full / 107-task fallback manifest SHA-256:
  `85d96539172c71a38fffd07a5ef18d481d2e2efee4adc8a5647742666f41e772` /
  `72abbcb7a85edb3841d0cee4a311d6d50b8d6aae46d98271d3b5549dd915378c`
- Analyzer / preflight / analyzer test / preflight test SHA-256:
  `b300fda2ede2c6de9ebb3de4b4c96cee560cd22b9257c3e9762862f628c81fb8` /
  `c0ecff3a6197641aa91ec37938009dc21f2cfdcc6797943af9f1e6c9c9b65c99` /
  `2d0e43b90ade3c05033f3ce975ce00a274cb5eb77ffb9a53289ee9b2beacc972` /
  `bcf790d9f84790f25b931eb8c040f049f1541a230e2950b1aebbd5bde49a7fe4`
- Harness lock / `cc-check` bundle / skill SHA-256:
  `3e411d2eb53ee7d229371227c11669ff1ba96313f5c6993370104121ad0d18c1` /
  `5b4de4d3221e78fe9e9825ed2ae060833ad5f6608dd8d9837fb5d99b68c6f32f` /
  `988d40190227cf2798aad7c1c5bd2359915b92621bcec76db39142b24999c37a`
- Control source resolved config / lock / result SHA-256:
  `29279d884440be7ad27bdc164a7d14c575704ab9a2b596e622bd8991d4bbe721` /
  `a79da8b4c68fa42a6f18502a28c5fd59e1a56e3ff26cb4ed15c2341d2bf2c00f` /
  `07470f07a13e34bd877ff3d5337be80d4f854943824f168a2001d901ce4aae81`
- Code-contracts source resolved config / lock / result SHA-256:
  `af1b0be66cfed0ce77e265fd6b03b05f794f282e715343d2df28a441b6f53221` /
  `661a0ec9d4679faa0a9cfb28ed80eb9e72c43af26f778e7814bb8760f9a38324` /
  `235c2b9617ec21ca7acc7446a6e9efffb9b5707b6df2272a298e62a981074fa9`
- Harbor version: `0.22.0`

## Preflight

From `evals/deepswe`, require Docker Compose v2, a clean pinned DeepSWE checkout, passing project
and contract checks, and exact Harbor source-job expansion. The configs must expand respectively to
one and three source submissions, retain their original control and code-contracts agent identities
for provenance, select only `pwntools-tube-multiplexing`, use verifier multiplier `2.0`, use
environment-build multiplier `1.0`, and configure zero retries. Harbor must execute them as
verifier-only regrades regardless of the recorded source agent identity.

Confirm that both raw targets are absent before launch:

```text
jobs/full-v1-luna-k3-regrade-01-control-pwntools/
jobs/full-v1-luna-k3-regrade-01-code-contracts-pwntools/
```

## Launch exactly once

No model credential is needed because the agent is not rerun. Launch the two immutable jobs in
separate retained tmux sessions. Together they run at most four verifier environments.

```bash
PYTHONPATH=. uv run harbor run \
  --config config/full-v1-luna-k3-regrade-01-control-pwntools.json \
  --yes

PYTHONPATH=. uv run harbor run \
  --config config/full-v1-luna-k3-regrade-01-code-contracts-pwntools.json \
  --yes
```

Require initial public states of 1/1/0 and 3/3/0 for total/running/pending. Monitor only retained
tmux panes and aggregate public results. Do not inspect process arguments, solutions, verifier
implementations, held-out tests, or information derived from them. Do not edit raw job files or
manually retry any failure.

The pinned task permits up to 1,800 seconds for verifier-environment startup and, after startup, up
to 3,600 seconds for verifier execution. A worst-case trial can therefore reach roughly 90 minutes
plus cleanup from launch before Harbor records the timeout.

## Branch A: all four regrades valid

Analyze the immutable primary, both regrade jobs, and the successful aiomonitor replacement. Do not
also include either source pwntools replacement job because each regrade covers that entire source
job.

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/full-v1-luna-k3-relaunch-02 \
  jobs/full-v1-luna-k3-regrade-01-control-pwntools \
  jobs/full-v1-luna-k3-regrade-01-code-contracts-pwntools \
  jobs/full-v1-luna-k3-replacement-01-code-contracts-aiomonitor \
  --manifest config/full-v1.json \
  --attempts 3 \
  --allow-error-type VerifierTimeoutError \
  --format markdown
```

The analyzer must report exactly 324 valid binary results per arm.

## Branch B: any regrade invalid

Exclude pwntools symmetrically using the manifest frozen before launch. Analyze only the immutable
primary plus the successful aiomonitor replacement; explicitly ignore all primary pwntools results
and allowed infrastructure failures.

```bash
PYTHONPATH=. uv run python -m deepswe_eval.analyze \
  jobs/full-v1-luna-k3-relaunch-02 \
  jobs/full-v1-luna-k3-replacement-01-code-contracts-aiomonitor \
  --manifest config/full-v1-minus-pwntools.json \
  --attempts 3 \
  --allow-error-type VerifierTimeoutError \
  --ignore-task pwntools-tube-multiplexing \
  --format markdown
```

The analyzer must report exactly 321 valid binary results per arm across 107 tasks. It must report
the ignored pwntools records separately from the remaining allowed aiomonitor infrastructure
failure.

After either branch, append terminal state, hashes, public-artifact selection, count-only credential
scan, branch selection, and the complete analysis to `REPRODUCIBILITY.md`.
