// cSpell:disable

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { drop } from "@mswjs/data";
import { Octokit } from "@octokit/rest";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import dotenv from "dotenv";
import { runPlugin } from "../src/plugin";
import { Env } from "../src/types";
import { Context, SupportedEvents } from "../src/types/context";
import { CommentMock, createMockAdapters } from "./__mocks__/adapter";
import { db } from "./__mocks__/db";
import { createComment, setupTests } from "./__mocks__/helpers";
import { server } from "./__mocks__/node";
import { STRINGS } from "./__mocks__/strings";

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
});
afterAll(() => server.close());

describe("Plugin tests", () => {
  beforeEach(async () => {
    drop(db);
    await setupTests();
  });

  it("When a comment is created it should add it to the database", async () => {
    const { context } = createContext(STRINGS.HELLO_WORLD, 1, 1, 1, 1, "sasasCreate");
    await runPlugin(context);
    const supabase = context.adapters.supabase;
    const commentObject = null;
    try {
      await supabase.comment.createComment(STRINGS.HELLO_WORLD, "sasasCreate", 1, commentObject, false, "sasasCreateIssue");
      throw new Error("Expected method to reject.");
    } catch (error) {
      if (error instanceof Error) {
        expect(error.message).toBe("Comment already exists");
      }
    }
    const comment = (await supabase.comment.getComment("sasasCreate")) as unknown as CommentMock;
    expect(comment).toBeDefined();
    expect(comment?.plaintext).toBeDefined();
    expect(comment?.plaintext).toBe(STRINGS.HELLO_WORLD);
  });

  it("When a comment is updated it should update the database", async () => {
    const { context } = createContext("Updated Message", 1, 1, 1, 1, "sasasUpdate", "issue_comment.edited");
    const supabase = context.adapters.supabase;
    const commentObject = null;
    await supabase.comment.createComment(STRINGS.HELLO_WORLD, "sasasUpdate", 1, commentObject, false, "sasasUpdateIssue");
    await runPlugin(context);
    const comment = (await supabase.comment.getComment("sasasUpdate")) as unknown as CommentMock;
    expect(comment).toBeDefined();
    expect(comment?.plaintext).toBeDefined();
    expect(comment?.plaintext).toBe("Updated Message");
  });

  it("When a comment is deleted it should delete it from the database", async () => {
    const { context } = createContext("Text Message", 1, 1, 1, 1, "sasasDelete", "issue_comment.deleted");
    const supabase = context.adapters.supabase;
    const commentObject = null;
    await supabase.comment.createComment(STRINGS.HELLO_WORLD, "sasasDelete", 1, commentObject, false, "sasasDeleteIssue");
    await runPlugin(context);
    try {
      await supabase.comment.getComment("sasasDelete");
      throw new Error("Expected method to reject.");
    } catch (error) {
      if (error instanceof Error) {
        expect(error.message).toBe("Comment does not exist");
      }
    }
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
  nodeId: string = "sasas",
  eventName: Context["eventName"] = "issue_comment.created"
) {
  const repo = db.repo.findFirst({ where: { id: { equals: repoId } } }) as unknown as Context["payload"]["repository"];
  const sender = db.users.findFirst({ where: { id: { equals: payloadSenderId } } }) as unknown as Context["payload"]["sender"];
  const issue1 = db.issue.findFirst({ where: { id: { equals: issueOne } } }) as unknown as Context["payload"]["issue"];

  createComment(commentBody, commentId, nodeId); // create it first then pull it from the DB and feed it to _createContext
  const comment = db.issueComments.findFirst({
    where: { id: { equals: commentId } },
  }) as unknown as unknown as SupportedEvents["issue_comment.created"]["payload"]["comment"];

  const context = createContextInner(repo, sender, issue1, comment, eventName);
  context.adapters = createMockAdapters(context) as unknown as Context["adapters"];
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
  eventName: Context["eventName"] = "issue_comment.created"
): Context {
  return {
    eventName: eventName,
    payload: {
      action: "created",
      sender: sender,
      repository: repo,
      issue: issue,
      comment: comment,
      installation: { id: 1 } as Context["payload"]["installation"],
      organization: { login: STRINGS.USER_1 } as Context["payload"]["organization"],
    } as Context["payload"],
    config: {
      warningThreshold: 0.75,
      matchThreshold: 0.9,
      jobMatchingThreshold: 0.75,
    },
    adapters: {} as Context["adapters"],
    logger: new Logs("debug"),
    env: {} as Env,
    octokit: octokit,
  };
}
