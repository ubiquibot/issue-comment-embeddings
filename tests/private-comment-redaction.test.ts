import { describe, expect, it, mock } from "bun:test";
import { SupabaseClient } from "@supabase/supabase-js";
import { Comment, CommentData } from "../src/adapters/supabase/helpers/comment";
import { Context } from "../src/types/context";
import { pluginSettingsSchema } from "../src/types/plugin-input";

const privateCommentBody = "Private repository comment with enough detail to be embedded and stored for similarity research when redaction is disabled.";

function createCommentData(): CommentData {
  return {
    id: "private-comment",
    markdown: privateCommentBody,
    author_id: 1,
    payload: { body: privateCommentBody },
    isPrivate: true,
    issue_id: "issue-id",
  };
}

function createSupabaseMock() {
  const insertedRows: Record<string, unknown>[] = [];
  const selectResult = {
    data: [],
    error: null,
    is: mock(() => ({ data: [], error: null })),
  };
  const supabase = {
    from: mock(() => ({
      select: mock(() => ({
        eq: mock(() => ({
          in: mock(() => selectResult),
        })),
      })),
      insert: mock(async (rows: Record<string, unknown>[]) => {
        insertedRows.push(...rows);
        return { data: rows, error: null };
      }),
    })),
  };

  return { insertedRows, supabase: supabase as unknown as SupabaseClient };
}

function createContext(redactPrivateRepoComments?: boolean) {
  const createEmbedding = mock(async () => [0.1, 0.2, 0.3]);
  const context = {
    config: { redactPrivateRepoComments },
    adapters: {
      voyage: {
        embedding: {
          createEmbedding,
        },
      },
    },
    logger: {
      error: mock(() => undefined),
      warn: mock(() => undefined),
      ok: mock(() => undefined),
      debug: mock(() => undefined),
    },
  } as unknown as Context;

  return { context, createEmbedding };
}

describe("private repository comment redaction", () => {
  it("captures private repository comments by default", async () => {
    expect(pluginSettingsSchema.properties.redactPrivateRepoComments.default).toBe(false);

    const { insertedRows, supabase } = createSupabaseMock();
    const { context, createEmbedding } = createContext();
    const comment = new Comment(supabase, context);

    await comment.createComment(createCommentData());

    expect(createEmbedding).toHaveBeenCalledWith(privateCommentBody);
    expect(insertedRows[0]).toEqual(
      expect.objectContaining({
        markdown: privateCommentBody,
        payload: { body: privateCommentBody },
        embedding: JSON.stringify([0.1, 0.2, 0.3]),
      })
    );
  });

  it("redacts private repository comments when enabled", async () => {
    const { insertedRows, supabase } = createSupabaseMock();
    const { context, createEmbedding } = createContext(true);
    const comment = new Comment(supabase, context);

    await comment.createComment(createCommentData());

    expect(createEmbedding).not.toHaveBeenCalled();
    expect(insertedRows[0]).toEqual(
      expect.objectContaining({
        markdown: null,
        payload: null,
        embedding: null,
      })
    );
  });
});
