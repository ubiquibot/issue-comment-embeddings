import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { parseGitHubUrl } from "../src/helpers/github";
import { urlSchema } from "../src/validators";

describe("urlSchema", () => {
  it("accepts common GitHub issue and pull request URL variants", () => {
    expect(v.safeParse(urlSchema, "https://github.com/owner/repo/issues/123").success).toBe(true);
    expect(v.safeParse(urlSchema, "http://www.github.com/owner/repo/pull/456/").success).toBe(true);
    expect(v.safeParse(urlSchema, "https://github.com/owner/repo/issues/123#issuecomment-1").success).toBe(true);
  });
});

describe("parseGitHubUrl", () => {
  it("parses copied GitHub URL variants accepted by the schema", () => {
    expect(parseGitHubUrl("https://www.github.com/owner/repo/issues/123/?plain=1#top")).toEqual({
      owner: "owner",
      repo: "repo",
      issue_number: 123,
    });
  });
});
