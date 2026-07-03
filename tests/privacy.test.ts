import { describe, expect, it, mock } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { Comment } from "../src/adapters/supabase/helpers/comment";
import { Issue } from "../src/adapters/supabase/helpers/issues";
import type { Context } from "../src/types/context";
import { pluginSettingsSchema } from "../src/types/plugin-input";
import { shouldRedactPrivateRepoContent } from "../src/utils/private-redaction";

function decodeSettings(values: Record<string, unknown> = {}) {
  return Value.Decode(pluginSettingsSchema, Value.Default(pluginSettingsSchema, values));
}

function createContext(values: Record<string, unknown> = {}) {
  const createEmbedding = mock(async () => [1, 2, 3]);
  const context = {
    config: decodeSettings(values),
    adapters: { voyage: { embedding: { createEmbedding } } },
    logger: { error: mock(() => {}), ok: mock(() => {}), warn: mock(() => {}) },
  } as unknown as Context;
  return { context, createEmbedding };
}

function createSupabaseRecorder(existingRows: Array<Record<string, unknown>> = []) {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const selectResult = Promise.resolve({ data: existingRows, error: null });
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            is: () => selectResult,
            then: selectResult.then.bind(selectResult),
          }),
        }),
      }),
      insert: async (rows: Array<Record<string, unknown>>) => {
        inserts.push(...rows);
        return { data: rows, error: null };
      },
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          in: async () => {
            updates.push(row);
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { client, inserts, updates };
}

describe("private repository redaction", () => {
  it("captures private repository content by default", () => {
    const config = decodeSettings();

    expect(config.redactPrivateRepoComments).toBe(false);
    expect(shouldRedactPrivateRepoContent(true, config)).toBe(false);
  });

  it("redacts private repository content when enabled", () => {
    const config = decodeSettings({ redactPrivateRepoComments: true });

    expect(shouldRedactPrivateRepoContent(true, config)).toBe(true);
  });

  it("does not redact public repository content when enabled", () => {
    const config = decodeSettings({ redactPrivateRepoComments: true });

    expect(shouldRedactPrivateRepoContent(false, config)).toBe(false);
  });

  it("stores private comments by default", async () => {
    const { context, createEmbedding } = createContext();
    const { client, inserts } = createSupabaseRecorder();
    const markdown = "Private comment content long enough to create an embedding for storage.";
    const payload = { comment: { body: markdown } };

    await new Comment(client as never, context).createComment({ id: "COMMENT_1", markdown, author_id: 1, payload, isPrivate: true, issue_id: "ISSUE_1" });

    expect(createEmbedding).toHaveBeenCalledWith(markdown);
    expect(inserts[0]).toMatchObject({ markdown, payload, embedding: JSON.stringify([1, 2, 3]) });
  });

  it("redacts private comments when enabled", async () => {
    const { context, createEmbedding } = createContext({ redactPrivateRepoComments: true });
    const { client, inserts } = createSupabaseRecorder();
    const markdown = "Private comment content long enough to create an embedding for storage.";

    await new Comment(client as never, context).createComment({
      id: "COMMENT_2",
      markdown,
      author_id: 1,
      payload: { comment: { body: markdown } },
      isPrivate: true,
      issue_id: "ISSUE_1",
    });

    expect(createEmbedding).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ markdown: null, payload: null, embedding: null });
  });

  it("redacts private comment updates when enabled", async () => {
    const { context, createEmbedding } = createContext({ redactPrivateRepoComments: true });
    const { client, updates } = createSupabaseRecorder([{ id: "COMMENT_3" }]);
    const markdown = "Private comment update content long enough to create an embedding for storage.";

    await new Comment(client as never, context).updateComment({
      id: "COMMENT_3",
      markdown,
      author_id: 1,
      payload: { comment: { body: markdown } },
      isPrivate: true,
      issue_id: "ISSUE_1",
    });

    expect(createEmbedding).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ markdown: null, payload: null, embedding: null });
  });

  it("stores private issues by default", async () => {
    const { context, createEmbedding } = createContext();
    const { client, inserts } = createSupabaseRecorder();
    const markdown = "Private issue content long enough to create an embedding.";
    const payload = { issue: { body: markdown } };

    await new Issue(client as never, context).createIssue({ id: "ISSUE_1", markdown, author_id: 1, payload, isPrivate: true });

    expect(createEmbedding).toHaveBeenCalledWith(markdown);
    expect(inserts[0]).toMatchObject({ markdown, payload, embedding: JSON.stringify([1, 2, 3]) });
  });

  it("redacts private issues when enabled", async () => {
    const { context, createEmbedding } = createContext({ redactPrivateRepoComments: true });
    const { client, inserts } = createSupabaseRecorder();
    const markdown = "Private issue content long enough to create an embedding.";

    await new Issue(client as never, context).createIssue({
      id: "ISSUE_2",
      markdown,
      author_id: 1,
      payload: { issue: { body: markdown } },
      isPrivate: true,
    });

    expect(createEmbedding).not.toHaveBeenCalled();
    expect(inserts[0]).toMatchObject({ markdown: null, payload: null, embedding: null });
  });

  it("redacts private issue updates when enabled", async () => {
    const { context, createEmbedding } = createContext({ redactPrivateRepoComments: true });
    const { client, updates } = createSupabaseRecorder([{ id: "ISSUE_3" }]);
    const markdown = "Private issue update content long enough to create an embedding.";

    await new Issue(client as never, context).updateIssue({
      id: "ISSUE_3",
      markdown,
      author_id: 1,
      payload: { issue: { body: markdown } },
      isPrivate: true,
    });

    expect(createEmbedding).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ markdown: null, payload: null, embedding: null });
  });
});
