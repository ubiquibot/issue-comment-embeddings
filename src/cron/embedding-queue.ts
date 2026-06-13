import { SupabaseClient } from "@supabase/supabase-js";
import { VoyageAIClient } from "voyageai";
import { Embedding as VoyageEmbedding } from "../adapters/voyage/helpers/embedding";
import { DocumentType } from "../types/document";
import { Context } from "../types/context";
import { Database } from "../types/database";
import { Env } from "../types/env";
import { serializeEmbeddingForDatabase } from "../utils/database-embedding";
import { getEmbeddingQueueSettings, sleep } from "../utils/embedding-queue";
import { cleanMarkdown, isTooShort, MIN_COMMENT_MARKDOWN_LENGTH, MIN_ISSUE_MARKDOWN_LENGTH } from "../utils/embedding-content";
import { isCommandLikeContent } from "../utils/markdown-comments";

type QueueLogger = {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
};

type QueueClients = {
  supabase: SupabaseClient<Database>;
  voyage: VoyageAIClient;
};

type QueueStats = {
  issuesProcessed: number;
  commentsProcessed: number;
  stoppedEarly: boolean;
};

type QueueLabel = "issues" | "comments" | "documents";

type PendingRow = {
  id: string;
  markdown: string | null;
  modified_at: string | null;
  payload: unknown;
  doc_type: DocumentType;
};

type PreparedRow = {
  row: PendingRow;
  embeddingSource: string;
  estimatedTokens: number;
};

type JsonRecord = Record<string, unknown>;

const MAX_RATE_LIMIT_DELAY_MS = 60_000;
const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 3;

function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const statusCode =
      getNestedNumber(error, ["statusCode"]) ??
      getNestedNumber(error, ["status"]) ??
      getNestedNumber(error, ["httpStatus"]) ??
      getNestedNumber(error, ["response", "status"]);
    if (statusCode === 429) {
      return true;
    }
    const body = (error as JsonRecord).body;
    const bodyMessage =
      getNestedString(body, ["error", "message"]) ??
      getNestedString(body, ["message"]) ??
      getNestedString(body, ["error", "type"]) ??
      getNestedString(body, ["error", "code"]);
    if (bodyMessage && bodyMessage.toLowerCase().includes("rate")) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("rate_limit");
}

function isTokenLimitError(error: unknown): boolean {
  const statusCode =
    getNestedNumber(error, ["statusCode"]) ??
    getNestedNumber(error, ["status"]) ??
    getNestedNumber(error, ["httpStatus"]) ??
    getNestedNumber(error, ["response", "status"]);
  const body = error && typeof error === "object" ? (error as JsonRecord).body : null;
  const message = [
    error instanceof Error ? error.message : String(error ?? ""),
    getNestedString(body, ["error", "message"]),
    getNestedString(body, ["message"]),
    getNestedString(body, ["error", "type"]),
    getNestedString(body, ["error", "code"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return statusCode === 400 && (message.includes("token") || message.includes("context") || message.includes("too many") || message.includes("maximum"));
}

function getNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as JsonRecord)[key];
  }
  return typeof current === "string" ? current : null;
}

function getNestedNumber(value: unknown, path: string[]): number | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as JsonRecord)[key];
  }
  return typeof current === "number" ? current : null;
}

function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const body = (error as JsonRecord).body;
  const retryAfterSeconds =
    getNestedNumber(body, ["retry_after"]) ??
    getNestedNumber(body, ["error", "retry_after"]) ??
    getNestedNumber(body, ["retryAfter"]) ??
    getNestedNumber(body, ["error", "retryAfter"]);
  if (retryAfterSeconds === null || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return null;
  }
  return Math.round(retryAfterSeconds * 1000);
}

function getRateLimitDelayMs(baseDelayMs: number, attempt: number, error: unknown): number {
  const retryAfterMs = getRetryAfterMs(error);
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }
  if (baseDelayMs <= 0) {
    return 0;
  }
  return Math.min(baseDelayMs * Math.pow(2, attempt), MAX_RATE_LIMIT_DELAY_MS);
}

function isReviewCommentThreadRoot(payload: unknown): boolean {
  const parentId = getNestedNumber(payload, ["comment", "in_reply_to_id"]);
  return parentId === null;
}

function getAuthorType(payload: unknown, docType: DocumentType): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (docType === "issue" || docType === "pull_request") {
    return (
      getNestedString(payload, ["issue", "user", "type"]) ??
      getNestedString(payload, ["pull_request", "user", "type"]) ??
      getNestedString(payload, ["sender", "type"])
    );
  }
  if (docType === "pull_request_review") {
    return getNestedString(payload, ["review", "user", "type"]) ?? getNestedString(payload, ["sender", "type"]);
  }

  return getNestedString(payload, ["comment", "user", "type"]) ?? getNestedString(payload, ["sender", "type"]);
}

function estimateEmbeddingTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / TOKEN_ESTIMATE_CHARS_PER_TOKEN));
}

function splitPreparedRowsByTokenBudget(prepared: PreparedRow[], maxBatchTokens: number): PreparedRow[][] {
  const batches: PreparedRow[][] = [];
  let currentBatch: PreparedRow[] = [];
  let currentTokens = 0;

  for (const entry of prepared) {
    const shouldStartNewBatch = currentBatch.length > 0 && currentTokens + entry.estimatedTokens > maxBatchTokens;
    if (shouldStartNewBatch) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokens = 0;
    }
    currentBatch.push(entry);
    currentTokens += entry.estimatedTokens;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function createEmbeddingsWithRetry(
  embedder: VoyageEmbedding,
  texts: string[],
  maxRetries: number,
  delayMs: number,
  logger: QueueLogger
): Promise<number[][] | null> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await embedder.createEmbeddings(texts);
    } catch (error) {
      if (!isRateLimitError(error)) {
        throw error;
      }
      const backoffMs = getRateLimitDelayMs(delayMs, attempt, error);
      logger.warn("Voyage rate limit hit while creating embeddings batch.", { attempt: attempt + 1, backoffMs });
      if (attempt >= maxRetries) {
        return null;
      }
      await sleep(backoffMs);
      attempt += 1;
    }
  }
  return null;
}

async function createEmbeddingsForPreparedRows(params: {
  entries: PreparedRow[];
  embedder: VoyageEmbedding;
  settings: ReturnType<typeof getEmbeddingQueueSettings>;
  logger: QueueLogger;
  label: QueueLabel;
  splitDepth?: number;
}): Promise<number[][] | null> {
  const { entries, embedder, settings, logger, label, splitDepth = 0 } = params;
  try {
    return await createEmbeddingsWithRetry(
      embedder,
      entries.map((entry) => entry.embeddingSource),
      settings.maxRetries,
      settings.delayMs,
      logger
    );
  } catch (error) {
    if (!isTokenLimitError(error) || entries.length === 1) {
      throw error;
    }

    const midpoint = Math.ceil(entries.length / 2);
    const leftEntries = entries.slice(0, midpoint);
    const rightEntries = entries.slice(midpoint);
    logger.warn("Voyage token limit hit; splitting embedding batch.", {
      label,
      rows: entries.length,
      leftRows: leftEntries.length,
      rightRows: rightEntries.length,
      splitDepth,
    });

    const leftEmbeddings = await createEmbeddingsForPreparedRows({
      entries: leftEntries,
      embedder,
      settings,
      logger,
      label,
      splitDepth: splitDepth + 1,
    });
    if (!leftEmbeddings) {
      return null;
    }

    const rightEmbeddings = await createEmbeddingsForPreparedRows({
      entries: rightEntries,
      embedder,
      settings,
      logger,
      label,
      splitDepth: splitDepth + 1,
    });
    if (!rightEmbeddings) {
      return null;
    }

    return [...leftEmbeddings, ...rightEmbeddings];
  }
}

async function preparePendingRow(params: {
  row: PendingRow;
  label: QueueLabel;
  supabase: SupabaseClient<Database>;
  logger: QueueLogger;
}): Promise<PreparedRow | null> {
  const { row, label, supabase, logger } = params;
  const docType = row.doc_type as DocumentType;
  const authorType = getAuthorType(row.payload, docType);
  if (authorType && authorType !== "User") {
    const isBotRootReviewAllowed = docType === "review_comment" && isReviewCommentThreadRoot(row.payload);
    if (!isBotRootReviewAllowed) {
      logger.debug("Skipping embedding for non-human author.", { label, id: row.id, authorType, docType });
      const { error: updateError } = await supabase.from("documents").update({ markdown: null, modified_at: new Date().toISOString() }).eq("id", row.id);
      if (updateError) {
        logger.error("Failed to clear markdown for non-human author.", { label, id: row.id, updateError });
      }
      return null;
    }
    logger.debug("Allowing bot-authored root review comment for embedding.", { label, id: row.id, authorType, docType });
  }

  const cleaned = cleanMarkdown(typeof row.markdown === "string" ? row.markdown : null);
  const isIssueDoc = docType === "issue" || docType === "pull_request";
  const minLength = isIssueDoc ? MIN_ISSUE_MARKDOWN_LENGTH : MIN_COMMENT_MARKDOWN_LENGTH;
  if ((docType === "issue_comment" || docType === "review_comment" || docType === "pull_request_review") && isCommandLikeContent(cleaned)) {
    logger.debug("Skipping embedding for command-like comment.", { label, id: row.id, docType });
    const { error: updateError } = await supabase.from("documents").update({ markdown: null, modified_at: new Date().toISOString() }).eq("id", row.id);
    if (updateError) {
      logger.error("Failed to clear markdown for command-like comment.", { label, id: row.id, updateError });
    }
    return null;
  }
  if (!cleaned) {
    logger.debug("Skipping empty markdown embedding.", { label, id: row.id, docType });
    const { error: updateError } = await supabase.from("documents").update({ markdown: null, modified_at: new Date().toISOString() }).eq("id", row.id);
    if (updateError) {
      logger.error("Failed to clear markdown for empty content.", { label, id: row.id, updateError });
    }
    return null;
  }
  if (isTooShort(cleaned, minLength)) {
    logger.debug("Skipping embedding for short content.", { label, id: row.id, length: cleaned.length, minLength, docType });
    const { error: updateError } = await supabase.from("documents").update({ markdown: null, modified_at: new Date().toISOString() }).eq("id", row.id);
    if (updateError) {
      logger.error("Failed to clear markdown for short content.", { label, id: row.id, updateError });
    }
    return null;
  }

  return { row, embeddingSource: cleaned, estimatedTokens: estimateEmbeddingTokens(cleaned) };
}

async function processPendingRows(params: {
  docTypes: DocumentType[];
  label: QueueLabel;
  supabase: SupabaseClient<Database>;
  embedder: VoyageEmbedding;
  settings: ReturnType<typeof getEmbeddingQueueSettings>;
  logger: QueueLogger;
}): Promise<{ processed: number; stoppedEarly: boolean; processedByType: Record<DocumentType, number> }> {
  const { docTypes, label, supabase, embedder, settings, logger } = params;
  const processedByType: Record<DocumentType, number> = {
    issue: 0,
    pull_request: 0,
    issue_comment: 0,
    review_comment: 0,
    pull_request_review: 0,
  };
  const { data, error } = await supabase
    .from("documents")
    .select("id, markdown, modified_at, payload, doc_type")
    .in("doc_type", docTypes)
    .is("embedding", null)
    .is("deleted_at", null)
    .not("markdown", "is", null)
    .order("modified_at", { ascending: true })
    .limit(settings.batchSize);

  if (error) {
    logger.error("Failed to load pending embeddings.", { label, error });
    return { processed: 0, stoppedEarly: false, processedByType };
  }

  if (!data || data.length === 0) {
    return { processed: 0, stoppedEarly: false, processedByType };
  }

  const rows = (data as PendingRow[]).slice();
  const prepared: PreparedRow[] = [];

  for (const row of rows) {
    const result = await preparePendingRow({ row, label, supabase, logger });
    if (result) {
      prepared.push(result);
    }
  }

  if (prepared.length === 0) {
    return { processed: 0, stoppedEarly: false, processedByType };
  }

  const tokenBatches = splitPreparedRowsByTokenBudget(prepared, settings.maxBatchTokens);
  if (tokenBatches.length > 1) {
    logger.info("Splitting embedding queue batch by token budget.", {
      label,
      rows: prepared.length,
      batches: tokenBatches.length,
      maxBatchTokens: settings.maxBatchTokens,
    });
  }

  const embeddings: number[][] = [];
  for (const entries of tokenBatches) {
    const batchEmbeddings = await createEmbeddingsForPreparedRows({ entries, embedder, settings, logger, label });
    if (!batchEmbeddings) {
      return { processed: 0, stoppedEarly: true, processedByType };
    }
    embeddings.push(...batchEmbeddings);
  }

  if (embeddings.length !== prepared.length) {
    logger.error("Embedding batch response size mismatch.", {
      label,
      expected: prepared.length,
      received: embeddings.length,
    });
    return { processed: 0, stoppedEarly: true, processedByType };
  }

  const updates = prepared.map((entry, index) => ({
    row: entry.row,
    embedding: embeddings[index] ?? [],
  }));

  let processed = 0;
  const concurrency = Math.max(1, Math.min(settings.concurrency, updates.length));

  async function worker() {
    while (updates.length > 0) {
      const update = updates.shift();
      if (!update) {
        return;
      }
      if (!update.embedding.length) {
        logger.error("Embedding batch returned empty vector.", { label, id: update.row.id });
        const { error: clearError } = await supabase
          .from("documents")
          .update({ markdown: null, modified_at: new Date().toISOString() })
          .eq("id", update.row.id);
        if (clearError) {
          logger.error("Failed to clear markdown after empty embedding.", {
            label,
            id: update.row.id,
            clearError,
          });
        }
        continue;
      }
      const { error: updateError } = await supabase
        .from("documents")
        .update({ embedding: serializeEmbeddingForDatabase(update.embedding), modified_at: new Date().toISOString() })
        .eq("id", update.row.id);

      if (updateError) {
        logger.error("Failed to update embedding.", { label, id: update.row.id, updateError });
        continue;
      }
      const docType = update.row.doc_type as DocumentType;
      if (processedByType[docType] !== undefined) {
        processedByType[docType] += 1;
      }
      processed += 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (processed > 0) {
    await sleep(settings.delayMs);
  }

  return { processed, stoppedEarly: false, processedByType };
}

export async function processPendingEmbeddings(params: { env: Env; clients: QueueClients; logger: QueueLogger }): Promise<QueueStats> {
  const { env, clients, logger } = params;
  const settings = getEmbeddingQueueSettings(env);

  if (!settings.enabled) {
    logger.debug("Embedding queue disabled; skipping pending embeddings.");
    return { issuesProcessed: 0, commentsProcessed: 0, stoppedEarly: false };
  }

  const embedder = new VoyageEmbedding(clients.voyage, { logger } as unknown as Context);

  const combinedResult = await processPendingRows({
    docTypes: ["issue", "pull_request", "issue_comment", "review_comment", "pull_request_review"],
    label: "documents",
    supabase: clients.supabase,
    embedder,
    settings,
    logger,
  });

  const issuesProcessed = (combinedResult.processedByType.issue ?? 0) + (combinedResult.processedByType.pull_request ?? 0);
  const commentsProcessed =
    (combinedResult.processedByType.issue_comment ?? 0) +
    (combinedResult.processedByType.review_comment ?? 0) +
    (combinedResult.processedByType.pull_request_review ?? 0);

  return {
    issuesProcessed,
    commentsProcessed,
    stoppedEarly: combinedResult.stoppedEarly,
  };
}
