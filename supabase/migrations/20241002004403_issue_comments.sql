CREATE OR REPLACE FUNCTION find_similar_issues(current_id VARCHAR, query_embedding vector(1024), threshold float8)
RETURNS TABLE(issue_id VARCHAR, issue_plaintext TEXT, similarity float8) AS $$
DECLARE
    current_quantized vector(1024);
BEGIN
    -- Ensure the query_embedding is in the correct format
    current_quantized := query_embedding;
    RETURN QUERY
    SELECT id AS issue_id,
           plaintext AS issue_plaintext,
           1 - (l2_distance(current_quantized, embedding)) AS similarity

    FROM issues
    WHERE id <> current_id
      AND 1 - (l2_distance(current_quantized, embedding)) > threshold
    ORDER BY similarity;
END;
$$ LANGUAGE plpgsql;