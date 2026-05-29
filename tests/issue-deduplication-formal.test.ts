import { describe, expect, it, mock } from "bun:test";
import { issueDedupe } from "../src/handlers/issue-deduplication";
import { Context } from "../src/types/context";

const OWNER = "owner";
const REPO = "repo";
const ISSUE_BODY = "The app crashes when saving settings. Steps are attached.";

function createContext() {
  const issue = {
    body: ISSUE_BODY,
    node_id: "current-node",
    number: 34,
    state: "open",
    state_reason: null,
    title: "Saving settings crashes",
    user: { login: "alice", type: "User" },
  };
  const createComment = mock(async () => undefined);
  const update = mock(async () => undefined);

  const context = {
    adapters: {
      llm: {
        createCompletion: mock(async () => ""),
      },
      supabase: {
        issue: {
          findSimilarIssues: mock(async () => [{ issue_id: "duplicate-node", similarity: 0.97 }]),
        },
      },
    },
    config: {
      dedupeMatchThreshold: 0.95,
      dedupeWarningThreshold: 0.75,
    },
    logger: {
      debug: mock(() => undefined),
      error: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
    },
    octokit: {
      graphql: mock(async () => ({
        node: {
          body: ISSUE_BODY,
          number: 12,
          repository: {
            name: REPO,
            owner: { login: OWNER },
          },
          title: "Existing settings crash",
          url: `https://github.com/${OWNER}/${REPO}/issues/12`,
        },
      })),
      paginate: mock(async () => []),
      rest: {
        issues: {
          createComment,
          listComments: mock(() => undefined),
          update,
        },
      },
    },
    payload: {
      issue,
      repository: {
        name: REPO,
        owner: { login: OWNER },
      },
    },
  } as unknown as Context<"issues.opened">;

  return { context, createComment, update };
}

describe("issueDedupe formal duplicate handling", () => {
  it("creates a GitHub duplicate marker comment and closes with duplicate state reason", async () => {
    const { context, createComment, update } = createContext();

    await issueDedupe(context);

    expect(createComment).toHaveBeenCalledWith({
      owner: OWNER,
      repo: REPO,
      issue_number: 34,
      body: "Duplicate of #12",
    });
    expect(update).toHaveBeenCalledWith({
      owner: OWNER,
      repo: REPO,
      issue_number: 34,
      body: ISSUE_BODY,
      state: "closed",
      state_reason: "duplicate",
    });
  });
});
