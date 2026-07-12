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

type RepositoryInfo = {
  owner: string;
  name: string;
};

type ContextScope = "repo" | "org" | "global";

type ContributorRecommendation = {
  login: string;
  matches: string[];
  maxSimilarity: number;
};

function hasIssueNode(response: IssueNodeResponse): response is IssueGraphqlResponse {
  return response.node !== null;
}

function getCurrentRepositoryInfo(payload: Context<IssueMatchingEvents>["payload"]): RepositoryInfo | null {
  const repository = (payload as { repository?: { owner?: { login?: string }; name?: string } }).repository;
  if (repository?.owner?.login && repository.name) {
    return { owner: repository.owner.login, name: repository.name };
  }

  const repositoryUrl = (payload.issue as { repository_url?: string }).repository_url;
  const match = repositoryUrl?.match(/\/repos\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return { owner: match[1], name: match[2] };
}

function getContextScope(currentRepository: RepositoryInfo | null, similarRepository: RepositoryInfo): ContextScope {
  if (!currentRepository) {
    return "global";
  }
  if (currentRepository.owner === similarRepository.owner && currentRepository.name === similarRepository.name) {
    return "repo";
  }
  if (currentRepository.owner === similarRepository.owner) {
    return "org";
  }
  return "global";
}

export function calculateContextAdjustedSimilarity(similarity: number, scope: ContextScope): number {
  const penaltyByScope: Record<ContextScope, number> = {
    repo: 0,
    org: 25,
    global: 50,
  };
  return Math.max(0, Math.round(similarity * 100 - penaltyByScope[scope]));
}

function getContextLabel(scope: ContextScope) {
  if (scope === "repo") {
    return "";
  }
  if (scope === "org") {
    return " (same organization context)";
  }
  return " (global context)";
}

function createIssueMatchLine(issue: IssueGraphqlResponse, adjustedSimilarityPercentage: number, scope: ContextScope) {
  const issueLink = issue.node.url.replace(/https?:\/\/github.com/, "https://www.github.com");
  return `> \`${adjustedSimilarityPercentage}% Match\` [${issue.node.repository.owner.login}/${issue.node.repository.name}#${issue.node.url.split("/").pop()}](${issueLink})${getContextLabel(scope)}`;
}

function buildSortedContributors(matchResultArray: Map<string, Array<string>>): ContributorRecommendation[] {
  return Array.from(matchResultArray.entries())
    .map(([login, matches]) => ({
      login,
      matches,
      maxSimilarity: matches.length ? Math.max(...matches.map((match) => parseInt(match.match(/`(\d+)% Match`/)?.[1] || "0"))) : 0,
    }))
    .sort((a, b) => b.maxSimilarity - a.maxSimilarity);
}

async function findRecentCodebaseContributor(
  context: Context<IssueMatchingEvents>,
  repository: RepositoryInfo | null,
  allowedLogins?: Set<string>
): Promise<{ login: string; commits: number } | null> {
  if (!repository) {
    return null;
  }

  try {
    const response = await context.octokit.rest.repos.listCommits({
      owner: repository.owner,
      repo: repository.name,
      per_page: 100,
    });
    const contributionCounts = new Map<string, number>();
    for (const commit of response.data) {
      const login = commit.author?.login;
      if (!login || login.endsWith("[bot]") || (allowedLogins && !allowedLogins.has(login))) {
        continue;
      }
      contributionCounts.set(login, (contributionCounts.get(login) ?? 0) + 1);
    }
    const [topContributor] = Array.from(contributionCounts.entries()).sort((a, b) => b[1] - a[1]);
    if (!topContributor) {
      return null;
    }
    return { login: topContributor[0], commits: topContributor[1] };
  } catch (error) {
    context.logger.warn("Unable to fetch recent repository contributors for recommendation fallback.", {
      repository,
      error,
    });
    return null;
  }
}

function addCodebaseActivityFallback(matchResultArray: Map<string, Array<string>>, contributor: { login: string; commits: number }) {
  const fallbackMatch = `> Codebase activity fallback: top recent contributor in this repository (${contributor.commits} commits in the latest 100 commits).`;
  const matches = matchResultArray.get(contributor.login) ?? [];
  if (!matches.includes(fallbackMatch)) {
    matches.push(fallbackMatch);
  }
  matchResultArray.set(contributor.login, matches);
}

export async function issueMatchingWithComment(context: Context<"issues.opened" | "issues.edited" | "issues.labeled">) {
  const { logger, octokit, payload } = context;
  const issue = payload.issue;
  const commentStart = ">The following contributors may be suitable for this task:";

  const result = await issueMatching(context);

  if (!result) {
    return;
  }

  const { matchResultArray, sortedContributors } = result;

  // Fetch if any previous comment exists
  const listIssues = (await octokit.paginate(octokit.rest.issues.listComments, {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: issue.number,
  })) as IssueCommentSummary[];

  //Check if the comment already exists
  const existingComment = listIssues.find((comment) => comment.body && comment.body.includes(">[!NOTE]" + "\n" + commentStart));

  if (matchResultArray.size === 0) {
    if (existingComment) {
      // If the comment already exists, delete it
      await octokit.rest.issues.deleteComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        comment_id: existingComment.id,
      });
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
    await context.octokit.rest.issues.updateComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      comment_id: existingComment.id,
      body: comment,
    });
  } else {
    await context.octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.issue.number,
      body: comment,
    });
  }
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
  const currentRepository = getCurrentRepositoryInfo(payload);
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
        const scope = getContextScope(currentRepository, {
          owner: issue.node.repository.owner.login,
          name: issue.node.repository.name,
        });
        const similarityPercentage = calculateContextAdjustedSimilarity(issue.similarity, scope);
        assignees.forEach((assignee: { login: string; url: string }) => {
          if (options.allowedLogins && !options.allowedLogins.has(assignee.login)) {
            return;
          }
          const issueMatch = createIssueMatchLine(issue, similarityPercentage, scope);
          if (matchResultArray.has(assignee.login)) {
            matchResultArray.get(assignee.login)?.push(issueMatch);
          } else {
            matchResultArray.set(assignee.login, [issueMatch]);
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

    let sortedContributors = buildSortedContributors(matchResultArray);
    if ((sortedContributors[0]?.maxSimilarity ?? 0) < 25) {
      const fallbackContributor = await findRecentCodebaseContributor(context, currentRepository, options.allowedLogins);
      if (fallbackContributor) {
        addCodebaseActivityFallback(matchResultArray, fallbackContributor);
        sortedContributors = buildSortedContributors(matchResultArray);
      }
    }

    logger.debug("Sorted contributors", { sortedContributors });
    return { matchResultArray, similarIssues, sortedContributors };
  }

  if (options.ensureLogins && options.ensureLogins.length > 0) {
    for (const login of options.ensureLogins) {
      if (!matchResultArray.has(login)) {
        matchResultArray.set(login, []);
      }
    }
    let sortedContributors = buildSortedContributors(matchResultArray);
    const fallbackContributor = await findRecentCodebaseContributor(context, currentRepository, options.allowedLogins);
    if (fallbackContributor) {
      addCodebaseActivityFallback(matchResultArray, fallbackContributor);
      sortedContributors = buildSortedContributors(matchResultArray);
    }
    return { matchResultArray, similarIssues: [], sortedContributors };
  }

  const fallbackContributor = await findRecentCodebaseContributor(context, currentRepository, options.allowedLogins);
  if (fallbackContributor) {
    addCodebaseActivityFallback(matchResultArray, fallbackContributor);
    return {
      matchResultArray,
      similarIssues: [],
      sortedContributors: buildSortedContributors(matchResultArray),
    };
  }

  logger.info(`Exiting issueMatching handler!`, { similarIssues: similarIssues || "No similar issues found" });
  return null;
}

/**
 * Builds the comment to be added to the issue
 * @param matchResultArray The array of issues to be matched
 * @returns The comment to be added to the issue
 */
function commentBuilder(matchResultArray: Map<string, Array<string>>): string {
  const commentLines: string[] = [">[!NOTE]", ">The following contributors may be suitable for this task:"];
  matchResultArray.forEach((issues: Array<string>, assignee: string) => {
    commentLines.push(`>### [${assignee}](https://www.github.com/${assignee})`);
    issues.forEach((issue: string) => {
      commentLines.push(issue);
    });
  });
  return commentLines.join("\n");
}
