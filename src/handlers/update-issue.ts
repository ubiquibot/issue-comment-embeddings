import { Context } from "../types";
import { IssuePayload } from "../types/payload";
import { removeFootnotes } from "./issue-deduplication";

export async function updateIssue(context: Context) {
  const {
    logger,
    adapters: { supabase },
  } = context;
  const { payload } = context as { payload: IssuePayload };
  const payloadObject = payload;
  const nodeId = payload.issue.node_id;
  const isPrivate = payload.repository.private;
  const markdown = payload.issue.body + " " + payload.issue.title || null;
  const authorId = payload.issue.user?.id || -1;
  // Fetch the previous issue and update it in the db
  try {
    if (!markdown) {
      throw new Error("Issue body is empty");
    }
    //clean issue by removing footnotes
    const cleanedIssue = removeFootnotes(markdown);
    await supabase.issue.updateIssue(cleanedIssue, nodeId, payloadObject, isPrivate, authorId);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error updating issue:`, { error: error, stack: error.stack });
      throw error;
    } else {
      logger.error(`Error updating issue:`, { err: error, error: new Error() });
      throw error;
    }
  }

  logger.ok(`Successfully updated issue!`);
  logger.debug(`Exiting updateIssue`);
}
