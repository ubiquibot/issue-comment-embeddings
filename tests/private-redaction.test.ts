import { describe, expect, it } from "bun:test";
import { shouldRedactPrivateRepoContent } from "../src/utils/private-redaction";

describe("private repository redaction", () => {
  it("captures private repository content by default", () => {
    expect(shouldRedactPrivateRepoContent(true, false)).toBe(false);
  });

  it("redacts private repository content when configured", () => {
    expect(shouldRedactPrivateRepoContent(true, true)).toBe(true);
  });

  it("does not redact public repository content even when configured", () => {
    expect(shouldRedactPrivateRepoContent(false, true)).toBe(false);
  });
});
