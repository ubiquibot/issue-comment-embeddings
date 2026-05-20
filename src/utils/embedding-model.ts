import { Context } from "../types";

export type EmbeddingModel = "voyage" | "nomic";

export function getEmbeddingModel(context: Context): EmbeddingModel {
  return context.config.embeddingModel ?? "voyage";
}

export function isNomicAvailable(context: Context): boolean {
  return Boolean(context.env.NOMIC_API_KEY);
}
