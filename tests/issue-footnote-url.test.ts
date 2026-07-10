import assert from "node:assert/strict";
import test from "node:test";
import { buildIssueFootnoteUrl } from "../src/utils/issue-footnote-url.ts";

void test("replaces issue comment hashes with the issue number footnote anchor", () => {
  assert.equal(
    buildIssueFootnoteUrl("https://github.com/ubiquity/business-development/issues/154#issuecomment-2721793725", 154),
    "https://www.github.com/ubiquity/business-development/issues/154#154"
  );
});

void test("keeps issue URLs without hashes anchored to the issue number", () => {
  assert.equal(
    buildIssueFootnoteUrl("https://github.com/ubiquity/business-development/issues/154", 154),
    "https://www.github.com/ubiquity/business-development/issues/154#154"
  );
});
