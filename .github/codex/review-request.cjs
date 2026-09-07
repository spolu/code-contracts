function hasReviewRequest(body) {
  if (typeof body !== "string") return false;
  let fence;
  for (const line of body
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .split(/\r?\n/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        delimiter &&
        delimiter[1][0] === fence[0] &&
        delimiter[1].length >= fence.length &&
        !delimiter[2].trim()
      )
        fence = undefined;
      continue;
    }
    if (delimiter) {
      fence = delimiter[1];
      continue;
    }
    if (
      /^ {0,3}r\?[ \t]+(?:@[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?[ \t]+)*cc[ \t]*$/i.test(
        line,
      )
    ) {
      return true;
    }
  }
  return false;
}

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

async function resolveReviewRequest({ github, context, core }) {
  const { payload, eventName } = context;
  let number;
  let body;
  if (
    eventName === "issue_comment" &&
    ["created", "edited"].includes(payload.action) &&
    payload.issue?.pull_request
  ) {
    number = payload.issue.number;
    body = payload.comment?.body;
  } else if (
    eventName === "pull_request" &&
    ["opened", "edited"].includes(payload.action)
  ) {
    number = payload.pull_request?.number;
    body = payload.pull_request?.body;
  } else return null;

  if (!number || !hasReviewRequest(body)) return null;
  if (
    payload.action === "edited" &&
    (!Object.hasOwn(payload.changes?.body ?? {}, "from") ||
      hasReviewRequest(payload.changes.body.from))
  )
    return null;
  if (payload.sender?.type !== "User") return null;

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

  const params = { ...context.repo, pull_number: number };
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

module.exports = { hasReviewRequest, reviewMarker, resolveReviewRequest };
