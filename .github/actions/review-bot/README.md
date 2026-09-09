# Review bot

Detect `cc` in the leading list of handles after `r?`, using whitespace-separated GitHub user
mentions and bare `cc`. Trailing prose ends the list:

```text
r? @alice cc @bob please review
r? cc please review
r? @alice cc please review
```

These request a contract review. `r? @alice please review cc when ready` does not. `@cc`, `cc-check`,
and `cc,` are not the bare `cc` handle. Matching is case-insensitive. Requests must begin a line
with at most three spaces; quoted, fenced, indented-code, and HTML-comment examples are ignored.

Opening a PR or posting a conversation comment requests a review. Editing a PR description or
comment requests a review only when the previous body did not contain an eligible `cc` request.
Pushes and title edits do not request reviews. Supports `pull_request` and `pull_request_target`
`opened`/`edited` events and `issue_comment` `created`/`edited` events on PRs. Bot senders are ignored.

The composite action emits `pull-request-number` for a request, or an empty output otherwise.
The caller passes nonempty outputs to [contract-review](../contract-review/README.md), which checks
repository access and PR eligibility before running Codex. This detector makes no GitHub changes
or Slack notifications; it can also run alongside an existing bot handling human reviewers.

See [the repository workflow](../../workflows/review-bot.yml) for local action usage and the
[contract-review README](../contract-review/README.md) for usage from another repository.
