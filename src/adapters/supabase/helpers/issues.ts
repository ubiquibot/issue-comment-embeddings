import { SupabaseClient } from "@supabase/supabase-js";
import { SuperSupabase } from "./supabase";
import { Context } from "../../../types/context";
import { markdownToPlainText } from "../../utils/markdown-to-plaintext";

export interface IssueSimilaritySearchResult {
  issue_id: string;
  issue_plaintext: string;
  similarity: number;
}

export interface IssueType {
  id: string;
  markdown?: string;
  plaintext?: string;
  payload?: Record<string, unknown>;
  author_id: number;
  created_at: string;
  modified_at: string;
  embedding: number[];
}

export class Issues extends SuperSupabase {
  constructor(supabase: SupabaseClient, context: Context) {
    super(supabase, context);
  }

  async createIssue(issueNodeId: string, payload: Record<string, unknown> | null, isPrivate: boolean, markdown: string | null, authorId: number) {
    //First Check if the issue already exists
    const { data, error } = await this.supabase.from("issues").select("*").eq("id", issueNodeId);
    if (error) {
      this.context.logger.error("Error creating issue", error);
      return;
    }
    if (data && data.length > 0) {
      this.context.logger.info("Issue already exists");
      return;
    } else {
      const embedding = await this.context.adapters.voyage.embedding.createEmbedding(markdown);
      let plaintext: string | null = markdownToPlainText(markdown);
      if (isPrivate) {
        payload = null;
        markdown = null;
        plaintext = null;
      }
      const { error } = await this.supabase.from("issues").insert([{ id: issueNodeId, payload, markdown, plaintext, author_id: authorId, embedding }]);
      if (error) {
        this.context.logger.error("Error creating issue", error);
        return;
      }
    }
    this.context.logger.info("Issue created successfully");
  }

  async updateIssue(markdown: string | null, issueNodeId: string, payload: Record<string, unknown> | null, isPrivate: boolean, authorId: number) {
    const embedding = Array.from(await this.context.adapters.voyage.embedding.createEmbedding(markdown));
    let plaintext: string | null = markdownToPlainText(markdown);
    if (isPrivate) {
      markdown = null;
      payload = null;
      plaintext = null;
    }
    const issues = await this.getIssue(issueNodeId);
    if (issues && issues.length == 0) {
      this.context.logger.info("Issue does not exist, creating a new one");
      await this.createIssue(issueNodeId, payload, isPrivate, markdown, authorId);
    } else {
      const { error } = await this.supabase.from("issues").update({ markdown, plaintext, embedding, payload, modified_at: new Date() }).eq("id", issueNodeId);

      if (error) {
        this.context.logger.error("Error updating comment", error);
      }
    }
  }

  async deleteIssue(issueNodeId: string) {
    const { error } = await this.supabase.from("issues").delete().eq("id", issueNodeId);
    if (error) {
      this.context.logger.error("Error deleting comment", error);
    }
  }

  async getIssue(issueNodeId: string): Promise<IssueType[] | null> {
    const { data, error } = await this.supabase
      .from("issues") // Provide the second type argument
      .select("*")
      .eq("id", issueNodeId)
      .returns<IssueType[]>();
    if (error) {
      this.context.logger.error("Error getting issue", error);
      return null;
    }
    return data;
  }

  async findSimilarIssues(markdown: string, threshold: number, currentId: string): Promise<IssueSimilaritySearchResult[] | null> {
    const embedding = await this.context.adapters.voyage.embedding.createEmbedding(markdown);
    const { data, error } = await this.supabase.rpc("find_similar_issues", {
      current_id: currentId,
      query_embedding: embedding,
      threshold: threshold,
      top_k: 5,
    });
    if (error) {
      this.context.logger.error("Error finding similar issues", error);
      return [];
    }
    return data;
  }

  async updatePayload(issueNodeId: string, payload: Record<string, unknown>) {
    const { error } = await this.supabase.from("issues").update({ payload }).eq("id", issueNodeId);
    if (error) {
      this.context.logger.error("Error updating issue payload", error);
    }
  }
}
