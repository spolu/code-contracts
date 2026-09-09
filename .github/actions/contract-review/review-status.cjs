const { reviewMarker } = require("./review-request.cjs");

async function publishReviewStatus({ github, context, request, state }) {
  reviewMarker(request);
  const descriptions = {
    pending: "Contract review is running",
    success: "Contract review completed",
    failure: "Contract review failed",
    cancelled: "Contract review was cancelled",
  };
  if (!Object.hasOwn(descriptions, state))
    throw new Error("Invalid contract review status");
  const url = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  if (state !== "pending") {
    const { data } = await github.rest.repos.getCombinedStatusForRef({
      ...context.repo,
      ref: request.head_sha,
    });
    const current = data.statuses.find(
      (status) => status.context === "Contract review",
    );
    if (current?.target_url !== url) return;
  }
  await github.rest.repos.createCommitStatus({
    ...context.repo,
    sha: request.head_sha,
    context: "Contract review",
    state: ["failure", "cancelled"].includes(state) ? "error" : state,
    target_url: url,
    description: descriptions[state],
  });
}

module.exports = { publishReviewStatus };
