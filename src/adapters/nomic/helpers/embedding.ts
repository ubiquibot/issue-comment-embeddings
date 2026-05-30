import { Context } from "../../../types/context";

export class Embedding {
  protected context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  async createEmbedding(text: string | null): Promise<number[]> {
    if (text === null) {
      throw new Error("Text is null");
    } else {
      const embeddings = await this.createEmbeddings([text]);
      return embeddings[0] ?? [];
    }
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const apiKey = this.context.env.NOMIC_API_KEY;
    if (!apiKey) {
      throw new Error("NOMIC_API_KEY is not defined in environment variables.");
    }

    const response = await fetch("https://api-atlas.nomic.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nomic-embed-text-v1.5",
        input: texts,
        dimensions: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nomic API error: ${response.statusText}. Details: ${errorText}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    if (!data.data) {
      return [];
    }
    return data.data.map((item) => item?.embedding ?? []);
  }
}
