import { CallbackResult } from "../../proxy-callbacks";
import { Context } from "../../types";

export async function deleteCommentEmbedding(context: Context<"issue_comment.deleted">): Promise<CallbackResult> {
  const {
    logger,
    adapters: { supabase },
  } = context;

  await supabase.embeddings.deleteEmbedding(context.payload.comment.node_id);
  logger.ok(`Successfully deleted comment!`, { commentId: context.payload.comment.node_id });

  return { status: 200, reason: "success" };
}
