function hasReviewRequest(body) {
  if (typeof body !== "string") return false;
  let fence;
  for (const line of body
    .replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) =>
      comment.replace(/[^\r\n]/g, " "),
    )
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
    const request = /^ {0,3}r\?[ \t]+(.*)$/i.exec(line);
    if (!request) continue;
    for (const token of request[1].split(/[ \t]+/)) {
      if (/^cc$/i.test(token)) return true;
      if (!/^@[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(token)) break;
    }
  }
  return false;
}

function getReviewPullNumber(context) {
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
    ["pull_request", "pull_request_target"].includes(eventName) &&
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

  return number;
}

module.exports = { hasReviewRequest, getReviewPullNumber };
