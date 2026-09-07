const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  hasReviewRequest,
  resolveReviewRequest,
  reviewMarker,
} = require("./review-request.cjs");

const pr = {
  number: 7,
  state: "open",
  draft: false,
  base: { sha: "a".repeat(40) },
  head: { sha: "b".repeat(40), repo: { full_name: "example/contracts" } },
};
const request = {
  id: "123",
  pull_number: pr.number,
  base_sha: pr.base.sha,
  head_sha: pr.head.sha,
};

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
            issue: { number: pr.number, pull_request: {} },
            comment: { body, user: { login: "author" } },
          }
        : { pull_request: { ...pr, body } }),
    },
  };
}

async function resolve(context = event(), options = {}) {
  const calls = [];
  const github = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async (params) => {
          calls.push({ route: "permission", ...params });
          if (options.error) throw options.error;
          return { data: { permission: options.permission ?? "write" } };
        },
      },
      pulls: {
        get: async (params) => {
          calls.push({ route: "pr", ...params });
          return { data: options.pr ?? pr };
        },
        listReviews: "reviews",
      },
    },
    paginate: async (route, params) => {
      calls.push({ route, ...params });
      return options.reviews ?? [];
    },
  };
  const result = await resolveReviewRequest({
    github,
    context,
    core: { info() {} },
  });
  return { result, calls };
}

test("recognizes standalone requests with optional GitHub mentions in PR text", () => {
  for (const body of [
    "r? cc",
    "r? @spolu cc",
    "r? @dbd cc",
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
    "r? cc more text",
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

test("resolves newly posted requests to the live PR head, including drafts", async () => {
  for (const context of [event(), event("pull_request", "opened")]) {
    const current = {
      ...pr,
      draft: true,
      head: { ...pr.head, sha: "c".repeat(40) },
    };
    const { result, calls } = await resolve(context, { pr: current });
    assert.deepEqual(result, { ...request, head_sha: current.head.sha });
    assert.deepEqual(calls[1], {
      route: "pr",
      owner: "example",
      repo: "contracts",
      pull_number: 7,
    });
  }
});

test("edits request a review only when they introduce a command", async () => {
  for (const eventName of ["issue_comment", "pull_request"]) {
    for (const previous of ["Description", "r? @spolu", null]) {
      const context = event(eventName, "edited");
      context.payload.changes = { body: { from: previous } };
      assert.deepEqual((await resolve(context)).result, request);
    }
    for (const changes of [
      undefined,
      { title: { from: "Old title" } },
      { body: { from: "r? @dbd cc" } },
      { body: { from: "Description\nr? cc\n" } },
    ]) {
      const context = event(eventName, "edited");
      context.payload.changes = changes;
      assert.deepEqual(await resolve(context), { result: null, calls: [] });
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
    assert.deepEqual(await resolve(context), { result: null, calls: [] });
});

test("checks the requesting actor's write access, including comment edits", async () => {
  const context = event("issue_comment", "edited");
  context.payload.changes = { body: { from: "Old comment" } };
  for (const permission of ["write", "maintain", "admin"]) {
    const { result, calls } = await resolve(context, { permission });
    assert.deepEqual(result, request);
    assert.equal(calls[0].username, "requester");
  }
  for (const options of [
    { permission: "read" },
    { permission: "triage" },
    { permission: "none" },
    { error: { status: 404 } },
  ]) {
    const { result, calls } = await resolve(context, options);
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
  await assert.rejects(
    resolve(context, { error: new Error("API unavailable") }),
    /API unavailable/,
  );
});

test("rejects closed PRs, forks, and deleted head repositories", async () => {
  for (const current of [
    { ...pr, state: "closed" },
    { ...pr, head: { ...pr.head, repo: { full_name: "outside/contracts" } } },
    { ...pr, head: { ...pr.head, repo: null } },
  ]) {
    const { result, calls } = await resolve(event(), { pr: current });
    assert.equal(result, null);
    assert.equal(
      calls.some((call) => call.route === "reviews"),
      false,
    );
  }
});

test("skips published retries but permits fresh requests on identical commits", async () => {
  const review = { user: { type: "Bot" }, body: reviewMarker(request) };
  assert.equal((await resolve(event(), { reviews: [review] })).result, null);
  assert.deepEqual(
    (await resolve({ ...event(), runId: 124 }, { reviews: [review] })).result,
    { ...request, id: "124" },
  );
  const human = { ...review, user: { type: "User" } };
  assert.deepEqual(
    (await resolve(event(), { reviews: [human] })).result,
    request,
  );
});
