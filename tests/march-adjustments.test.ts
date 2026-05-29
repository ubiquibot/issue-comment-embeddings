import { describe, expect, it } from "bun:test";
import { parseGitHubUrl, formatGitHubUrl, parseGitHubIssueCommentId } from "../src/helpers/github";
import { getEmbeddingQueueSettings } from "../src/utils/embedding-queue";
import { createDuplicateFootnoteRef, getHighestDuplicateFootnoteIndex, stripDuplicateFootnotes } from "../src/utils/footnotes";
import { pluginSettingsSchema } from "../src/types/plugin-input";
import { checkIfDuplicateFootNoteExists } from "../src/handlers/issue-deduplication";
import { Env } from "../src/types/env";

describe("March 2025 adjustments", () => {
  it("parses friendlier GitHub issue URLs", () => {
    expect(parseGitHubUrl(" https://www.github.com/ubiquity-os-marketplace/text-vector-embeddings/issues/92/#issuecomment-1 ")).toEqual({
      owner: "ubiquity-os-marketplace",
      repo: "text-vector-embeddings",
      issue_number: 92,
    });
    expect(() => parseGitHubUrl("https://example.com/ubiquity/repo/issues/1")).toThrow();
  });

  it("normalizes GitHub URLs without invalid hash fragments", () => {
    expect(formatGitHubUrl("http://github.com/ubiquity/test-repo/issues/3#3")).toBe("https://www.github.com/ubiquity/test-repo/issues/3");
    expect(parseGitHubIssueCommentId(" https://www.github.com/ubiquity/test-repo/issues/3#issuecomment-123/ ")).toBe("123");
  });

  it("uses meaningful duplicate footnote IDs and can remove old or new duplicate footnotes", () => {
    const content = [
      `First line ${createDuplicateFootnoteRef(1)}`,
      "",
      `${createDuplicateFootnoteRef(1)}: ⚠ 80% possible duplicate - [Existing](https://www.github.com/ubiquity/test/issues/1)`,
      "Second line [^02^]",
      "",
      "[^02^]: ⚠ 76% possible duplicate - [Legacy](https://www.github.com/ubiquity/test/issues/2)",
    ].join("\n");

    expect(createDuplicateFootnoteRef(2)).toBe("[^deduplication-2^]");
    expect(getHighestDuplicateFootnoteIndex(content)).toBe(2);
    expect(checkIfDuplicateFootNoteExists(content)).toBe(true);
    const strippedContent = stripDuplicateFootnotes(content);
    expect(strippedContent).toContain("First line ");
    expect(strippedContent).toContain("Second line ");
    expect(strippedContent).not.toContain("possible duplicate");
    expect(strippedContent).not.toContain("[^deduplication-1^]");
    expect(strippedContent).not.toContain("[^02^]");
  });

  it("documents the alwaysRecommend config precisely", () => {
    expect(pluginSettingsSchema.properties.alwaysRecommend.description).toBe(
      "This amount of contributors will always be recommended regardless of the similarity score."
    );
  });

  it("accepts ergonomic duration strings for embedding queue delay", () => {
    const env = {
      EMBEDDINGS_QUEUE_DELAY_MS: "2s",
    } as Env;

    expect(getEmbeddingQueueSettings(env).delayMs).toBe(2000);
  });
});
