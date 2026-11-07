const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { reviewMarker } = require("./review-request.cjs");

async function prepareReview({ github, context, request, actionPath, temp }) {
  reviewMarker(request);
  const params = {
    ...context.repo,
    pull_number: request.pull_number,
    per_page: 100,
  };
  const [comparison, comments, reviews] = await Promise.all([
    github.rest.repos.compareCommitsWithBasehead({
      ...context.repo,
      basehead: `${request.base_sha}...${request.head_sha}`,
      per_page: 1,
    }),
    github.paginate(github.rest.pulls.listReviewComments, params),
    github.paginate(github.rest.pulls.listReviews, params),
  ]);
  const mergeBase = comparison.data.merge_base_commit.sha;
  const directory = mkdtempSync(join(temp, "contract-review-"));
  const tooling = resolve(actionPath, "../../../cc-check");
  const contextPath = join(directory, "review-context.json");
  writeFileSync(
    contextPath,
    JSON.stringify({
      ...request,
      merge_base: mergeBase,
      files: comparison.data.files ?? [],
      comments,
      reviews,
      cc_check: join(tooling, "dist/cc-check.js"),
      validation: [
        { command: "npm ci", cwd: tooling, status: "passed" },
        { command: "npm run build", cwd: tooling, status: "passed" },
      ],
    }),
  );
  const instructions = readFileSync(join(actionPath, "review.md"), "utf8");
  const skill = readFileSync(
    resolve(actionPath, "../../../skills/code-contracts/SKILL.md"),
    "utf8",
  );
  writeFileSync(
    join(directory, "review.md"),
    [
      `Read the review context at ${JSON.stringify(contextPath)}.`,
      instructions,
      "## Bundled code-contracts skill",
      skill,
    ].join("\n\n"),
  );
  return directory;
}

module.exports = { prepareReview };
