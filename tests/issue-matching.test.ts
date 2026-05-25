import { describe, expect, it } from "bun:test";
import { applyRepositoryContextPenalty, getRepositoryContextScope } from "../src/handlers/issue-matching";

describe("repository context scoring", () => {
  it("keeps same-repository matches at full similarity", () => {
    const current = { owner: "ubiquity-os", repo: "text-vector-embeddings" };
    const candidate = { owner: "Ubiquity-OS", repo: "Text-Vector-Embeddings" };

    expect(getRepositoryContextScope(current, candidate)).toBe("repo");
    expect(applyRepositoryContextPenalty(0.82, current, candidate)).toEqual({
      scope: "repo",
      similarity: 0.82,
    });
  });

  it("subtracts 25 points for same-organization matches", () => {
    const result = applyRepositoryContextPenalty(
      0.92,
      { owner: "ubiquity-os", repo: "text-vector-embeddings" },
      { owner: "ubiquity-os", repo: "daemon-disqualifier" }
    );

    expect(result.scope).toBe("org");
    expect(result.similarity).toBeCloseTo(0.67);
  });

  it("subtracts 50 points for global matches and never returns negative scores", () => {
    const result = applyRepositoryContextPenalty(0.4, { owner: "ubiquity-os", repo: "text-vector-embeddings" }, { owner: "other-org", repo: "other-repo" });

    expect(result.scope).toBe("global");
    expect(result.similarity).toBe(0);
  });
});
