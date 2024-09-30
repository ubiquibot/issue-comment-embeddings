import { db } from "./db";
import { STRINGS } from "./strings";
import usersGet from "./users-get.json";

/**
 * Helper function to setup tests.
 *
 * This function populates the mock database with the external API
 * data you'd expect to find in a real-world scenario.
 *
 * Here is where you create issues, commits, pull requests, etc.
 */
export async function setupTests() {
  // Insert users
  for (const item of usersGet) {
    db.users.create({
      login: item.login,
      id: item.id,
    });
  }

  // Insert repository
  db.repo.create({
    id: 1,
    name: STRINGS.TEST_REPO,
    full_name: `${STRINGS.USER_1}/${STRINGS.TEST_REPO}`,
    private: false,
    node_id: "test_repo1",
    owner: {
      login: STRINGS.USER_1,
      id: 1,
      avatar_url: "",
    },
  });

  // Insert issues
  db.issue.create({
    id: 1,
    number: 1,
    node_id: "test_issue1",
    title: "First Issue",
    body: "This is the body of the first issue.",
    user: {
      login: STRINGS.USER_1,
      id: 1,
    },
    author_association: "OWNER",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    comments: 0,
    labels: [],
    state: "open",
    locked: false,
    reactions: {
      url: "",
      total_count: 0,
      "+1": 0,
      "-1": 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    },
    timeline_url: "",
  });

  db.issue.create({
    id: 2,
    number: 2,
    node_id: "test_issue2",
    title: "Second Issue",
    body: "This is the body of the second issue.",
    user: {
      login: STRINGS.USER_1,
      id: 1,
    },
    author_association: "OWNER",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    comments: 0,
    labels: [],
    state: "open",
    locked: false,
    reactions: {
      url: "",
      total_count: 0,
      "+1": 0,
      "-1": 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    },
    timeline_url: "",
  });
}

export function createComment(comment: string, commentId: number, nodeId: string) {
  const existingComment = db.issueComments.findFirst({
    where: {
      id: {
        equals: commentId,
      },
    },
  });

  if (existingComment) {
    db.issueComments.update({
      where: {
        id: {
          equals: commentId,
        },
      },
      data: {
        body: comment,
        updated_at: new Date().toISOString(),
      },
    });
  } else {
    db.issueComments.create({
      id: commentId,
      body: comment,
      issue_number: 1,
      node_id: nodeId,
      user: {
        login: STRINGS.USER_1,
        id: 1,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      author_association: "OWNER",
    });
  }
}
