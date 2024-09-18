import { CallbackResult } from "../../proxy-callbacks";
import { Context } from "../../types";

export async function createCommentEmbedding(context: Context<"issue_comment.created">): Promise<CallbackResult> {
  const {
    logger,
    adapters: { supabase },
  } = context;

  const uploaded = await supabase.embeddings.createConversationEmbeddings(context.payload.comment.node_id, context.payload, "comment");
  logger.ok(`Successfully created comment!`, { ...uploaded, embedding: "removed for brevity" });

  return { status: 200, reason: "success" };
}
