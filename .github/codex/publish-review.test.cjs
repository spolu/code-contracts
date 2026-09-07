const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { after, test } = require("node:test");
const { reviewMarker } = require("./review-request.cjs");

const publisher = require.resolve("./publish-review.cjs");
const directory = mkdtempSync(join(tmpdir(), "contract-review-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const git = (...args) =>
  execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
git("init", "--quiet");
git("config", "user.name", "Review test");
git("config", "user.email", "review@example.invalid");
writeFileSync(
  join(directory, "source.ts"),
  "// old contract\noldImplementation();\n",
);
writeFileSync(join(directory, "caller.ts"), "callWithInvalidInput();\n");
writeFileSync(join(directory, "removed.ts"), "// removed contract\n");
writeFileSync(
  join(directory, "old-name.ts"),
  "oldCall();\nunchanged();\nunchanged();\nunchanged();\n",
);
git("add", ".");
git("commit", "--quiet", "-m", "Base fixture");
const base = git("rev-parse", "HEAD");
writeFileSync(
  join(directory, "source.ts"),
  "// new contract\nnewImplementation();\n",
);
git("rm", "--quiet", "removed.ts");
git("mv", "old-name.ts", "new-name.ts");
writeFileSync(
  join(directory, "new-name.ts"),
  "newCall();\nunchanged();\nunchanged();\nunchanged();\n",
);
git("add", ".");
git("commit", "--quiet", "-m", "Head fixture");
const head = git("rev-parse", "HEAD");
const files = [
  { filename: "source.ts", patch: git("diff", base, head, "--", "source.ts") },
  {
    filename: "removed.ts",
    patch: git("diff", base, head, "--", "removed.ts"),
  },
  {
    filename: "new-name.ts",
    previous_filename: "old-name.ts",
    patch: git(
      "diff",
      "--find-renames",
      base,
      head,
      "--",
      "old-name.ts",
      "new-name.ts",
    ),
  },
];
const pr = {
  number: 7,
  state: "open",
  draft: false,
  base: { sha: base },
  head: { sha: head },
};
const request = {
  id: "123",
  pull_number: pr.number,
  base_sha: base,
  head_sha: head,
};
const comment = (overrides = {}) => ({
  kind: "violation",
  path: "source.ts",
  line: 2,
  side: "RIGHT",
  body: "The implementation breaks `positive-input`.",
  recipients: ["spolu", "flvndvd"],
  ...overrides,
});

function run(comments, options = {}) {
  // Exercise the publisher in a real Git checkout with a fake GitHub transport; never post a review.
  const script = `
    const { publishReview } = require(${JSON.stringify(publisher)});
    const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    const calls = [];
    let reads = 0;
    const github = {
      rest: { pulls: {
        get: async () => ({ data: ++reads > 1 ? input.latest : input.current }),
        listFiles: 'files', listReviews: 'reviews',
        createReview: async (review) => calls.push(review),
      } },
      paginate: async (route) => input[route],
    };
    publishReview({ github, context: input.context, core: { info() {} }, review: input.review, request: input.request })
      .then(() => process.stdout.write(JSON.stringify({ calls })))
      .catch((error) => process.stdout.write(JSON.stringify({ error: error.message, calls })));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ["-e", script], {
      cwd: directory,
      encoding: "utf8",
      input: JSON.stringify({
        context: {
          repo: { owner: "example", repo: "contracts" },
          serverUrl: "https://github.com",
          payload: { issue: { number: pr.number, pull_request: {} } },
        },
        request,
        current: pr,
        latest: pr,
        files,
        reviews: [],
        review: {
          summary: "Inspected 24 of 30 callers; 6 remain uninspected.",
          comments,
        },
        ...options,
      }),
    }),
  );
}

test("submits a COMMENT review at the head with separate owner and violation notifications", () => {
  const result = run([
    comment({
      kind: "contract-change",
      line: 1,
      body: "ignored",
      recipients: ["alice", "bob", "ALICE"],
    }),
    comment(),
    comment({
      path: "removed.ts",
      kind: "contract-change",
      line: 1,
      side: "LEFT",
      recipients: ["old-owner"],
    }),
  ]);
  assert.equal(result.error, undefined);
  const review = result.calls[0];
  assert.equal(review.event, "COMMENT");
  assert.equal(review.commit_id, head);
  assert.equal(review.comments.length, 3);
  assert.equal(review.comments[0].body, "cc @ALICE @bob");
  assert.equal(
    review.comments[1].body,
    "The implementation breaks `positive-input`.\n\ncc @spolu @flvndvd",
  );
  assert.equal(review.comments[2].side, "LEFT");
  assert.equal(review.comments[2].body, "cc @old-owner");
  assert.match(review.body, /24 of 30/);
});

test("retains each unchanged caller finding with a permalink and its notification", () => {
  const review = run([comment({ path: "caller.ts", line: 1 })]).calls[0];
  assert.deepEqual(review.comments, []);
  assert.ok(review.body.includes(`/blob/${head}/caller.ts#L1`));
  assert.ok(review.body.includes("cc @spolu @flvndvd"));
});

test("missing patches preserve source links, including deleted contracts at the merge base", () => {
  const review = run([comment({ path: "removed.ts", line: 1, side: "LEFT" })], {
    files: [],
  }).calls[0];
  assert.deepEqual(review.comments, []);
  assert.ok(review.body.includes(`/blob/${base}/removed.ts#L1`));
});

test("maps old-side rename locations to GitHub's new filename", () => {
  const review = run([comment({ path: "old-name.ts", line: 1, side: "LEFT" })])
    .calls[0];
  assert.equal(review.comments[0].path, "new-name.ts");
  assert.equal(review.comments[0].side, "LEFT");
});

test("keeps violations without recipients, skips empty owner notifications, and deduplicates", () => {
  const review = run([
    comment({ recipients: [] }),
    comment({ recipients: [] }),
    comment({ kind: "contract-change", recipients: [] }),
  ]).calls[0];
  assert.equal(review.comments.length, 1);
  assert.equal(
    review.comments[0].body,
    "The implementation breaks `positive-input`.",
  );
});

test("skips stale, closed, already-reviewed requests, and concurrently updated PRs", () => {
  for (const options of [
    { current: { ...pr, head: { sha: base } } },
    { current: { ...pr, base: { sha: head } } },
    { current: { ...pr, state: "closed" } },
    {
      reviews: [
        {
          user: { type: "Bot" },
          body: reviewMarker(request),
        },
      ],
    },
    { latest: { ...pr, head: { sha: base } } },
    { latest: { ...pr, base: { sha: head } } },
    { latest: { ...pr, state: "closed" } },
  ])
    assert.deepEqual(run([comment()], options).calls, []);
});

test("publishes requested reviews on drafts, including PRs changed to draft during review", () => {
  for (const current of [pr, { ...pr, draft: true }]) {
    const result = run([], { current, latest: { ...pr, draft: true } });
    assert.equal(result.error, undefined);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].event, "COMMENT");
    assert.equal(result.calls[0].commit_id, head);
  }
});

test("a fresh request can publish another review of the same commits", () => {
  const result = run([], {
    request: { ...request, id: "124" },
    reviews: [{ user: { type: "Bot" }, body: reviewMarker(request) }],
  });
  assert.equal(result.error, undefined);
  assert.equal(result.calls.length, 1);
  assert.ok(
    result.calls[0].body.includes(reviewMarker({ ...request, id: "124" })),
  );
});

test("rejects missing or invalid request snapshots before publishing", () => {
  for (const invalid of [
    undefined,
    { ...request, id: "bad-->" },
    { ...request, head_sha: "main" },
  ]) {
    const result = run([], { request: invalid });
    assert.match(result.error, /Invalid contract review request/);
    assert.deepEqual(result.calls, []);
  }
});

test("rejects invalid locations and recipients before posting any review", () => {
  for (const invalid of [
    { path: "../outside.ts" },
    { line: 0 },
    { line: 999 },
    { recipients: ["spolu;flvndvd"] },
    { side: "APPROVE" },
    { body: "" },
  ]) {
    const result = run([comment(invalid)]);
    assert.ok(result.error);
    assert.deepEqual(result.calls, []);
  }
});
