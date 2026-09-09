const {
  resolveReviewRequest,
} = require("../contract-review/review-request.cjs");

async function dispatchReview({ github, context, core, pullNumber, workflow }) {
  const request = await resolveReviewRequest({
    github,
    context,
    core,
    pullNumber,
  });
  if (!request) return;
  await github.rest.actions.createWorkflowDispatch({
    ...context.repo,
    workflow_id: workflow,
    ref: request.head_ref,
    inputs: {
      "pull-request-number": String(request.pull_number),
      "request-run-id": request.id,
    },
  });
  core.info(
    `Dispatched ${workflow} on ${request.head_ref} for PR #${pullNumber}.`,
  );
}

module.exports = { dispatchReview };
