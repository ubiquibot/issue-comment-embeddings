import { Context } from "../types";
import { CommentPayload } from "../types/payload";

export async function addComments(context: Context) {
  const {
    logger,
    adapters: { supabase },
  } = context;
  const { payload } = context as { payload: CommentPayload };
  const markdown = payload.comment.body;
  const authorId = payload.comment.user?.id || -1;
  const nodeId = payload.comment.node_id;
  const isPrivate = context.config.redactPrivateRepoComments ? false : payload.repository.private;
  const issueId = payload.issue.node_id;

  try {
    if (!markdown) {
      throw new Error("Comment body is empty");
    }
    await supabase.comment.createComment(markdown, nodeId, authorId, payload, isPrivate, issueId);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error creating comment:`, { error: error, stack: error.stack });
      throw error;
    } else {
      logger.error(`Error creating comment:`, { err: error, error: new Error() });
      throw error;
    }
  }

  logger.ok(`Successfully created comment!`);
  logger.debug(`Exiting addComments`);
}
