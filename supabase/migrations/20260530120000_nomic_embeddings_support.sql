DROP FUNCTION IF EXISTS find_similar_issues(VARCHAR, vector(1024), float8, INT);
DROP FUNCTION IF EXISTS find_similar_comments(vector(1024), float8, INT);
DROP FUNCTION IF EXISTS find_similar_issues_annotate(VARCHAR, vector(1024), float8, INT);
DROP FUNCTION IF EXISTS find_similar_comments_annotate(VARCHAR, vector(1024), float8, INT);
DROP FUNCTION IF EXISTS find_similar_issues_to_match(VARCHAR, vector(1024), float8, INT);

CREATE OR REPLACE FUNCTION find_similar_issues(current_id VARCHAR, query_embedding vector(1024), threshold float8, top_k INT, query_model VARCHAR DEFAULT 'voyage-4-large')
RETURNS TABLE(issue_id VARCHAR, similarity float8) AS $$
DECLARE
    current_repo TEXT;
    current_org TEXT;
BEGIN
    SELECT
        payload->'repository'->>'name'::text,
        payload->'repository'->'owner'->>'login'::text
    INTO current_repo, current_org
    FROM documents
    WHERE id = current_id
      AND doc_type = 'issue';

    RETURN QUERY
    SELECT sub.issue_id,
           sub.similarity
    FROM (
        SELECT id AS issue_id,
               ((0.8 * (1 - cosine_distance(query_embedding, embedding))) + 0.8 * (1 / (1 + l2_distance(query_embedding, embedding)))) as similarity
        FROM documents
        WHERE id <> current_id
            AND doc_type = 'issue'
            AND deleted_at IS NULL
            AND embedding IS NOT NULL
            AND COALESCE(embedding_model, 'voyage-4-large') = query_model
            AND COALESCE(payload->'repository'->>'name', '') = COALESCE(current_repo, '')
            AND COALESCE(payload->'repository'->'owner'->>'login', '') = COALESCE(current_org, '')
    ) sub
    WHERE sub.similarity > threshold
    ORDER BY sub.similarity DESC
    LIMIT top_k;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_similar_comments(query_embedding vector(1024), threshold float8, top_k INT, query_model VARCHAR DEFAULT 'voyage-4-large')
RETURNS TABLE(comment_id VARCHAR, similarity float8) AS $$
BEGIN
    RETURN QUERY
    SELECT sub.comment_id,
           sub.similarity
    FROM (
        SELECT id AS comment_id,
               ((0.8 * (1 - cosine_distance(query_embedding, embedding))) + 0.8 * (1 / (1 + l2_distance(query_embedding, embedding)))) as similarity
        FROM documents
        WHERE deleted_at IS NULL
            AND embedding IS NOT NULL
            AND COALESCE(embedding_model, 'voyage-4-large') = query_model
            AND doc_type IN ('issue_comment', 'review_comment', 'pull_request_review')
    ) sub
    WHERE sub.similarity > threshold
    ORDER BY sub.similarity DESC
    LIMIT top_k;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_similar_issues_annotate(current_id VARCHAR, query_embedding vector(1024), threshold float8, top_k INT, query_model VARCHAR DEFAULT 'voyage-4-large')
RETURNS TABLE(issue_id VARCHAR, similarity float8) AS $$
BEGIN
    RETURN QUERY
    SELECT sub.issue_id,
           sub.similarity
    FROM (
        SELECT id AS issue_id,
               ((0.7 * (1 - cosine_distance(query_embedding, embedding))) + 0.3 * (1 / (1 + l2_distance(query_embedding, embedding)))) as similarity
        FROM documents
        WHERE id <> current_id
            AND doc_type = 'issue'
            AND deleted_at IS NULL
            AND embedding IS NOT NULL
            AND COALESCE(embedding_model, 'voyage-4-large') = query_model
    ) sub
    WHERE sub.similarity > threshold
    ORDER BY sub.similarity DESC
    LIMIT top_k;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_similar_comments_annotate(current_id VARCHAR, query_embedding vector(1024), threshold float8, top_k INT, query_model VARCHAR DEFAULT 'voyage-4-large')
RETURNS TABLE(comment_id VARCHAR, similarity float8) AS $$
BEGIN
    RETURN QUERY
    SELECT sub.comment_id,
           sub.similarity
    FROM (
        SELECT id AS comment_id,
               ((0.7 * (1 - cosine_distance(query_embedding, embedding))) + 0.3 * (1 / (1 + l2_distance(query_embedding, embedding)))) as similarity
        FROM documents
        WHERE id <> current_id
            AND doc_type IN ('issue_comment', 'review_comment', 'pull_request_review')
            AND deleted_at IS NULL
            AND embedding IS NOT NULL
            AND COALESCE(embedding_model, 'voyage-4-large') = query_model
    ) sub
    WHERE sub.similarity > threshold
    ORDER BY sub.similarity DESC
    LIMIT top_k;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_similar_issues_to_match(current_id VARCHAR, query_embedding vector(1024), threshold float8, top_k INT, query_model VARCHAR DEFAULT 'voyage-4-large')
RETURNS TABLE(issue_id VARCHAR, similarity float8) AS $$
BEGIN
    RETURN QUERY
    SELECT sub.issue_id,
           sub.similarity
    FROM (
        SELECT id AS issue_id,
               ((0.8 * (1 - cosine_distance(query_embedding, embedding))) + 0.2 * (1 / (1 + l2_distance(query_embedding, embedding)))) as similarity
        FROM documents
        WHERE id <> current_id
            AND doc_type = 'issue'
            AND deleted_at IS NULL
            AND embedding IS NOT NULL
            AND COALESCE(embedding_model, 'voyage-4-large') = query_model
    ) sub
    WHERE sub.similarity > threshold
    ORDER BY sub.similarity DESC
    LIMIT top_k;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS documents_embedding_model_idx ON public.documents (embedding_model);
