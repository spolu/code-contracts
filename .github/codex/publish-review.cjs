const { execFileSync } = require("node:child_process");
const { reviewMarker } = require("./review-request.cjs");

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trimEnd();
}

function diffLines(patch = "") {
  const lines = { LEFT: new Set(), RIGHT: new Set() };
  let left;
  let right;
  for (const text of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      left = Number(hunk[1]);
      right = Number(hunk[2]);
    } else if (left !== undefined && text.startsWith("-")) {
      lines.LEFT.add(left++);
    } else if (right !== undefined && text.startsWith("+")) {
      lines.RIGHT.add(right++);
    } else if (left !== undefined && text.startsWith(" ")) {
      left++;
      lines.RIGHT.add(right++);
    }
  }
  return lines;
}

function renderComment(comment) {
  const { kind, path, line, side, body, recipients } = comment;
  if (
    !["contract-change", "violation"].includes(kind) ||
    typeof path !== "string" ||
    path.length === 0 ||
    path.startsWith("/") ||
    path
      .split("/")
      .some((part) => part === ".." || part === "." || part === "") ||
    !Number.isSafeInteger(line) ||
    line < 1 ||
    !["LEFT", "RIGHT"].includes(side) ||
    typeof body !== "string" ||
    !Array.isArray(recipients)
  ) {
    throw new Error("Invalid contract review comment");
  }
  const usernames = new Map();
  for (const username of recipients) {
    if (
      typeof username !== "string" ||
      !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)
    ) {
      throw new Error("Invalid notification username");
    }
    usernames.set(username.toLowerCase(), username);
  }
  const cc = usernames.size
    ? `cc ${[...usernames.values()].map((name) => `@${name}`).join(" ")}`
    : "";
  if (kind === "contract-change") return cc;
  if (!body.trim())
    throw new Error("Contract violations require an explanation");
  return [body.trim(), cc].filter(Boolean).join("\n\n");
}

async function publishReview({ github, context, core, review, request }) {
  if (
    !review ||
    typeof review.summary !== "string" ||
    !review.summary.trim() ||
    !Array.isArray(review.comments)
  ) {
    throw new Error("Invalid contract review output");
  }
  const marker = reviewMarker(request);
  const params = { ...context.repo, pull_number: request.pull_number };
  const { data: current } = await github.rest.pulls.get(params);
  if (
    current.state !== "open" ||
    current.head.sha !== request.head_sha ||
    current.base.sha !== request.base_sha
  ) {
    core.info("Skipping review because the PR state or base/head changed.");
    return;
  }

  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    ...params,
    per_page: 100,
  });
  if (
    reviews.some(
      (item) => item.user?.type === "Bot" && item.body?.includes(marker),
    )
  ) {
    core.info("This request has already published a review for these commits.");
    return;
  }

  const mergeBase = git("merge-base", request.base_sha, request.head_sha);
  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...params,
    per_page: 100,
  });
  const diffs = files.map((file) => ({
    ...file,
    lines: diffLines(file.patch),
  }));
  const comments = [];
  const outsideDiff = [];
  const seen = new Set();
  for (const finding of review.comments) {
    const body = renderComment(finding);
    if (!body) continue;
    const { path, line, side } = finding;
    const commit = side === "LEFT" ? mergeBase : request.head_sha;
    // Validate source locations even when GitHub omitted a patch or the file is unchanged.
    const source = git("show", `${commit}:${path}`);
    if (line > source.split("\n").length)
      throw new Error(`Invalid source line: ${path}:${line}`);
    const key = JSON.stringify([path, line, side, body]);
    if (seen.has(key)) continue;
    seen.add(key);
    const file = diffs.find(
      (item) =>
        (side === "LEFT"
          ? (item.previous_filename ?? item.filename)
          : item.filename) === path,
    );
    if (file?.lines[side].has(line)) {
      comments.push({ path: file.filename, line, side, body });
    } else {
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const url = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/blob/${commit}/${encodedPath}#L${line}`;
      outsideDiff.push(
        `[Source: ${path.replaceAll("[", "\\[").replaceAll("]", "\\]")}:${line}](${url})\n\n${body}`,
      );
    }
  }

  const body = [
    marker,
    review.summary.trim(),
    outsideDiff.length
      ? "Findings and notifications outside the PR diff:\n\n" +
        outsideDiff.join("\n\n---\n\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  // Recheck after collecting locations so a push during preparation cannot redirect feedback.
  const { data: latest } = await github.rest.pulls.get(params);
  if (
    latest.state !== "open" ||
    latest.head.sha !== request.head_sha ||
    latest.base.sha !== request.base_sha
  ) {
    core.info(
      "Skipping review because the PR changed during publication preparation.",
    );
    return;
  }
  await github.rest.pulls.createReview({
    ...params,
    commit_id: request.head_sha,
    event: "COMMENT",
    body,
    comments,
  });
}

module.exports = { publishReview };
