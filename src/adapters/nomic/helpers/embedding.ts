import { SuperNomic } from "./nomic";

export const NOMIC_EMBEDDING_DIM = 768;
export const NOMIC_MODEL = "nomic-embed-text-v1.5";

type NomicInputType = "document" | "query";

type NomicEmbeddingResponse = {
  embeddings?: unknown;
};

function toTaskType(inputType: NomicInputType): "search_document" | "search_query" {
  return inputType === "query" ? "search_query" : "search_document";
}

function assertEmbeddings(value: unknown): number[][] {
  if (!Array.isArray(value) || !value.every((embedding) => Array.isArray(embedding) && embedding.every((dimension) => typeof dimension === "number"))) {
    throw new Error("Invalid response from Nomic API: missing embeddings array");
  }
  return value;
}

export class Embedding extends SuperNomic {
  async createEmbedding(text: string | null, inputType: NomicInputType = "document"): Promise<number[]> {
    if (text === null) {
      throw new Error("Text is null");
    }
    const embeddings = await this.createEmbeddings([text], inputType);
    return embeddings[0] ?? [];
  }

  async createEmbeddings(texts: string[], inputType: NomicInputType = "document"): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const apiKey = this.context.env.NOMIC_API_KEY;
    if (!apiKey) {
      throw new Error("NOMIC_API_KEY is required to create Nomic embeddings");
    }

    const response = await fetch("https://api.atlas.nomic.ai/v1/embedding/text", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts,
        model: NOMIC_MODEL,
        task_type: toTaskType(inputType),
        dimensionality: NOMIC_EMBEDDING_DIM,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Nomic API request failed with status ${response.status}: ${body}`);
    }

    const data = (await response.json()) as NomicEmbeddingResponse;
    const embeddings = assertEmbeddings(data.embeddings);
    const unexpectedDimension = embeddings.find((embedding) => embedding.length !== NOMIC_EMBEDDING_DIM);
    if (unexpectedDimension) {
      this.context.logger.warn("Nomic embedding dimension mismatch.", {
        expected: NOMIC_EMBEDDING_DIM,
        received: unexpectedDimension.length,
      });
    }
    return embeddings;
  }
}
