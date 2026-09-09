const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  hasReviewRequest,
  getReviewPullNumber,
} = require("./review-request.cjs");

function event(
  eventName = "issue_comment",
  action = "created",
  body = "r? cc",
) {
  return {
    eventName,
    actor: "requester",
    runId: 123,
    repo: { owner: "example", repo: "contracts" },
    payload: {
      action,
      sender: { type: "User" },
      ...(eventName === "issue_comment"
        ? {
            issue: { number: 7, pull_request: {} },
            comment: { body, user: { login: "author" } },
          }
        : { pull_request: { number: 7, body } }),
    },
  };
}

test("recognizes cc anywhere in the leading handle list, with optional trailing prose", () => {
  for (const body of [
    "r? cc",
    "r? @spolu cc",
    "r? @dbd cc",
    "r? @handle1 cc @handle2 please review",
    "r? cc please review",
    "r? cc @handle2 please review",
    "r? @handle1 cc please review",
    "r? @handle1 CC @handle2",
    "r? cc more text",
    "r? @alice @bob-2 cc",
    "Description\n\nr? cc\n\nMore details",
    "  R?\t@Spolu\tCC  \r\n",
    "```text\nexample\n```\nr? cc",
    "<!-- example -->\nr? cc",
  ])
    assert.equal(hasReviewRequest(body), true, body);
});

test("ignores prose, quotes, code examples, hidden comments, and lookalike commands", () => {
  for (const body of [
    null,
    "",
    "please run r? cc",
    "r? cc-check",
    "r? @cc",
    "r? @spolu",
    "r? cccc",
    "r? @handle1 please cc review",
    "r? @handle1 please @handle2 cc",
    "r? @handle1 cc, please review",
    "r? @team/reviewers cc",
    "r? @handle1 <!-- hidden\ncomment --> cc",
    "r? <!-- hidden\ncomment --> cc",
    "r? @bad_name cc",
    "r? @spolu\ncc",
    "> r? cc",
    "`r? cc`",
    "    r? cc",
    "\tr? cc",
    "```\nr? cc\n```",
    "~~~text\nr? cc\n~~~",
    "````\n```\nr? cc\n````",
    "<!--\nr? cc\n-->",
    "<!--\nr? cc",
  ])
    assert.equal(hasReviewRequest(body), false, String(body));
});

test("emits PR numbers for new description and conversation requests", () => {
  for (const context of [
    event(),
    event("pull_request", "opened"),
    event("pull_request_target", "opened"),
  ])
    assert.equal(getReviewPullNumber(context), 7);
});

test("edits request a review only when they introduce a command", async () => {
  for (const eventName of [
    "issue_comment",
    "pull_request",
    "pull_request_target",
  ]) {
    for (const previous of [
      "Description",
      "r? @spolu",
      "r? @spolu please cc review",
      null,
    ]) {
      const context = event(eventName, "edited");
      context.payload.changes = { body: { from: previous } };
      assert.deepEqual(getReviewPullNumber(context), 7);
    }
    for (const changes of [
      undefined,
      { title: { from: "Old title" } },
      { body: { from: "r? @dbd cc" } },
      { body: { from: "r? @dbd cc @someone please review" } },
      { body: { from: "Description\nr? cc\n" } },
    ]) {
      const context = event(eventName, "edited");
      context.payload.changes = changes;
      assert.equal(getReviewPullNumber(context), null);
    }
  }
});

test("ordinary events and issue comments never request reviews", async () => {
  const issue = event();
  delete issue.payload.issue.pull_request;
  const bot = event();
  bot.payload.sender.type = "Bot";
  for (const context of [
    issue,
    bot,
    event("issue_comment", "deleted"),
    event("issue_comment", "created", "Thanks"),
    event("pull_request", "synchronize"),
    event("pull_request", "reopened"),
    event("pull_request", "ready_for_review"),
    event("push", "created"),
  ])
    assert.equal(getReviewPullNumber(context), null);
});
