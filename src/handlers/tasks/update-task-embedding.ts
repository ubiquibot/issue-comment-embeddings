import { CallbackResult } from "../../proxy-callbacks";
import { Context } from "../../types";

export async function updateTaskEmbedding(context: Context<"issues.edited">): Promise<CallbackResult> {
  const {
    logger,
    adapters: { supabase },
  } = context;

  const updated = await supabase.embeddings.updateConversationEmbeddings(context.payload.issue.node_id, context.payload, "task");
  logger.ok(`Successfully updated issue!`, { ...updated, embedding: "removed for brevity" });

  return { status: 200, reason: "success" };
}
