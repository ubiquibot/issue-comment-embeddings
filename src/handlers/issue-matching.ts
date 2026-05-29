import { IssueSimilaritySearchResult } from "../adapters/supabase/helpers/issues";
import { Context } from "../types/index";

export interface IssueGraphqlResponse {
  node: {
    title: string;
    url: string;
    state: string;
    stateReason: string;
    closed: boolean;
    repository: {
      owner: {
        login: string;
      };
      name: string;
    };
    assignees: {
      nodes: Array<{
        login: string;
        url: string;
      }>;
    };
  };
  similarity: number;
}

type IssueNodeResponse = IssueGraphqlResponse | { node: null };

type IssueCommentSummary = {
  id: number;
  body?: string | null;
};

const MATCHMAKING_COMMENT_START = ">The following contributors may be suitable for this task:";
const MATCHMAKING_PLACEHOLDER = `>[!NOTE]\n${MATCHMAKING_COMMENT_START}\n> Calculating recommendations...`;

function hasIssueNode(response: IssueNodeResponse): response is IssueGraphqlResponse {
  return response.node !== null;
}

export async function issueMatchingWithComment(context: Context<"issues.opened" | "issues.edited" | "issues.labeled">) {
  const { logger } = context;
  let existingComment = await getExistingMatchmakingComment(context);
  if (!existingComment && context.eventName === "issues.opened") {
    existingComment = await createMatchmakingComment(context, MATCHMAKING_PLACEHOLDER);
  }

  const result = await issueMatching(context);

  if (!result) {
    if (existingComment) {
      await deleteMatchmakingComment(context, existingComment.id);
    }
    return;
  }

  const { matchResultArray, sortedContributors } = result;

  if (matchResultArray.size === 0) {
    if (existingComment) {
      // If the comment already exists, delete it
      await deleteMatchmakingComment(context, existingComment.id);
    }
    logger.debug("No suitable contributors found");
    return;
  }

  // Use alwaysRecommend if specified
  const numToShow = context.config.alwaysRecommend || 3;
  const limitedContributors = new Map(sortedContributors.slice(0, numToShow).map(({ login, matches }) => [login, matches]));

  const comment = commentBuilder(limitedContributors);

  logger.debug("Comment to be added", { comment });

  if (existingComment) {
    await updateMatchmakingComment(context, existingComment.id, comment);
    await cleanupDuplicateMatchmakingComments(context, existingComment.id);
  } else {
    const createdComment = await createMatchmakingComment(context, comment);
    await cleanupDuplicateMatchmakingComments(context, createdComment?.id);
  }
}

async function listMatchmakingComments(context: Context<"issues.opened" | "issues.edited" | "issues.labeled">): Promise<IssueCommentSummary[]> {
  const { octokit, payload } = context;
  const comments = (await octokit.paginate(octokit.rest.issues.listComments, {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
  })) as IssueCommentSummary[];
  return comments.filter((comment) => comment.body?.includes(">[!NOTE]" + "\n" + MATCHMAKING_COMMENT_START));
}

async function getExistingMatchmakingComment(context: Context<"issues.opened" | "issues.edited" | "issues.labeled">): Promise<IssueCommentSummary | undefined> {
  const comments = await listMatchmakingComments(context);
  return comments.sort((a, b) => a.id - b.id)[0];
}

async function createMatchmakingComment(
  context: Context<"issues.opened" | "issues.edited" | "issues.labeled">,
  body: string
): Promise<IssueCommentSummary | undefined> {
  const { payload } = context;
  const response = await context.octokit.rest.issues.createComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: payload.issue.number,
    body,
  });
  return response?.data ? { id: response.data.id, body: response.data.body } : undefined;
}

async function updateMatchmakingComment(context: Context<"issues.opened" | "issues.edited" | "issues.labeled">, commentId: number, body: string) {
  const { payload } = context;
  await context.octokit.rest.issues.updateComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    comment_id: commentId,
    body,
  });
}

async function deleteMatchmakingComment(context: Context<"issues.opened" | "issues.edited" | "issues.labeled">, commentId: number) {
  const { payload } = context;
  await context.octokit.rest.issues.deleteComment({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    comment_id: commentId,
  });
}

async function cleanupDuplicateMatchmakingComments(context: Context<"issues.opened" | "issues.edited" | "issues.labeled">, preferredCommentId?: number) {
  const comments = await listMatchmakingComments(context);
  if (comments.length <= 1) {
    return;
  }
  const keepComment = comments.find((comment) => comment.id === preferredCommentId) ?? comments.sort((a, b) => a.id - b.id)[0];
  await Promise.all(comments.filter((comment) => comment.id !== keepComment.id).map((comment) => deleteMatchmakingComment(context, comment.id)));
}

type IssueMatchingEvents = "issues.opened" | "issues.edited" | "issues.labeled" | "issue_comment.created";

/**
 * Checks if the current issue is a duplicate of an existing issue.
 * If a similar completed issue is found, it will add a comment to the issue with the assignee(s) of the similar issue.
 * @param context The context object
 **/
export async function issueMatching(context: Context<IssueMatchingEvents>) {
  return issueMatchingInternal(context, {});
}

export async function issueMatchingForUsers(context: Context<IssueMatchingEvents>, users: string[]) {
  const uniqueUsers = Array.from(new Set(users.map((u) => u.trim()).filter(Boolean)));
  return issueMatchingInternal(context, {
    allowedLogins: new Set(uniqueUsers),
    ensureLogins: uniqueUsers,
    forceThresholdZero: true,
    topK: 50,
    includeNonCompleted: true,
  });
}

type IssueMatchingInternalOptions = {
  allowedLogins?: Set<string>;
  ensureLogins?: string[];
  forceThresholdZero?: boolean;
  topK?: number;
  includeNonCompleted?: boolean;
};

async function issueMatchingInternal(context: Context<IssueMatchingEvents>, options: IssueMatchingInternalOptions) {
  const {
    logger,
    adapters: { supabase },
    payload,
  } = context;
  const issue = payload.issue;
  const authorType = issue.user?.type;
  const isHumanAuthor = authorType === "User";
  if (!isHumanAuthor) {
    logger.debug("Skipping issue matching for non-human author.", {
      author: issue.user?.login,
      type: authorType,
      issue: issue.number,
    });
    return null;
  }
  const issueContent = issue.body + issue.title;
  const matchResultArray: Map<string, Array<string>> = new Map();

  // If alwaysRecommend is enabled, use a lower threshold to ensure we get enough recommendations
  const threshold =
    options.forceThresholdZero || (context.config.alwaysRecommend && context.config.alwaysRecommend > 0) ? 0 : context.config.jobMatchingThreshold;

  const similarIssues = await supabase.issue.findSimilarIssuesToMatch({
    markdown: issueContent,
    threshold: threshold,
    currentId: issue.node_id,
    topK: options.topK,
  });

  if (similarIssues && similarIssues.length > 0) {
    similarIssues.sort((a: IssueSimilaritySearchResult, b: IssueSimilaritySearchResult) => b.similarity - a.similarity); // Sort by similarity
    const fetchPromises = similarIssues.map(async (issue: IssueSimilaritySearchResult) => {
      try {
        const issueObject: IssueNodeResponse = await context.octokit.graphql(
          /* GraphQL */
          `
            query ($issueNodeId: ID!) {
              node(id: $issueNodeId) {
                ... on Issue {
                  title
                  url
                  state
                  repository {
                    name
                    owner {
                      login
                    }
                  }
                  stateReason
                  closed
                  assignees(first: 10) {
                    nodes {
                      login
                      url
                    }
                  }
                }
              }
            }
          `,
          { issueNodeId: issue.issue_id }
        );
        if (!hasIssueNode(issueObject)) {
          context.logger.warn("Skipping non-issue node in recommendations.", { issueNodeId: issue.issue_id });
          return null;
        }
        issueObject.similarity = issue.similarity;
        return issueObject;
      } catch (error) {
        context.logger.error(`Failed to fetch issue ${issue.issue_id}: ${error}`, { issue });
        return null;
      }
    });
    const issueList = await Promise.allSettled(fetchPromises);

    logger.debug("Fetched similar issues", { issueList });
    issueList.forEach((issuePromise: PromiseSettledResult<IssueGraphqlResponse | null>) => {
      if (!issuePromise || issuePromise.status === "rejected" || !issuePromise.value) {
        return;
      }
      const issue = issuePromise.value as IssueGraphqlResponse;
      const hasAssignees = issue.node.assignees.nodes.length > 0;
      const isCompletedWithAssignees = issue.node.closed && issue.node.stateReason === "COMPLETED" && hasAssignees;
      const isEligible = options.includeNonCompleted ? hasAssignees : isCompletedWithAssignees;

      if (isEligible) {
        const assignees = issue.node.assignees.nodes;
        assignees.forEach((assignee: { login: string; url: string }) => {
          if (options.allowedLogins && !options.allowedLogins.has(assignee.login)) {
            return;
          }
          const similarityPercentage = Math.round(issue.similarity * 100);
          const issueLink = issue.node.url.replace(/https?:\/\/github.com/, "https://www.github.com");
          if (matchResultArray.has(assignee.login)) {
            matchResultArray
              .get(assignee.login)
              ?.push(
                `> \`${similarityPercentage}% Match\` [${issue.node.repository.owner.login}/${issue.node.repository.name}#${issue.node.url.split("/").pop()}](${issueLink})`
              );
          } else {
            matchResultArray.set(assignee.login, [
              `> \`${similarityPercentage}% Match\` [${issue.node.repository.owner.login}/${issue.node.repository.name}#${issue.node.url.split("/").pop()}](${issueLink})`,
            ]);
          }
        });
      }
    });

    if (options.ensureLogins) {
      for (const login of options.ensureLogins) {
        if (!matchResultArray.has(login)) {
          matchResultArray.set(login, []);
        }
      }
    }

    logger.debug("Matched issues", { matchResultArray, length: matchResultArray.size });

    // Convert Map to array and sort by highest similarity
    const sortedContributors = Array.from(matchResultArray.entries())
      .map(([login, matches]) => ({
        login,
        matches,
        maxSimilarity: matches.length ? Math.max(...matches.map((match) => parseInt(match.match(/`(\d+)% Match`/)?.[1] || "0"))) : 0,
      }))
      .sort((a, b) => b.maxSimilarity - a.maxSimilarity);

    logger.debug("Sorted contributors", { sortedContributors });
    return { matchResultArray, similarIssues, sortedContributors };
  }

  if (options.ensureLogins && options.ensureLogins.length > 0) {
    for (const login of options.ensureLogins) {
      if (!matchResultArray.has(login)) {
        matchResultArray.set(login, []);
      }
    }
    const sortedContributors = Array.from(matchResultArray.entries())
      .map(([login, matches]) => ({
        login,
        matches,
        maxSimilarity: 0,
      }))
      .sort((a, b) => b.maxSimilarity - a.maxSimilarity);
    return { matchResultArray, similarIssues: [], sortedContributors };
  }

  logger.info(`Exiting issueMatching handler!`, { similarIssues: similarIssues || "No similar issues found" });

  return null;
}

/**
 * Builds the comment to be added to the issue
 * @param matchResultArray The array of issues to be matched
 * @returns The comment to be added
 */
function commentBuilder(matchResultArray: Map<string, Array<string>>): string {
  const commentLines: string[] = [">[!NOTE]", MATCHMAKING_COMMENT_START];
  matchResultArray.forEach((issues: Array<string>, assignee: string) => {
    commentLines.push(`>### [${assignee}](https://www.github.com/${assignee})`);
    issues.forEach((issue: string) => {
      commentLines.push(issue);
    });
  });
  return commentLines.join("\n");
}
