import { describe, expect, it } from "bun:test";
import { createFootnoteRef, DEDUPLICATION_FOOTNOTE_PREFIX, getHighestFootnoteIndex, stripDuplicateFootnotes } from "../src/utils/footnotes";

describe("footnote helpers", () => {
  it("uses meaningful deduplication footnote ids", () => {
    expect(createFootnoteRef(DEDUPLICATION_FOOTNOTE_PREFIX, 2)).toBe("[^deduplication-2]");
  });

  it("tracks prefixed and legacy footnote indexes", () => {
    expect(getHighestFootnoteIndex("A [^deduplication-4]\nB [^02^]", DEDUPLICATION_FOOTNOTE_PREFIX)).toBe(4);
  });

  it("removes prefixed duplicate footnotes", () => {
    const content = "Body [^deduplication-1]\n\n[^deduplication-1]: warning 80% possible duplicate - [Issue](https://github.com/org/repo/issues/1)\n";

    expect(stripDuplicateFootnotes(content)).toBe("Body \n\n");
  });
});
