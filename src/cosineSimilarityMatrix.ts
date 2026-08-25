/**
 * UbiquityOS - Cosine Similarity Matrix Calculator
 */
export function computeCosineSimilarityMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      let dot = 0, normA = 0, normB = 0;
      for (let k = 0; k < vectors[i].length; k++) {
        dot += vectors[i][k] * vectors[j][k];
        normA += vectors[i][k] * vectors[i][k];
        normB += vectors[j][k] * vectors[j][k];
      }
      const sim = normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }

  return matrix;
}
