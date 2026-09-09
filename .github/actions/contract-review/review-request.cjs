function reviewMarker(request) {
  if (
    !request ||
    !/^\d+$/.test(request.id) ||
    !Number.isSafeInteger(request.pull_number) ||
    request.pull_number < 1 ||
    !/^[a-f\d]{40}$/i.test(request.base_sha) ||
    !/^[a-f\d]{40}$/i.test(request.head_sha)
  )
    throw new Error("Invalid contract review request");
  return `<!-- code-contract-review:${request.id}:${request.base_sha}:${request.head_sha} -->`;
}

async function resolveReviewRequest({
  github,
  context,
  core,
  pullNumber,
  requestRunId,
}) {
  if (!Number.isSafeInteger(pullNumber) || pullNumber < 1)
    throw new Error("Invalid pull request number");
  let requester = context.payload.sender;
  if (requestRunId) {
    if (
      context.eventName !== "workflow_dispatch" ||
      !/^\d+$/.test(requestRunId)
    )
      throw new Error("Invalid originating review request run");
    const { data: origin } = await github.rest.actions.getWorkflowRun({
      ...context.repo,
      run_id: Number(requestRunId),
    });
    if (
      !["issue_comment", "pull_request", "pull_request_target"].includes(
        origin.event,
      )
    ) {
      core.info(
        "Skipping review: the originating run is not a review request event.",
      );
      return null;
    }
    requester = origin.actor;
  }
  if (requester?.type !== "User") return null;

  let permission;
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo,
      username: requester.login,
    });
    permission = data.permission;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (!["write", "maintain", "admin"].includes(permission)) {
    core.info(
      "Skipping review: the requester does not have repository write access.",
    );
    return null;
  }

  const params = { ...context.repo, pull_number: pullNumber };
  const { data: pr } = await github.rest.pulls.get(params);
  if (
    pr.state !== "open" ||
    pr.head.repo?.full_name.toLowerCase() !==
      `${context.repo.owner}/${context.repo.repo}`.toLowerCase()
  ) {
    core.info(
      "Skipping review: the PR is closed or its head is outside this repository.",
    );
    return null;
  }
  const dispatched = context.eventName === "workflow_dispatch";
  if (dispatched && context.ref !== `refs/heads/${pr.head.ref}`) {
    core.info("Skipping review: dispatch must target the PR's head branch.");
    return null;
  }
  const request = {
    // Preserve the original request across dispatches and retries.
    id: String(requestRunId || context.runId),
    pull_number: pr.number,
    base_sha: pr.base.sha,
    head_sha: dispatched ? context.sha : pr.head.sha,
    head_ref: pr.head.ref,
  };
  const marker = reviewMarker(request);
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
    return null;
  }
  return request;
}

module.exports = { reviewMarker, resolveReviewRequest };
