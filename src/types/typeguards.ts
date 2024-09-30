import { Context } from "./context";

/**
 * Typeguards are most helpful when you have a union type and you want to narrow it down to a specific one.
 * In other words, if `SupportedEvents` has multiple types then these restrict the scope
 * of `context` to a specific event payload.
 */

export function isIssueCommentEvent(
  payload: unknown
): payload is Context<"issue_comment.created" | "issue_comment.edited" | "issue_comment.deleted">["payload"] {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  return "comment" in payload;
}

export function isIssueEvent(payload: unknown): payload is Context<"issues.opened" | "issues.edited" | "issues.deleted">["payload"] {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  return "issue" in payload;
}
