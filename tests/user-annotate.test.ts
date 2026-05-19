import { describe, expect, it } from "bun:test";
import { parseIssueCommentIdFromUrl } from "../src/handlers/user-annotate";

describe("user annotate helpers", () => {
  it("extracts the comment id from issue comment URLs with trailing query parameters", () => {
    const commentUrl = "https://github.com/owner/repo/issues/123#issuecomment-456?notification_referrer_id=abc";

    expect(parseIssueCommentIdFromUrl(commentUrl)).toBe("456");
  });

  it("rejects URLs without an issue comment fragment", () => {
    expect(() => parseIssueCommentIdFromUrl("https://github.com/owner/repo/issues/123")).toThrow("Invalid comment URL");
  });
});
