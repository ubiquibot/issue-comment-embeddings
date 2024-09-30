export type EmbeddingClass = "setup_instructions" | "dao_info" | "task" | "comment";
export type CommentType = {
  source_id: string;
  type: string;
  plaintext: string | null | undefined;
  embedding: number[];
  metadata: Partial<CommentMetadata>;
  created_at: string;
  modified_at: string;
};
export interface CommentMetadata {
  author_association: string | null;
  author_id: number;
  issue_node_id: string;
  repo_node_id: string;
  isPrivate: boolean;
}

export interface IssueSimilaritySearchResult {
  issue_id: string;
  issue_plaintext: string;
  similarity: number;
}
