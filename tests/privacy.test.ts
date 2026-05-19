import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { pluginSettingsSchema } from "../src/types/plugin-input";
import { shouldRedactPrivateRepoContent } from "../src/utils/privacy";

describe("private repository redaction", () => {
  it("defaults to capturing private repository content", () => {
    const config = Value.Decode(pluginSettingsSchema, Value.Default(pluginSettingsSchema, {}));

    expect(config.redactPrivateRepoComments).toBe(false);
    expect(shouldRedactPrivateRepoContent(config, true)).toBe(false);
  });

  it("redacts only private repository content when enabled", () => {
    const config = { redactPrivateRepoComments: true };

    expect(shouldRedactPrivateRepoContent(config, true)).toBe(true);
    expect(shouldRedactPrivateRepoContent(config, false)).toBe(false);
  });
});
