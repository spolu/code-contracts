# Contract review

Review a PR in the calling repository and publish a `COMMENT` review pinned to the inspected head.
This action bundles the review scripts, prompt, schema, code-contracts skill, and `cc-check` source.
It builds its own tooling; the calling repository needs no Node project, review scripts, or local
`cc-check` installation. Source is checked out into `.contract-review/source`.

For example, Dust can call this action after its review bot has detected `cc` in an `r?` handle list
and emitted a `pull-request-number` output:

```yaml
name: Contract review

on:
  pull_request_target:
    types: [opened, edited]
  issue_comment:
    types: [created, edited]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      # The existing bot can emit this output, or use the companion detector:
      - uses: spolu/code-contracts/.github/actions/review-bot@main
        id: review-bot

      - uses: spolu/code-contracts/.github/actions/contract-review@main
        if: steps.review-bot.outputs.pull-request-number != ''
        with:
          pull-request-number: ${{ steps.review-bot.outputs.pull-request-number }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

Select the desired action revision in both `uses` entries; a commit SHA pins it exactly. Remote
actions need no preceding checkout. The companion detector accepts `pull_request` or
`pull_request_target` events with `opened`/`edited`, and `issue_comment` with `created`/`edited`.
Dust's existing bot may instead supply a PR number from any of its supported request events.
The detector only recognizes requests; GitHub reviewer assignment and Slack delivery remain the
responsibility of the caller's bot.

Use a fresh GitHub-hosted Ubuntu runner with sudo available. The action creates `codex-review` and
runs Codex as that unprivileged user in a read-only sandbox. Allow one invocation per job. Both
review and publication run in the action's job, which needs `contents: read` and
`pull-requests: write`. The caller supplies `OPENAI_API_KEY` as a repository secret.

| Input                 | Default        | Purpose                             |
| --------------------- | -------------- | ----------------------------------- |
| `pull-request-number` | Required       | PR in the caller's repository.      |
| `openai-api-key`      | Required       | OpenAI API key.                     |
| `github-token`        | `github.token` | Read source and publish PR reviews. |
| `model`               | `gpt-5.6-luna` | Codex model.                        |
| `effort`              | `xhigh`        | Reasoning effort.                   |

Only human actors with repository write, maintain, or admin access can review open PRs with heads
in the same repository, including drafts. The calling bot decides whether text requests a review;
this action checks access, captures the base/head, and skips requests already published for the same
workflow run and commits. A fresh run may review the same commits again.

The `request` output contains the captured request JSON; `review` contains Codex's review JSON.
Skipped requests leave both outputs empty. Reviews never approve or request changes. Existing
contract changes notify owners; violations notify only explicitly configured `notify` recipients.
Findings outside the commentable diff retain source permalinks in the review body.

Local validation:

```sh
node --test .github/actions/*/*.test.cjs
```
