const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { test } = require("node:test");
const { prepareReview } = require("./prepare-review.cjs");

test("prepares a foreign checkout using bundled instructions and captured commits", async (t) => {
  const source = mkdtempSync(join(tmpdir(), "foreign-contract-source-"));
  const temp = mkdtempSync(join(tmpdir(), "contract-context-test-"));
  t.after(() => {
    rmSync(source, { recursive: true, force: true });
    rmSync(temp, { recursive: true, force: true });
  });
  const git = (...args) =>
    execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Review test");
  git("config", "user.email", "review@example.invalid");
  writeFileSync(join(source, "source.ts"), "export const value = 1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "Base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(source, "source.ts"), "export const value = 2;\n");
  git("commit", "--quiet", "-am", "Head");
  const head = git("rev-parse", "HEAD");
  git("checkout", "--quiet", "-b", "base-advanced", base);
  writeFileSync(join(source, "other.ts"), "export const other = 3;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "Base advanced");
  const advancedBase = git("rev-parse", "HEAD");
  git("checkout", "--quiet", "--detach", head);

  const request = {
    id: "123",
    pull_number: 7,
    base_sha: advancedBase,
    head_sha: head,
  };
  const files = [{ filename: "source.ts", patch: "@@ -1 +1 @@\n-old\n+new" }];
  const comments = [{ body: "Prior comment" }];
  const reviews = [{ body: "Prior review" }];
  const calls = [];
  const github = {
    rest: {
      repos: {
        compareCommitsWithBasehead: async (params) => {
          calls.push(params);
          return { data: { files } };
        },
      },
      pulls: { listReviewComments: "comments", listReviews: "reviews" },
    },
    paginate: async (route, params) => {
      calls.push(params);
      return route === "comments" ? comments : reviews;
    },
  };
  const directory = await prepareReview({
    github,
    context: { repo: { owner: "dust-tt", repo: "dust" } },
    request,
    source,
    actionPath: __dirname,
    temp,
  });
  const contextPath = join(directory, "review-context.json");
  const context = JSON.parse(readFileSync(contextPath, "utf8"));
  assert.deepEqual(context.files, files);
  assert.deepEqual(context.comments, comments);
  assert.deepEqual(context.reviews, reviews);
  assert.equal(context.merge_base, base);
  assert.equal(context.base_sha, advancedBase);
  assert.equal(context.head_sha, head);
  assert.deepEqual(calls[0], {
    owner: "dust-tt",
    repo: "dust",
    basehead: `${base}...${head}`,
    per_page: 1,
  });
  assert.deepEqual(
    calls.slice(1),
    Array(2).fill({
      owner: "dust-tt",
      repo: "dust",
      pull_number: 7,
      per_page: 100,
    }),
  );
  assert.equal(
    context.cc_check,
    resolve(__dirname, "../../../cc-check/dist/cc-check.js"),
  );
  assert.ok(
    context.validation.every(
      (check) => check.status === "passed" && !check.cwd.startsWith(source),
    ),
  );
  const prompt = readFileSync(join(directory, "review.md"), "utf8");
  assert.ok(prompt.includes(JSON.stringify(contextPath)));
  assert.ok(
    prompt.includes(readFileSync(join(__dirname, "review.md"), "utf8")),
  );
  assert.ok(
    prompt.includes(
      readFileSync(
        resolve(__dirname, "../../../skills/code-contracts/SKILL.md"),
        "utf8",
      ),
    ),
  );
  assert.equal(existsSync(join(source, "cc-check")), false);
  assert.equal(existsSync(join(source, ".github")), false);
  assert.equal(git("status", "--porcelain"), "");
});
