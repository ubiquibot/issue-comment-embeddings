import { Context } from "../types";
import { IssuePayload } from "../types/payload";

export async function updateIssue(context: Context) {
  const {
    logger,
    adapters: { supabase },
  } = context;
  const { payload } = context as { payload: IssuePayload };
  const payloadObject = payload;
  const nodeId = payload.issue.node_id;
  const isPrivate = !context.config.redactPrivateRepoComments && payload.repository.private;
  const markdown = payload.issue.body + " " + payload.issue.title || null;
  // Fetch the previous issue and update it in the db
  try {
    if (!markdown) {
      throw new Error("Issue body is empty");
    }
    await supabase.issue.updateIssue(markdown, nodeId, payloadObject, isPrivate);
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
