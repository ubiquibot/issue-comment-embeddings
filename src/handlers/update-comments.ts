import { Context } from "../types";
import { CommentPayload } from "../types/payload";

export async function updateComment(context: Context) {
  const {
    logger,
    adapters: { supabase },
  } = context;
  const { payload } = context as { payload: CommentPayload };
  const markdown = payload.comment.body;
  const authorId = payload.comment.user?.id || -1;
  const nodeId = payload.comment.node_id;
  const isPrivate = payload.repository.private;
  const issueId = payload.issue.node_id;

  // Fetch the previous comment and update it in the db
  try {
    if (!markdown) {
      throw new Error("Comment body is empty");
    }
    await supabase.comment.updateComment(markdown, nodeId, authorId, payload, isPrivate, issueId);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error updating comment:`, { error: error, stack: error.stack });
      throw error;
    } else {
      logger.error(`Error updating comment:`, { err: error, error: new Error() });
      throw error;
    }
  }

  logger.ok(`Successfully updated comment!`);
  logger.debug(`Exiting updateComment`);
}
