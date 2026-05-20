import { describe, expect, it, mock } from "bun:test";
import { SupabaseClient } from "@supabase/supabase-js";
import { Embedding as NomicEmbedding, NOMIC_EMBEDDING_DIM, NOMIC_MODEL } from "../src/adapters/nomic/helpers/embedding";
import { Issue } from "../src/adapters/supabase/helpers/issues";
import { Database } from "../src/types/database";
import { Context } from "../src/types/index";

function createLogger() {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    ok: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

function createContext(overrides: Partial<Context> = {}): Context {
  const logger = createLogger();
  return {
    env: {
      DATABASE_URL: "postgres://example",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_KEY: "supabase-key",
      VOYAGEAI_API_KEY: "voyage-key",
      NOMIC_API_KEY: "nomic-key",
    },
    config: {
      dedupeMatchThreshold: 0.95,
      dedupeWarningThreshold: 0.75,
      annotateThreshold: 0.65,
      jobMatchingThreshold: 0.75,
      embeddingModel: "nomic",
      demoFlag: false,
    },
    logger,
    adapters: {
      voyage: {
        embedding: {
          createEmbedding: mock(async () => [1, 2, 3]),
        },
      },
      nomic: {
        embedding: {
          createEmbedding: mock(async () => [4, 5, 6]),
        },
      },
    },
    ...overrides,
  } as unknown as Context;
}

describe("Nomic embeddings", () => {
  it("calls the Nomic text embedding API with the configured model and dimensionality", async () => {
    const embedding = Array.from({ length: NOMIC_EMBEDDING_DIM }, (unusedValue, index) => index / 10);
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => new Response(JSON.stringify({ embeddings: [embedding] }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const context = createContext();
      const client = new NomicEmbedding(context);
      const result = await client.createEmbedding("semantic search text", "query");

      expect(result).toEqual(embedding);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        texts: ["semantic search text"],
        model: NOMIC_MODEL,
        task_type: "search_query",
        dimensionality: NOMIC_EMBEDDING_DIM,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses the Nomic issue similarity RPC when Nomic is configured and available", async () => {
    const rpc = mock(async () => ({ data: [{ issue_id: "issue-2", similarity: 0.9 }], error: null }));
    const supabase = { rpc } as unknown as SupabaseClient<Database>;
    const context = createContext();
    const issue = new Issue(supabase, context);

    const result = await issue.findSimilarIssues({
      markdown: "This issue body is long enough to pass the embedding threshold.",
      currentId: "issue-1",
      threshold: 0.75,
    });

    expect(result).toEqual([{ issue_id: "issue-2", similarity: 0.9 }]);
    expect(rpc).toHaveBeenCalledWith("find_similar_issues_annotate_nomic", {
      query_embedding: [4, 5, 6],
      current_id: "issue-1",
      threshold: 0.75,
      top_k: 5,
    });
    expect(context.adapters.voyage.embedding.createEmbedding).not.toHaveBeenCalled();
  });

  it("stores Voyage and Nomic embeddings separately when both providers are available", async () => {
    const inserted: unknown[] = [];
    const selectBuilder = {
      eq: () => selectBuilder,
      in: async () => ({ data: [], error: null }),
    };
    const supabase = {
      from: () => ({
        select: () => selectBuilder,
        insert: async (rows: unknown[]) => {
          inserted.push(...rows);
          return { data: rows, error: null };
        },
      }),
    } as unknown as SupabaseClient<Database>;
    const context = createContext();
    const issue = new Issue(supabase, context);

    await issue.createIssue({
      id: "issue-1",
      author_id: 1,
      isPrivate: false,
      markdown: "This issue body is long enough to create both embeddings.",
      payload: null,
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      embedding: "[1,2,3]",
      nomic_embedding: "[4,5,6]",
    });
  });
});
