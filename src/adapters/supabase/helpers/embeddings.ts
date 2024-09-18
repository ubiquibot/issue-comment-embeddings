import { SupabaseClient } from "@supabase/supabase-js";
import { Super } from "./supabase";
import { Context } from "../../../types/context";
import { htmlToPlainText, markdownToPlainText } from "../../utils/markdown-to-plaintext";
import { EmbeddingClass, CommentMetadata, CommentType, IssueSimilaritySearchResult } from "../../../types/embeddings";
import { VoyageAIClient } from "voyageai";
import { isIssueCommentEvent, isIssueEvent } from "../../../types/typeguards";

const VECTOR_SIZE = 1024;

/**
 * Embeddings class for creating, updating, and deleting embeddings.
 *
 * Schema is as follows:
 * - `source_id` - The unique identifier for the embedding. (e.g. comment node_id, telegram chat_id, etc.)
 * - `type` - The type of embedding. (e.g. setup_instructions, dao_info, task, comment). Consider this the category.
 * - `plaintext` - The plaintext version of the markdown
 * - `embedding` - The embedding vector for the markdown
 * - `metadata` - Additional metadata for the embedding. (e.g. author_association, author_id, fileChunkIndex, filePath, isPrivate)
 * - `created_at` - The timestamp when the embedding was created
 * - `modified_at` - The timestamp when the embedding was last modified
 */
export class Embeddings extends Super {
  private _voyageClient: VoyageAIClient;
  constructor(voyageClient: VoyageAIClient, supabase: SupabaseClient, context: Context) {
    super(supabase, context);
    this._voyageClient = voyageClient;
  }

  /**
   * Creates embeddings for both issue specifications and comments.
   *
   * Receives only `issue_comment.created` and `issues.opened` events,
   * i.e comments and new specifications.
   */
  async createConversationEmbeddings(
    sourceId: string,
    payload: Context<"issue_comment.created" | "issues.opened">["payload"],
    type: EmbeddingClass = payload.action === "opened" ? "task" : "comment"
  ) {
    // First Check if the comment already exists
    if (await this.getEmbedding(sourceId)) {
      throw new Error(this.context.logger.error("source_id already exists", { sourceId })?.logMessage.raw);
    }

    const metadata = this._getMetadata(payload);

    // we should always have an author id
    if (!metadata.authorId) {
      throw new Error(this.context.logger.error("Author ID not found", { payload })?.logMessage.raw);
    }

    // Create the embedding
    return await this.createEmbedding(sourceId, type, this._getBody(payload), metadata);
  }

  /**
   * Updates embeddings for both issue specifications and comments.
   *
   * Receives `issue_comment.edited`, `issues.edited`, `issue_comment.deleted`, and `issues.deleted` events.
   */
  async updateConversationEmbeddings(
    sourceId: string,
    payload: Context<"issue_comment.edited" | "issue_comment.deleted" | "issues.edited" | "issues.deleted">["payload"],
    type: EmbeddingClass = payload.action === "edited" ? "comment" : "task"
  ) {
    const metadata = this._getMetadata(payload);

    // we should always have an author id
    if (!metadata.authorId) {
      throw new Error(this.context.logger.error("Author ID not found", { payload })?.logMessage.raw);
    }

    // Update the embedding
    return await this.updateEmbedding(sourceId, type, this._getBody(payload), metadata);
  }

  /**
   * Creates embeddings without any Context restrictions. Used for the likes of
   * `dao_info` and `setup_instructions`, which are not fundamentally tied
   * to any specific recurring webhook event.
   */
  async createEmbedding(sourceId: string, type: EmbeddingClass, markdown: string | null | undefined, metadata: Partial<CommentMetadata>) {
    if (!markdown) {
      throw new Error(this.context.logger.error("Markdown not found", { sourceId })?.logMessage.raw);
    }
    const toStore: CommentType = {
      source_id: sourceId,
      type,
      plaintext: htmlToPlainText(markdownToPlainText(markdown)).trim(),
      embedding: await this._embedWithVoyage(markdown, "document"),
      metadata,
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
    };

    const { error } = await this.supabase.from("content").insert([toStore]);

    if (error) {
      throw new Error(
        this.context.logger.error("Error creating embedding", { err: error, toStore: { ...toStore, embedding: "removed for brevity" } })?.logMessage.raw
      );
    }

    this.context.logger.info("Embedding created successfully");

    return toStore;
  }

  async updateEmbedding(sourceId: string, type: EmbeddingClass, body: string | null | undefined, metadata: Partial<CommentMetadata>) {
    if (!body) {
      throw new Error(this.context.logger.error("Markdown not found", { sourceId })?.logMessage.raw);
    }
    const embeddingData = await this.getEmbedding(sourceId);

    if (!embeddingData) {
      return await this.createEmbedding(sourceId, type, body, metadata);
    }

    const embedding = await this._embedWithVoyage(body, "document");

    const toStore: Omit<CommentType, "created_at"> = {
      source_id: sourceId,
      type,
      plaintext: body ? htmlToPlainText(markdownToPlainText(body)).trim() : null,
      embedding,
      metadata,
      modified_at: new Date().toISOString(),
    };

    const { error } = await this.supabase.from("content").update(toStore).eq("source_id", sourceId);

    if (error) {
      throw new Error(this.context.logger.error("Error updating comment", { err: error, toStore })?.logMessage.raw);
    }

    this.context.logger.info("Comment updated successfully");

    return toStore;
  }

  async getEmbedding(sourceId: string): Promise<CommentType> {
    const { data, error } = await this.supabase.from("content").select("*").eq("source_id", sourceId).single();
    if (error && error.code !== "PGRST116") {
      this.context.logger.error("Error getting comment", { err: error, sourceId });
    }
    return data;
  }

  async deleteEmbedding(sourceId: string) {
    const { error } = await this.supabase.from("content").delete().eq("source_id", sourceId);
    if (error) {
      throw new Error(this.context.logger.error("Error deleting comment", { err: error, sourceId })?.logMessage.raw);
    }
  }

  // Working with embeddings

  async findSimilarIssues(markdown: string, threshold: number, currentId: string): Promise<IssueSimilaritySearchResult[]> {
    const embedding = await this._embedWithVoyage(markdown, "query");
    const { data, error } = await this.supabase.rpc("find_similar_issues", {
      current_id: currentId,
      query_embedding: embedding,
      threshold: threshold,
    });
    if (error) {
      this.context.logger.error("Error finding similar issues", error);
      return [];
    }
    return data;
  }

  // Helpers

  async _embedWithVoyage(text: string | null, inputType: "document" | "query"): Promise<number[]> {
    try {
      if (text === null) {
        return new Array(VECTOR_SIZE).fill(0);
      } else {
        const response = await this._voyageClient.embed({
          input: text,
          model: "voyage-large-2-instruct",
          inputType: inputType
        });
        return (response.data && response.data[0]?.embedding) || [];
      }
    } catch (err) {
      throw new Error(this.context.logger.error("Error embedding comment", { err })?.logMessage.raw);
    }
  }

  private _getMetadata(payload: Context<"issue_comment.edited" | "issue_comment.deleted" | "issues.edited" | "issues.deleted" | "issue_comment.created" | "issues.opened">["payload"]) {
    const {
      repository: { private: isPrivate, node_id: repoNodeId },
      issue: { node_id: issueNodeId },
    } = payload;
    return {
      authorAssociation: this._getAuthorAssociation(payload),
      authorId: this._getAuthorId(payload),
      issueNodeId: issueNodeId,
      repoNodeId: repoNodeId,
      isPrivate,
    };
  }

  private _getAuthorAssociation(payload: Context["payload"]) {
    if (isIssueCommentEvent(payload)) {
      return payload.comment.author_association;
    } else if (isIssueEvent(payload)) {
      return payload.issue.author_association;
    }
  }

  private _getAuthorId(payload: Context["payload"]) {
    if (isIssueCommentEvent(payload)) {
      return payload.comment.user?.id;
    } else if (isIssueEvent(payload)) {
      return payload.issue.user?.id;
    }
  }

  private _getBody(payload: Context["payload"]) {
    if (isIssueCommentEvent(payload)) {
      return payload.comment.body;
    } else if (isIssueEvent(payload)) {
      return payload.issue.body;
    }
  }
}
