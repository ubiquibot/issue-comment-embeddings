import { IssueSimilaritySearchResult } from "../adapters/supabase/helpers/issues";
import { Context } from "../types";
import { IssuePayload } from "../types/payload";

export interface IssueGraphqlResponse {
  node: {
    title: string;
    number: number;
    url: string;
    body: string;
    repository: {
      name: string;
      owner: {
        login: string;
      };
    };
  };
  similarity: string;
  mostSimilarSentence: { sentence: string; similarity: number; index: number };
}

/**
 * Checks if the current issue is a duplicate of an existing issue.
 * If a similar issue is found, a footnote is added to the current issue.
 * @param context The context object
 * @returns True if a similar issue is found, false otherwise
 **/
export async function issueChecker(context: Context): Promise<boolean> {
  const {
    logger,
    adapters: { supabase },
    octokit,
  } = context;
  const { payload } = context as { payload: IssuePayload };
  const issue = payload.issue;
  let issueBody = issue.body;
  if (!issueBody) {
    logger.info("Issue body is empty");
    return false;
  }
  issueBody = removeFootnotes(issueBody);
  const similarIssues = await supabase.issue.findSimilarIssues(issue.title + removeFootnotes(issueBody), context.config.warningThreshold, issue.node_id);
  if (similarIssues && similarIssues.length > 0) {
    const matchIssues = similarIssues.filter((issue) => issue.similarity >= context.config.matchThreshold);
    if (matchIssues.length > 0) {
      logger.info(`Similar issue which matches more than ${context.config.matchThreshold} already exists`);
      await octokit.issues.update({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: issue.number,
        state: "closed",
        state_reason: "not_planned",
      });
    }

    if (similarIssues.length > 0) {
      logger.info(`Similar issue which matches more than ${context.config.warningThreshold} already exists`);
      await handleSimilarIssuesComment(context, payload, issueBody, issue.number, similarIssues);
      return true;
    }
  }
  context.logger.info("No similar issues found");

  //Use the IssueBody (Without footnotes) to update the issue
  if (issueBody !== issue.body) {
    await octokit.issues.update({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: issue.number,
      body: issueBody,
    });
  }
  return false;
}

function matchRepoOrgToSimilarIssueRepoOrg(repoOrg: string, similarIssueRepoOrg: string, repoName: string, similarIssueRepoName: string): boolean {
  return repoOrg === similarIssueRepoOrg && repoName === similarIssueRepoName;
}

/**
 * Finds the most similar sentence in a similar issue to a sentence in the current issue.
 * @param issueContent The content of the current issue
 * @param similarIssueContent The content of the similar issue
 * @returns The most similar sentence and its similarity score
 */
function findMostSimilarSentence(issueContent: string, similarIssueContent: string): { sentence: string; similarity: number; index: number } {
  // Regex to match sentences while preserving URLs
  const sentenceRegex = /([^.!?\s][^.!?]*(?:[.!?](?!['"]?\s|$)[^.!?]*)*[.!?]?['"]?(?=\s|$))/g;

  // Function to split text into sentences while preserving URLs
  const splitIntoSentences = (text: string): string[] => {
    const sentences: string[] = [];
    let match;
    while ((match = sentenceRegex.exec(text)) !== null) {
      sentences.push(match[0].trim());
    }
    return sentences;
  };

  const issueSentences = splitIntoSentences(issueContent);
  const similarIssueSentences = splitIntoSentences(similarIssueContent);

  let maxSimilarity = 0;
  let mostSimilarSentence = "";
  let mostSimilarIndex = -1;

  issueSentences.forEach((sentence, index) => {
    const similarities = similarIssueSentences.map((similarSentence) => {
      const editDistance = findEditDistance(sentence, similarSentence);
      const maxLength = Math.max(sentence.length, similarSentence.length);
      // Normalized similarity (edit distance)
      return 1 - editDistance / maxLength;
    });
    const maxSentenceSimilarity = Math.max(...similarities);
    if (maxSentenceSimilarity > maxSimilarity) {
      maxSimilarity = maxSentenceSimilarity;
      mostSimilarSentence = sentence;
      mostSimilarIndex = index;
    }
  });

  if (!mostSimilarSentence) {
    throw new Error("No similar sentence found");
  }
  return { sentence: mostSimilarSentence, similarity: maxSimilarity, index: mostSimilarIndex };
}

async function handleSimilarIssuesComment(
  context: Context,
  payload: IssuePayload,
  issueBody: string,
  issueNumber: number,
  similarIssues: IssueSimilaritySearchResult[]
) {
  const issueList: IssueGraphqlResponse[] = await Promise.all(
    similarIssues.map(async (issue: IssueSimilaritySearchResult) => {
      const issueUrl: IssueGraphqlResponse = await context.octokit.graphql(
        `query($issueNodeId: ID!) {
          node(id: $issueNodeId) {
            ... on Issue {
              title
              url
              number
              body
              repository {
                name
                owner {
                  login
                }
              }
            }
          }
        }`,
        { issueNodeId: issue.issue_id }
      );
      issueUrl.similarity = Math.round(issue.similarity * 100).toString();
      issueUrl.mostSimilarSentence = findMostSimilarSentence(issueBody, issueUrl.node.body);
      return issueUrl;
    })
  );

  const relevantIssues = issueList.filter((issue) =>
    matchRepoOrgToSimilarIssueRepoOrg(payload.repository.owner.login, issue.node.repository.owner.login, payload.repository.name, issue.node.repository.name)
  );

  if (relevantIssues.length === 0) {
    context.logger.info("No relevant issues found with the same repository and organization");
  }

  if (!issueBody) {
    return;
  }
  // Find existing footnotes in the body
  const footnoteRegex = /\[\^(\d+)\^\]/g;
  const existingFootnotes = issueBody.match(footnoteRegex) || [];
  const highestFootnoteIndex = existingFootnotes.length > 0 ? Math.max(...existingFootnotes.map((fn) => parseInt(fn.match(/\d+/)?.[0] ?? "0"))) : 0;
  let updatedBody = issueBody;
  let footnotes: string[] | undefined;
  // Sort relevant issues by similarity in ascending order
  relevantIssues.sort((a, b) => parseFloat(a.similarity) - parseFloat(b.similarity));

  relevantIssues.forEach((issue, index) => {
    const footnoteIndex = highestFootnoteIndex + index + 1; // Continue numbering from the highest existing footnote number
    const footnoteRef = `[^0${footnoteIndex}^]`;
    const modifiedUrl = issue.node.url.replace("https://github.com", "https://www.github.com");
    const { sentence } = issue.mostSimilarSentence;

    // Insert footnote reference in the body
    const sentencePattern = new RegExp(`${sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
    updatedBody = updatedBody.replace(sentencePattern, `${sentence}${footnoteRef}`);

    // Initialize footnotes array if not already done
    if (!footnotes) {
      footnotes = [];
    }

    // Add new footnote to the array
    footnotes.push(`${footnoteRef}: ⚠ ${issue.similarity}% possible duplicate - [${issue.node.title}](${modifiedUrl}#${issue.node.number})\n\n`);
  });

  // Append new footnotes to the body, keeping the previous ones
  if (footnotes) {
    updatedBody += "\n\n" + footnotes.join("");
  }

  // Update the issue with the modified body
  await context.octokit.issues.update({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    issue_number: issueNumber,
    body: updatedBody,
  });
}

/**
 * Finds the edit distance between two strings using dynamic programming.
 * The edit distance is a way of quantifying how dissimilar two strings are to one another by
 * counting the minimum number of operations required to transform one string into the other.
 * For more information, see: https://en.wikipedia.org/wiki/Edit_distance
 * @param sentenceA The first string
 * @param sentenceB The second string
 * @returns The edit distance between the two strings
 */
function findEditDistance(sentenceA: string, sentenceB: string): number {
  const lengthA = sentenceA.length;
  const lengthB = sentenceB.length;
  const distanceMatrix: number[][] = Array.from({ length: lengthA + 1 }, () => Array.from({ length: lengthB + 1 }, () => 0));

  for (let indexA = 0; indexA <= lengthA; indexA++) {
    for (let indexB = 0; indexB <= lengthB; indexB++) {
      if (indexA === 0) {
        distanceMatrix[indexA][indexB] = indexB;
      } else if (indexB === 0) {
        distanceMatrix[indexA][indexB] = indexA;
      } else if (sentenceA[indexA - 1] === sentenceB[indexB - 1]) {
        distanceMatrix[indexA][indexB] = distanceMatrix[indexA - 1][indexB - 1];
      } else {
        distanceMatrix[indexA][indexB] =
          1 + Math.min(distanceMatrix[indexA - 1][indexB], distanceMatrix[indexA][indexB - 1], distanceMatrix[indexA - 1][indexB - 1]);
      }
    }
  }

  return distanceMatrix[lengthA][lengthB];
}

/**
 * Removes all footnotes from the issue content.
 * This includes both the footnote references in the body and the footnote definitions at the bottom.
 * @param content The content of the issue
 * @returns The content without footnotes
 */
export function removeFootnotes(content: string): string {
  const footnoteDefRegex = /\[\^(\d+)\^\]: ⚠ \d+% possible duplicate - [^\n]+(\n|$)/g;
  const footnotes = content.match(footnoteDefRegex);
  let contentWithoutFootnotes = content.replace(footnoteDefRegex, "");
  if (footnotes) {
    footnotes.forEach((footnote) => {
      const footnoteNumber = footnote.match(/\d+/)?.[0];
      contentWithoutFootnotes = contentWithoutFootnotes.replace(new RegExp(`\\[\\^${footnoteNumber}\\^\\]`, "g"), "");
    });
  }
  return contentWithoutFootnotes.replace(/\n{2,}/g, "\n").trim();
}
