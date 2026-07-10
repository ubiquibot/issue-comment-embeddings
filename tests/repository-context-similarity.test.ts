import assert from "node:assert/strict";
import test from "node:test";
import { getRepositoryContextAdjustedSimilarity } from "../src/utils/matching-similarity.ts";

const currentRepository = {
  owner: {
    login: "ubiquity",
  },
  name: "text-vector-embeddings",
};

void test("keeps same-repository matches unchanged", () => {
  const adjusted = getRepositoryContextAdjustedSimilarity(1, currentRepository, {
    owner: {
      login: "ubiquity",
    },
    name: "text-vector-embeddings",
  });

  assert.equal(adjusted, 1);
});

void test("discounts same-organization matches by 25 percentage points", () => {
  const adjusted = getRepositoryContextAdjustedSimilarity(1, currentRepository, {
    owner: {
      login: "ubiquity",
    },
    name: "recommendations",
  });

  assert.equal(adjusted, 0.75);
});

void test("discounts global matches by 50 percentage points", () => {
  const adjusted = getRepositoryContextAdjustedSimilarity(1, currentRepository, {
    owner: {
      login: "other-org",
    },
    name: "other-repo",
  });

  assert.equal(adjusted, 0.5);
});

void test("never returns a negative adjusted similarity", () => {
  const adjusted = getRepositoryContextAdjustedSimilarity(0.2, currentRepository, {
    owner: {
      login: "other-org",
    },
    name: "other-repo",
  });

  assert.equal(adjusted, 0);
});
