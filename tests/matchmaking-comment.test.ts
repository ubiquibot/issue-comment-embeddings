import { describe, expect, it, mock } from "bun:test";
import { issueMatchingWithComment } from "../src/handlers/issue-matching";
import { Context } from "../src/types/context";

const COMMENT_START = ">The following contributors may be suitable for this task:";

type StoredComment = {
  id: number;
  body: string;
};

function createLogger() {
  return {
    info: mock(() => undefined),
    error: mock(() => undefined),
    debug: mock(() => undefined),
    warn: mock(() => undefined),
  };
}

function createContext(comments: StoredComment[] = [], eventName: "issues.opened" | "issues.labeled" = "issues.labeled") {
  let nextCommentId = comments.reduce((highestId, comment) => Math.max(highestId, comment.id), 0) + 1;
  const createComment = mock(async ({ body }: { body: string }) => {
    const comment = { id: nextCommentId++, body };
    comments.push(comment);
    return { data: comment };
  });
  const updateComment = mock(async (params: { comment_id: number; body: string }) => {
    const comment = comments.find((item) => item.id === params.comment_id);
    if (comment) {
      comment.body = params.body;
    }
    return { data: comment };
  });
  const deleteComment = mock(async (params: { comment_id: number }) => {
    const index = comments.findIndex((item) => item.id === params.comment_id);
    if (index >= 0) {
      comments.splice(index, 1);
    }
    return {};
  });

  const context = {
    eventName,
    payload: {
      issue: {
        title: "New task",
        body: "Build this feature",
        node_id: "current",
        number: 7,
        user: { type: "User", login: "alice" },
      },
      repository: {
        owner: { login: "ubiquity" },
        name: "demo",
      },
    },
    config: {
      jobMatchingThreshold: 0.75,
    },
    adapters: {
      supabase: {
        issue: {
          findSimilarIssuesToMatch: mock(async () => [{ issue_id: "similar", similarity: 0.9 }]),
        },
      },
    },
    octokit: {
      paginate: mock(async () => [...comments]),
      graphql: mock(async () => ({
        node: {
          title: "Completed task",
          url: "https://github.com/ubiquity/demo/issues/1",
          state: "closed",
          stateReason: "COMPLETED",
          closed: true,
          repository: {
            owner: { login: "ubiquity" },
            name: "demo",
          },
          assignees: {
            nodes: [{ login: "contributor", url: "https://github.com/contributor" }],
          },
        },
      })),
      rest: {
        issues: {
          listComments: mock(() => undefined),
          createComment,
          updateComment,
          deleteComment,
        },
      },
    },
    logger: createLogger(),
  } as unknown as Context<"issues.opened" | "issues.labeled">;

  return { comments, context, createComment, updateComment, deleteComment };
}

describe("matchmaking comment", () => {
  it("creates a placeholder on issue open and updates it instead of creating a second recommendation comment", async () => {
    const { comments, context, createComment, updateComment } = createContext([], "issues.opened");

    await issueMatchingWithComment(context);

    expect(createComment).toHaveBeenCalledTimes(1);
    expect(updateComment).toHaveBeenCalledTimes(1);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toContain(COMMENT_START);
    expect(comments[0].body).toContain("contributor");
    expect(comments[0].body).not.toContain("Calculating recommendations");
  });

  it("updates the existing matchmaking comment and deletes duplicates", async () => {
    const comments: StoredComment[] = [
      { id: 10, body: `>[!NOTE]\n${COMMENT_START}\n> stale` },
      { id: 11, body: `>[!NOTE]\n${COMMENT_START}\n> duplicate` },
    ];
    const { context, updateComment, deleteComment } = createContext(comments);

    await issueMatchingWithComment(context);

    expect(updateComment).toHaveBeenCalledTimes(1);
    expect(deleteComment).toHaveBeenCalledTimes(1);
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe(10);
    expect(comments[0].body).toContain("contributor");
  });
});
