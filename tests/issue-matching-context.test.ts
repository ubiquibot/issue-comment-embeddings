import { describe, expect, it } from "bun:test";
import { calculateContextAdjustedSimilarity } from "../src/handlers/issue-matching";

describe("calculateContextAdjustedSimilarity", () => {
  it("does not penalize same-repository matches", () => {
    expect(calculateContextAdjustedSimilarity(0.93, "repo")).toBe(93);
  });

  it("penalizes same-organization matches by 25 points", () => {
    expect(calculateContextAdjustedSimilarity(0.93, "org")).toBe(68);
  });

  it("penalizes global matches by 50 points", () => {
    expect(calculateContextAdjustedSimilarity(0.93, "global")).toBe(43);
  });

  it("never returns a negative recommendation score", () => {
    expect(calculateContextAdjustedSimilarity(0.2, "global")).toBe(0);
  });
});
