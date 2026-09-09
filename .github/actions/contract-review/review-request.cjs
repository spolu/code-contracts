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

async function resolveReviewRequest({ github, context, core, pullNumber }) {
  if (!Number.isSafeInteger(pullNumber) || pullNumber < 1)
    throw new Error("Invalid pull request number");
  if (context.payload.sender?.type !== "User") return null;

  let permission;
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo,
      username: context.actor,
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
  const request = {
    // GitHub preserves the run ID on retries; a fresh request gets a new run ID.
    id: String(context.runId),
    pull_number: pr.number,
    base_sha: pr.base.sha,
    head_sha: pr.head.sha,
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
