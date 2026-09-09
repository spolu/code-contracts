const assert = require("node:assert/strict");
const { test } = require("node:test");
const { resolveReviewRequest, reviewMarker } = require("./review-request.cjs");

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
    pullNumber: options.pullNumber ?? pr.number,
    core: { info() {} },
  });
  return { result, calls };
}

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

test("rejects invalid PR numbers and ignores bot requesters", async () => {
  for (const pullNumber of [0, -1, 1.5, "7", NaN])
    await assert.rejects(
      resolve(event(), { pullNumber }),
      /Invalid pull request number/,
    );
  const context = event();
  context.payload.sender.type = "Bot";
  assert.deepEqual(await resolve(context), { result: null, calls: [] });
});
