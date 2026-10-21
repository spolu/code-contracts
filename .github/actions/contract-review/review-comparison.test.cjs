const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { prepareReview } = require("./prepare-review.cjs");
const { publishReview } = require("./publish-review.cjs");

const actionPath = __dirname;
const context = {
  repo: { owner: "example", repo: "project" },
  serverUrl: "https://github.com",
};

function comparisonFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "cc-review-comparison-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Review test",
        GIT_AUTHOR_EMAIL: "review@example.invalid",
        GIT_COMMITTER_NAME: "Review test",
        GIT_COMMITTER_EMAIL: "review@example.invalid",
      },
    }).trimEnd();
  git("init", "--quiet");
  const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const tree = (first, changed = "line 17") => {
    const content = [...lines];
    content[0] = first;
    content[16] = changed;
    writeFileSync(join(directory, "sample.txt"), content.join("\n") + "\n");
    git("add", "sample.txt");
    return git("write-tree");
  };
  const commit = (tree, parents, message) =>
    git(
      "commit-tree",
      tree,
      ...parents.flatMap((p) => ["-p", p]),
      "-m",
      message,
    );
  const root = commit(tree("root"), [], "root");
  const left = commit(tree("left"), [root], "left");
  const right = commit(tree("right"), [root], "right");
  const base = commit(tree("left"), [left, right], "base merge");
  const head = commit(
    tree("left", "changed line 17"),
    [right, left],
    "head merge",
  );
  assert.deepEqual(
    new Set(git("merge-base", "--all", base, head).split("\n")),
    new Set([left, right]),
  );
  // GitHub may select the other best merge base from the one local Git returns.
  const localBase = git("merge-base", base, head);
  const mergeBase = localBase === left ? right : left;
  const request = { id: "42", pull_number: 7, base_sha: base, head_sha: head };
  const files = [
    {
      filename: "sample.txt",
      patch: git("diff", "--unified=3", mergeBase, head, "--", "sample.txt"),
    },
  ];
  const compare = async (params) => {
    assert.equal(params.basehead, `${base}...${head}`);
    return { data: { merge_base_commit: { sha: mergeBase }, files } };
  };
  return { directory, request, mergeBase, files, compare };
}

test("preparation uses GitHub's captured comparison when merge bases differ", async (t) => {
  const fixture = comparisonFixture(t);
  const directory = await prepareReview({
    github: {
      rest: {
        repos: { compareCommitsWithBasehead: fixture.compare },
        pulls: { listReviewComments() {}, listReviews() {} },
      },
      paginate: async () => [],
    },
    context,
    request: fixture.request,
    source: fixture.directory,
    actionPath,
    temp: fixture.directory,
  });
  const captured = JSON.parse(
    readFileSync(join(directory, "review-context.json"), "utf8"),
  );
  assert.equal(captured.merge_base, fixture.mergeBase);
  assert.deepEqual(captured.files, fixture.files);
});

test("publication uses the same merge base and retains out-of-diff findings", async (t) => {
  const fixture = comparisonFixture(t);
  const previousDirectory = process.cwd();
  process.chdir(fixture.directory);
  t.after(() => process.chdir(previousDirectory));
  let published;
  await publishReview({
    github: {
      rest: {
        repos: { compareCommitsWithBasehead: fixture.compare },
        pulls: {
          get: async () => ({ data: { state: "open" } }),
          listReviews() {},
          createReview: async (params) => {
            published = params;
          },
        },
      },
      paginate: async () => [],
    },
    context,
    core: { info() {} },
    request: fixture.request,
    review: {
      summary: "cc-verify: violations found!",
      comments: [
        {
          kind: "violation",
          path: "sample.txt",
          line: 17,
          side: "RIGHT",
          body: "Changed line.",
          recipients: [],
        },
        {
          kind: "violation",
          path: "sample.txt",
          line: 8,
          side: "RIGHT",
          body: "Outside context.",
          recipients: [],
        },
        {
          kind: "violation",
          path: "sample.txt",
          line: 8,
          side: "LEFT",
          body: "Previous source.",
          recipients: [],
        },
      ],
    },
  });
  assert.equal(published.commit_id, fixture.request.head_sha);
  assert.equal(published.event, "COMMENT");
  assert.deepEqual(published.comments, [
    { path: "sample.txt", line: 17, side: "RIGHT", body: "Changed line." },
  ]);
  assert.ok(
    published.body.includes(`/blob/${fixture.request.head_sha}/sample.txt#L8`),
  );
  assert.ok(
    published.body.includes(`/blob/${fixture.mergeBase}/sample.txt#L8`),
  );
  assert.ok(published.body.includes("Outside context."));
  assert.ok(published.body.includes("Previous source."));
});
