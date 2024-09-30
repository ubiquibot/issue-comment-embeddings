create extension if not exists vector;
DROP TABLE IF EXISTS content;

CREATE TABLE IF NOT EXISTS content (
    id            SERIAL PRIMARY KEY,
    source_id     VARCHAR NOT NULL,  -- Original ID from the source
    type          VARCHAR NOT NULL,  -- Content type ("comment" | "task" | "setup_instructions" | "dao_info" | ...)
    plaintext     TEXT,     -- Sanitized content
    embedding     VECTOR(1024) NOT NULL,  
    metadata      JSON,              -- Additional info (author, association, repo_id, chunkIndex, etc.)
    created_at    TIMESTAMP DEFAULT NOW(),
    modified_at   TIMESTAMP DEFAULT NOW()
);

ALTER TABLE "content" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION find_similar_content(curr_source_id VARCHAR, query_embedding vector(1024), threshold float8)
RETURNS TABLE(source_id VARCHAR, content_plaintext TEXT, similarity float8) AS $$
BEGIN
  RETURN QUERY
  SELECT content.source_id AS source_id,
         content.plaintext AS content_plaintext,
         1 - (content.embedding <=> query_embedding) AS similarity
  FROM content
  WHERE content.source_id <> curr_source_id
    AND 1 - (content.embedding <=> query_embedding) >= threshold
  ORDER BY similarity DESC;
END;
$$ LANGUAGE plpgsql;