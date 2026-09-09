# Contract review

Review a PR in the calling repository and publish a `COMMENT` review pinned to the inspected head.
This action bundles the review scripts, prompt, schema, code-contracts skill, and `cc-check` source.
It builds its own tooling; the calling repository needs no Node project, review scripts, or local
`cc-check` installation. Source is checked out into `.contract-review/source`.

Dispatch the review on the PR's head branch so its workflow run appears in the PR's checks.
For example, save this as `.github/workflows/contract-review.yml`:

```yaml
name: Contract review
run-name: >-
  ${{ github.event_name == 'workflow_dispatch' && format('Contract review #{0}', inputs.pull-request-number) || 'Review request' }}

on:
  pull_request_target:
    types: [opened, edited]
  issue_comment:
    types: [created, edited]
  workflow_dispatch:
    inputs:
      pull-request-number:
        description: PR to review; select its head branch when dispatching manually.
        required: true
        type: string
      request-run-id:
        description: Original request run ID when dispatched by the review bot.
        required: false
        type: string

permissions:
  contents: read

jobs:
  request:
    if: github.event_name != 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      actions: write
    steps:
      - uses: spolu/code-contracts/.github/actions/review-bot@main
        with:
          review-workflow: contract-review.yml

  review:
    name: ${{ github.event_name == 'workflow_dispatch' && 'Contract review' || 'Review dispatch' }}
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      actions: read
    steps:
      - uses: spolu/code-contracts/.github/actions/contract-review@main
        with:
          pull-request-number: ${{ inputs.pull-request-number }}
          request-run-id: ${{ inputs.request-run-id }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

Select the desired action revision in both `uses` entries; a commit SHA pins it exactly. Remote
actions need no preceding checkout. The companion detector accepts `pull_request` or
`pull_request_target` events with `opened`/`edited`, and `issue_comment` with `created`/`edited`.
Register the workflow in the repository before dispatching it, normally by merging it into the
default branch. An existing bot can dispatch the same workflow with the PR number and the
originating request run ID. Direct invocation with a `pull-request-number` also remains supported;
on comment-triggered runs, GitHub attaches that workflow to the default branch instead of the PR.
The detector only recognizes requests; GitHub reviewer assignment and Slack delivery remain the
responsibility of the caller's bot.

Use a fresh GitHub-hosted Ubuntu runner with sudo available. The action creates `codex-review` and
runs Codex as that unprivileged user in a read-only sandbox. Allow one invocation per job. Both
review and publication run in the action's job, which needs `contents: read` and
`pull-requests: write`, plus `actions: read` for delegated requests. The caller supplies
`OPENAI_API_KEY` as a repository secret.

| Input                 | Default        | Purpose                                                         |
| --------------------- | -------------- | --------------------------------------------------------------- |
| `pull-request-number` | Required       | PR in the caller's repository.                                  |
| `openai-api-key`      | Required       | OpenAI API key.                                                 |
| `github-token`        | `github.token` | Read source and publish PR reviews.                             |
| `request-run-id`      | Empty          | Original human request's workflow run, when delegated by a bot. |
| `model`               | `gpt-5.6-luna` | Codex model.                                                    |
| `effort`              | `xhigh`        | Reasoning effort.                                               |

Only human actors with repository write, maintain, or admin access can review open PRs with heads
in the same repository, including drafts. The calling bot decides whether text requests a review;
this action checks access, captures the base/head, and skips requests already published for the same
workflow run and commits. A fresh run may review the same commits again.

For `workflow_dispatch`, select the PR's head branch. The action inspects that workflow run's
commit, even if the branch advances while queued or running. Later pushes do not cancel reviews
or request new ones; send another `r? cc` to review the newer commit. Delegated retries keep the
original request ID. For a direct manual dispatch, omit `request-run-id` to use the dispatching
human's identity and create a fresh request.

The `request` output contains the captured request JSON; `review` contains Codex's review JSON.
Skipped requests leave both outputs empty. Reviews never approve or request changes. Existing
contract changes notify owners; violations notify only explicitly configured `notify` recipients.
Findings outside the commentable diff retain source permalinks in the review body.
