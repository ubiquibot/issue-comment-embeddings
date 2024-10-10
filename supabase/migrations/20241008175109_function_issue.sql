DROP FUNCTION IF EXISTS find_similar_issues;

CREATE OR REPLACE FUNCTION find_similar_issues(current_id VARCHAR, query_embedding vector(1024), threshold float8, top_k INT)
RETURNS TABLE(issue_id VARCHAR, issue_plaintext TEXT, similarity float8) AS $$
DECLARE
    current_quantized vector(1024);
    current_repo TEXT;
    current_org TEXT;
BEGIN
    -- Ensure the query_embedding is in the correct format
    current_quantized := query_embedding;

    -- Extract the current issue's repo and org from the payload
    SELECT
        payload->'repository'->>'name'::text,
        payload->'repository'->'owner'->>'login'::text
    INTO current_repo, current_org
    FROM issues
    WHERE id = current_id;

    -- Check if the current issue has valid repo and org
    IF current_repo IS NULL OR current_org IS NULL THEN
        RETURN;  -- Exit if current issue's repo or org is null
    END IF;

    RETURN QUERY
    SELECT id AS issue_id,
           plaintext AS issue_plaintext,
           ((0.5 * inner_product(current_quantized, embedding)) + 0.5 * (1 / (1 + l2_distance(current_quantized, embedding)))) as similarity
    FROM issues
    WHERE id <> current_id
        AND current_repo = payload->'repository'->>'name'::text
        AND current_org =  payload->'repository'->'owner'->>'login'::text
        AND  ((0.5 * inner_product(current_quantized, embedding)) + 0.5 * (1 / (1 + l2_distance(current_quantized, embedding)))) > threshold
    ORDER BY similarity DESC
    LIMIT top_k;
END;
$$ LANGUAGE plpgsql;
