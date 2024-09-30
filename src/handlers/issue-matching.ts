import { CallbackResult } from "../proxy-callbacks";
import { Context } from "../types";

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

function commentBuilder(matchResultArray: Map<string, Array<string>>) {
  const commentLines: string[] = [">[!NOTE]", ">The following contributors may be suitable for this task:"];
  matchResultArray.forEach((issues, assignee) => {
    commentLines.push(`>### [${assignee}](https://www.github.com/${assignee})`);
    issues.forEach((issue) => {
      commentLines.push(issue);
    });
  });
  return commentLines.join("\n");
};

export async function issueMatching(context: Context<"issues.opened" | "issues.edited">): Promise<CallbackResult> {
  const {
    logger,
    adapters: { supabase },
    octokit,
  } = context;
  const { payload } = context;
  const issue = payload.issue;
  const issueContent = issue.body + issue.title;
  const commentStart = ">The following contributors may be suitable for this task:";

  // On Adding the labels to the issue, the bot should
  // create a new comment with users who completed task most similar to the issue
  // if the comment already exists, it should update the comment with the new users
  const matchResultArray: Map<string, Array<string>> = new Map();
  const similarIssues = await supabase.embeddings.findSimilarContent(issueContent, context.config.jobMatchingThreshold, issue.node_id);
  if (similarIssues && similarIssues.length > 0) {
    // Find the most similar issue and the users who completed the task
    similarIssues.sort((a, b) => b.similarity - a.similarity);
    const fetchPromises = similarIssues.map(async (issue) => {
      const issueObject: IssueGraphqlResponse = await context.octokit.graphql(
        `query ($issueNodeId: ID!) {
            node(id: $issueNodeId) {
              ... on Issue {
                title
                url
                state
                repository{
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
          }`,
        { issueNodeId: issue.issue_id }
      );
      issueObject.similarity = issue.similarity;
      return issueObject;
    });

    const issueList = await Promise.all(fetchPromises);
    issueList.forEach((issue) => {
      if (issue.node.closed && issue.node.stateReason === "COMPLETED" && issue.node.assignees.nodes.length > 0) {
        const assignees = issue.node.assignees.nodes;
        assignees.forEach((assignee) => {
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
    // Fetch if any previous comment exists
    const listIssues = await octokit.issues.listComments({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: issue.number,
    });
    //Check if the comment already exists
    const existingComment = listIssues.data.find((comment) => comment.body && comment.body.includes(">[!NOTE]" + "\n" + commentStart));
    //Check if matchResultArray is empty
    if (matchResultArray && matchResultArray.size === 0) {
      if (existingComment) {
        // If the comment already exists, delete it
        await octokit.issues.deleteComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          comment_id: existingComment.id,
        });
      }
      logger.debug("No similar issues found");
      return { statusCode: 200 };
    }
    const comment = commentBuilder(matchResultArray);
    if (existingComment) {
      await context.octokit.issues.updateComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        comment_id: existingComment.id,
        body: comment,
      });
    } else {
      await context.octokit.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: payload.issue.number,
        body: comment,
      });
    }
  }

  logger.ok(`Successfully created issue comment!`);
  logger.debug(`Exiting issueMatching handler`);

  return { statusCode: 200 };
}
