// RoleSquare — Gemini Fallback Client
//
// Provides callGeminiWithFallback() — cycles through a priority chain of
// 5 Gemini models, automatically falling back on 429/503/rate-limit errors.
//
// Key invariants:
//   1. NEVER silently returns empty results. When all models are exhausted it
//      THROWS GeminiRateLimitExhaustedError so job-runner can re-queue the row.
//   2. Supports multimodal fileParts (Gemini File API URIs) alongside text —
//      pass them via opts.fileParts[] to read PDFs/images/DOCX natively.
//   3. Timeout defaults to 120s (not 8s) to handle large documents.
//   4. 503 MODEL_CAPACITY_EXHAUSTED is treated the same as 429 (retryable).
//
// Model chain:
//   1. gemini-3.7-flash          Primary
//   2. gemini-3.6-flash          Fallback 1
//   3. gemini-3.5-flash          Fallback 2
//   4. gemini-3.5-flash-lite     Fallback 3
//   5. gemini-3.1-flash-lite     Fallback 4

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// ── Model definitions ────────────────────────────────────────────────────────

interface ModelDef {
  id: string;
  displayName: string;
  role: string;
  rpmCooldownMs: number;
}

const MODEL_CHAIN: ModelDef[] = [
  { id: "gemini-3.7-flash",      displayName: "Gemini 3.7 Flash",      role: "Primary",    rpmCooldownMs: 60_000 },
  { id: "gemini-3.6-flash",      displayName: "Gemini 3.6 Flash",      role: "Fallback 1", rpmCooldownMs: 60_000 },
  { id: "gemini-3.5-flash",      displayName: "Gemini 3.5 Flash",      role: "Fallback 2", rpmCooldownMs: 60_000 },
  { id: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash Lite", role: "Fallback 3", rpmCooldownMs: 60_000 },
  { id: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite", role: "Fallback 4", rpmCooldownMs: 60_000 },
];

// ── Rate-limit state (in-process, resets on server restart) ─────────────────

interface ModelState {
  blockedUntil: number;
  rateLimitHits: number;
  successCount: number;
  lastUsedAt: number | null;
}

const modelState = new Map<string, ModelState>(
  MODEL_CHAIN.map((m) => [
    m.id,
    { blockedUntil: 0, rateLimitHits: 0, successCount: 0, lastUsedAt: null },
  ])
);

function getState(modelId: string): ModelState {
  if (!modelState.has(modelId)) {
    modelState.set(modelId, { blockedUntil: 0, rateLimitHits: 0, successCount: 0, lastUsedAt: null });
  }
  return modelState.get(modelId)!;
}

function isBlocked(modelId: string): boolean {
  return getState(modelId).blockedUntil > Date.now();
}

function markBlocked(modelId: string, cooldownMs: number) {
  const state = getState(modelId);
  state.blockedUntil = Date.now() + cooldownMs;
  state.rateLimitHits += 1;
  console.warn(`[gemini] ${modelId} blocked for ${cooldownMs / 1000}s (total hits: ${state.rateLimitHits})`);
}

function markSuccess(modelId: string) {
  const state = getState(modelId);
  state.successCount += 1;
  state.lastUsedAt = Date.now();
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface GeminiMessage {
  role: "user" | "model";
  content: string;
}

/** A single content part: plain text OR a Gemini File API file reference */
export type GeminiPart =
  | { text: string }
  | { fileData: { fileUri: string; mimeType: string } };

export interface GeminiCallOptions {
  /** System instruction prepended to the conversation */
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Gemini File API file parts to attach to the last user message.
   * Obtained by calling uploadBufferToGemini() in gemini-file-api.ts.
   * Enables native multimodal reading of PDFs, images, DOCX, XLSX, etc.
   * without any server-side text extraction.
   */
  fileParts?: GeminiPart[];
  /**
   * Per-attempt timeout in milliseconds.
   * Default: 120_000 ms (2 minutes) — handles large multimodal documents.
   * Lower to ~15_000 for simple text-only classification calls.
   */
  timeoutMs?: number;
}

export interface GeminiResult {
  text: string;
  modelUsed: string;
  modelDisplayName: string;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
}

// ── Sentinel error ────────────────────────────────────────────────────────────

/**
 * Thrown when ALL models in the fallback chain are simultaneously blocked by
 * rate limits or server-side capacity exhaustion.
 *
 * job-runner MUST catch this error and mark the row's AiJob as `queued`
 * (not `failed`) so it is automatically retried after the cooldown window.
 * This is the primary mechanism that prevents silent data loss.
 */
export class GeminiRateLimitExhaustedError extends Error {
  constructor(details: string) {
    super(`All Gemini models exhausted (rate-limited/overloaded). ${details}`);
    this.name = "GeminiRateLimitExhaustedError";
  }
}

// ── Core fallback function ────────────────────────────────────────────────────

/**
 * Calls Gemini with automatic model fallback.
 *
 * Tries each model in priority order. On 429/503/RESOURCE_EXHAUSTED, marks the
 * model as blocked (60s cooldown) and tries the next one immediately.
 *
 * Multimodal: when opts.fileParts is set, the last user turn is sent as a
 * multi-part content array [filePart, filePart, ..., textPart] so Gemini reads
 * PDFs and images natively via the File API — no local text extraction needed.
 *
 * @throws GeminiRateLimitExhaustedError  — retryable; all models blocked
 * @throws Error                          — non-retryable; malformed request etc.
 */
export async function callGeminiWithFallback(
  messages: GeminiMessage[],
  opts: GeminiCallOptions = {}
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in environment variables.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const rateLimitErrors: string[] = [];
  const otherErrors: string[] = [];

  for (const modelDef of MODEL_CHAIN) {
    if (isBlocked(modelDef.id)) {
      const state = getState(modelDef.id);
      const remainingSec = Math.ceil((state.blockedUntil - Date.now()) / 1000);
      rateLimitErrors.push(`${modelDef.id}: cooling down (${remainingSec}s left)`);
      console.info(`[gemini] skipping ${modelDef.id} — cooling down`);
      continue;
    }

    try {
      console.info(`[gemini] trying model ${modelDef.id}`);

      const model = genAI.getGenerativeModel({
        model: modelDef.id,
        systemInstruction: opts.system,
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxOutputTokens ?? 4096,
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      });

      const history = messages.slice(0, -1).map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));
      const lastMessage = messages[messages.length - 1];
      const chat = model.startChat({ history });

      // Multimodal message: prepend file parts before the text instruction
      // so Gemini sees the raw document before the schema/extraction prompt.
      const messagePayload =
        opts.fileParts && opts.fileParts.length > 0
          ? { parts: [...opts.fileParts, { text: lastMessage.content }] }
          : lastMessage.content;

      const result = await Promise.race([
        chat.sendMessage(messagePayload as any),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout: ${modelDef.id} did not respond within ${timeoutMs / 1000}s`)),
            timeoutMs
          )
        ),
      ]);

      const response = result.response;
      const text = response.text();
      const usageMetadata = response.usageMetadata;
      const promptTokens     = usageMetadata?.promptTokenCount     ?? 0;
      const completionTokens = usageMetadata?.candidatesTokenCount ?? 0;
      const tokensUsed       = promptTokens + completionTokens;

      markSuccess(modelDef.id);
      console.info(`[gemini] ${modelDef.id} OK — ${tokensUsed} tokens (${promptTokens}p + ${completionTokens}c)`);

      return { text, modelUsed: modelDef.id, modelDisplayName: modelDef.displayName, tokensUsed, promptTokens, completionTokens };

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("rate limit") ||
        errMsg.toLowerCase().includes("quota");

      const isOverloaded =
        errMsg.includes("503") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("MODEL_CAPACITY_EXHAUSTED");

      if (isRateLimit || isOverloaded) {
        markBlocked(modelDef.id, modelDef.rpmCooldownMs);
        rateLimitErrors.push(`${modelDef.id}: ${errMsg}`);
        continue;
      }

      console.error(`[gemini] ${modelDef.id} non-recoverable error:`, errMsg);
      otherErrors.push(`${modelDef.id}: ${errMsg}`);
      continue;
    }
  }

  // All models tried. If everything was rate-limits, throw retryable error.
  if (rateLimitErrors.length > 0 && otherErrors.length === 0) {
    throw new GeminiRateLimitExhaustedError(`\n${rateLimitErrors.join("\n")}`);
  }

  throw new Error(
    `All Gemini models exhausted.\nRate limits: ${rateLimitErrors.join("; ")}\nOther errors: ${otherErrors.join("; ")}`
  );
}

// ── Model status export (for /api/ai/model-status) ──────────────────────────

export interface ModelStatus {
  modelId: string;
  displayName: string;
  role: string;
  status: "active" | "rate_limited";
  cooldownUntil: string | null;
  cooldownRemainingSeconds: number;
  rateLimitHits: number;
  successCount: number;
  lastUsedAt: string | null;
}

export function getModelChainStatus(): ModelStatus[] {
  const now = Date.now();
  return MODEL_CHAIN.map((m) => {
    const state = getState(m.id);
    const blocked = state.blockedUntil > now;
    const remainingMs = blocked ? state.blockedUntil - now : 0;
    return {
      modelId: m.id,
      displayName: m.displayName,
      role: m.role,
      status: blocked ? "rate_limited" : "active",
      cooldownUntil: blocked ? new Date(state.blockedUntil).toISOString() : null,
      cooldownRemainingSeconds: Math.ceil(remainingMs / 1000),
      rateLimitHits: state.rateLimitHits,
      successCount: state.successCount,
      lastUsedAt: state.lastUsedAt ? new Date(state.lastUsedAt).toISOString() : null,
    };
  });
}
