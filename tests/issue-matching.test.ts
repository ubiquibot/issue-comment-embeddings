import { describe, expect, it } from "bun:test";
import { getContextAdjustedSimilarity } from "../src/handlers/issue-matching";

describe("issue matching context adjustment", () => {
  const currentRepository = { owner: "ubiquity-os-marketplace", name: "text-vector-embeddings" };

  it("keeps same-repository matches at full similarity", () => {
    expect(getContextAdjustedSimilarity(0.92, currentRepository, currentRepository)).toBe(0.92);
  });

  it("penalizes same-organization matches by 25 points", () => {
    expect(getContextAdjustedSimilarity(0.92, currentRepository, { owner: "ubiquity-os-marketplace", name: "command-start-stop" })).toBeCloseTo(0.67);
  });

  it("penalizes global matches by 50 points and never returns negative scores", () => {
    expect(getContextAdjustedSimilarity(0.92, currentRepository, { owner: "other-org", name: "other-repo" })).toBeCloseTo(0.42);
    expect(getContextAdjustedSimilarity(0.3, currentRepository, { owner: "other-org", name: "other-repo" })).toBe(0);
  });
});
