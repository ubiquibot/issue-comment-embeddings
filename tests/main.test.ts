// cSpell:disable

import { drop } from "@mswjs/data";
import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import { expect, describe, beforeAll, beforeEach, afterAll, afterEach, it } from "@jest/globals";
import { Context, SupportedEvents, SupportedEventsU } from "../src/types/context";
import { Octokit } from "@octokit/rest";
import { STRINGS } from "./__mocks__/strings";
import { createComment, setupTests } from "./__mocks__/helpers";
import manifest from "../manifest.json";
import dotenv from "dotenv";
import { Logs } from "@ubiquity-dao/ubiquibot-logger";
import { Env } from "../src/types";
import { runPlugin } from "../src/plugin";
import { createAdapters } from "../src/adapters";
import { createClient } from "@supabase/supabase-js";
import { VoyageAIClient } from "voyageai";

dotenv.config();
jest.requireActual("@octokit/rest");
jest.requireActual("@supabase/supabase-js");
const octokit = new Octokit();

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
  jest.resetModules();
});
afterAll(() => server.close());

describe("Plugin tests", () => {
  beforeEach(async () => {
    drop(db);
    await setupTests();
  });

  it("Should serve the manifest file", async () => {
    const worker = (await import("../src/worker")).default;
    const response = await worker.fetch(new Request("http://localhost/manifest.json"), {
      SUPABASE_KEY: "test",
      SUPABASE_URL: "test",
      VOYAGEAI_API_KEY: "test",
    });
    const content = await response.json();
    expect(content).toEqual(manifest);
  });

  it("should create and store embeddings for comments", async () => {
    const { context, okSpy } = createContext(STRINGS.HELLO_WORLD, 1, 1, 1, 1, "test");
    await expect(runPlugin(context)).resolves.toEqual([{ statusCode: 200 }]);

    expect(okSpy).toHaveBeenCalledTimes(1);
    expect(okSpy).toHaveBeenNthCalledWith(1, "Successfully created comment!", {
      source_id: "test",
      type: "comment",
      plaintext: `${STRINGS.HELLO_WORLD}`,
      embedding: STRINGS.REMOVED_FOR_BREVITY,
      metadata: {
        authorAssociation: "OWNER",
        authorId: 1,
        isPrivate: false,
        issueNodeId: "test_issue1",
        repoNodeId: "test_repo1",
      },
      created_at: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/),
      modified_at: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/),
      caller: STRINGS.LOGS_ANON,
    });
  });

  it("should update the embeddings for comments", async () => {
    const { context: ctx } = createContext(STRINGS.HELLO_WORLD, 1, 1, 1, 1, "test");
    await runPlugin(ctx);

    const { context, okSpy } = createContext(STRINGS.UPDATED_MESSAGE, 1, 1, 1, 1, "test", "issue_comment.edited");
    await expect(runPlugin(context)).resolves.toEqual([{ statusCode: 200 }]);
    const updatedComment = db.issueComments.findFirst({ where: { id: { equals: 1 } } });
    expect(updatedComment?.body).toEqual(STRINGS.UPDATED_MESSAGE);
    expect(okSpy).toHaveBeenCalledTimes(1);
    expect(okSpy).toHaveBeenNthCalledWith(1, "Successfully updated comment!", {
      source_id: "test",
      type: "comment",
      plaintext: `${STRINGS.UPDATED_MESSAGE}`,
      embedding: STRINGS.REMOVED_FOR_BREVITY,
      metadata: {
        authorAssociation: "OWNER",
        authorId: 1,
        issueNodeId: "test_issue1",
        repoNodeId: "test_repo1",
        isPrivate: false,
      },
      modified_at: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/),
      created_at: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/),
      caller: STRINGS.LOGS_ANON,
    });
  });

  it("should delete the embeddings for comments", async () => {
    const { context: ctx } = createContext(STRINGS.HELLO_WORLD, 1, 1, 1, 1, "test");
    await runPlugin(ctx);

    const { context, okSpy } = createContext(STRINGS.UPDATED_MESSAGE, 1, 1, 1, 1, "test", "issue_comment.deleted");
    await expect(runPlugin(context)).resolves.toEqual([{ statusCode: 200 }]);
    expect(okSpy).toHaveBeenCalledTimes(1);
    expect(okSpy).toHaveBeenNthCalledWith(1, "Successfully deleted comment!", {
      commentId: "test",
      caller: STRINGS.LOGS_ANON,
    });
  });

  it("should create and store embeddings for issues", async () => {
    const { context } = createContext(STRINGS.HELLO_WORLD, 1, 1, 1, 1, "test", STRINGS.ISSUES_OPENED as SupportedEventsU);
    await expect(runPlugin(context)).resolves.toEqual([{ statusCode: 200 }, { statusCode: 204 }, { statusCode: 200 }]);
  });

  it("should update the embeddings for issues", async () => {
    const { context: ctx } = createContext(STRINGS.HELLO_WORLD, 1, 1, 1, 1, "test", STRINGS.ISSUES_OPENED as SupportedEventsU);
    await runPlugin(ctx);

    const { context } = createContext(STRINGS.UPDATED_MESSAGE, 1, 1, 1, 1, "test", "issues.edited");
    await expect(runPlugin(context)).resolves.toEqual([{ statusCode: 200 }, { statusCode: 204 }, { statusCode: 200 }]);
  });

  it("should delete the embeddings for issues", async () => {
    const { context: ctx } = createContext(STRINGS.HELLO_WORLD, 1, 1, 1, 1, "test", STRINGS.ISSUES_OPENED as SupportedEventsU);
    await runPlugin(ctx);

    const { context, okSpy } = createContext(STRINGS.UPDATED_MESSAGE, 1, 1, 1, 1, "test", "issues.deleted");
    await expect(runPlugin(context)).resolves.toEqual([{ statusCode: 200 }]);
    expect(okSpy).toHaveBeenCalledTimes(1);
    expect(okSpy).toHaveBeenNthCalledWith(1, "Successfully deleted issue!", {
      issueNodeId: "test_issue1",
      caller: STRINGS.LOGS_ANON,
    });
  });
});

/**
 * The heart of each test. This function creates a context object with the necessary data for the plugin to run.
 *
 * So long as everything is defined correctly in the db (see `./__mocks__/helpers.ts: setupTests()`),
 * this function should be able to handle any event type and the conditions that come with it.
 *
 * Refactor according to your needs.
 */
function createContext(
  commentBody: string = "Hello, world!",
  repoId: number = 1,
  payloadSenderId: number = 1,
  commentId: number = 1,
  issueOne: number = 1,
  nodeId: string,
  eventName: SupportedEventsU = "issue_comment.created"
): {
  context: Context<"issue_comment.created">;
  infoSpy: jest.SpyInstance;
  errorSpy: jest.SpyInstance;
  debugSpy: jest.SpyInstance;
  okSpy: jest.SpyInstance;
  verboseSpy: jest.SpyInstance;
  repo: Context["payload"]["repository"];
  issue1: Context["payload"]["issue"];
} {
  const repo = db.repo.findFirst({ where: { id: { equals: repoId } } }) as unknown as Context["payload"]["repository"];
  const sender = db.users.findFirst({ where: { id: { equals: payloadSenderId } } }) as unknown as Context["payload"]["sender"];
  const issue1 = db.issue.findFirst({ where: { id: { equals: issueOne } } }) as unknown as Context["payload"]["issue"];

  createComment(commentBody, commentId, nodeId); // create it first then pull it from the DB and feed it to _createContext
  const comment = db.issueComments.findFirst({
    where: { id: { equals: commentId } },
  }) as unknown as unknown as SupportedEvents["issue_comment.created"]["payload"]["comment"];

  const context = createContextInner(repo, sender, issue1, comment, eventName);
  const infoSpy = jest.spyOn(context.logger, "info");
  const errorSpy = jest.spyOn(context.logger, "error");
  const debugSpy = jest.spyOn(context.logger, "debug");
  const okSpy = jest.spyOn(context.logger, "ok");
  const verboseSpy = jest.spyOn(context.logger, "verbose");

  return {
    context,
    infoSpy,
    errorSpy,
    debugSpy,
    okSpy,
    verboseSpy,
    repo,
    issue1,
  };
}

/**
 * Creates the context object central to the plugin.
 *
 * This should represent the active `SupportedEvents` payload for any given event.
 */
function createContextInner(
  repo: Context["payload"]["repository"],
  sender: Context["payload"]["sender"],
  issue: Context["payload"]["issue"],
  comment: SupportedEvents["issue_comment.created"]["payload"]["comment"],
  eventName: SupportedEventsU
): Context<"issue_comment.created"> {
  const ctx = {
    eventName: eventName as "issue_comment.created",
    payload: {
      action: "created",
      sender: sender,
      repository: repo,
      issue: issue,
      comment: comment,
      installation: { id: 1 } as Context["payload"]["installation"],
      organization: { login: STRINGS.USER_1 } as Context["payload"]["organization"],
    } as Context<"issue_comment.created">["payload"],
    config: {
      warningThreshold: 0.75,
      matchThreshold: 0.95,
      jobMatchingThreshold: 0.95,
    },
    adapters: {} as Context["adapters"],
    logger: new Logs("debug"),
    env: {
      SUPABASE_KEY: "test",
      // fake DB URL
      SUPABASE_URL: "https://fymwbgfvpmbhkqzlpmfdr.supabase.co/",
      VOYAGEAI_API_KEY: "test",
    } as Env,
    octokit: octokit,
  };

  ctx.adapters = createAdapters(createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_KEY), new VoyageAIClient({ apiKey: ctx.env.VOYAGEAI_API_KEY }), ctx);
  return ctx;
}
