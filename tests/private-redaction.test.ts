import assert from "node:assert/strict";
import test from "node:test";
import { shouldRedactPrivateRepoContent } from "../src/utils/private-redaction.ts";

void test("does not redact private repository content by default", () => {
  assert.equal(shouldRedactPrivateRepoContent(true, {}), false);
});

void test("redacts private repository content when configured", () => {
  assert.equal(shouldRedactPrivateRepoContent(true, { redactPrivateRepoComments: true }), true);
});

void test("does not redact public repository content even when configured", () => {
  assert.equal(shouldRedactPrivateRepoContent(false, { redactPrivateRepoComments: true }), false);
});
