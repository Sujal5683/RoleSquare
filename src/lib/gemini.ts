// RoleSquare — Gemini Fallback Client
//
// Provides callGeminiWithFallback() — cycles through a priority chain of
// 6 Gemini models, following these rules:
//
//  RATE LIMIT (429 / RESOURCE_EXHAUSTED):
//    → Instantly switch to the next model. NO wait. The blocked model cools
//      down for 60 s then automatically becomes available again.
//
//  SERVICE UNAVAILABLE (503 / MODEL_CAPACITY_EXHAUSTED):
//    → Wait 10 s, retry the SAME model once. If still failing, switch to next.
//
//  TIMEOUT / NO RESPONSE:
//    → Switch to next model immediately (same as rate limit).
//
//  ALL MODELS EXHAUSTED:
//    → Throw GeminiRateLimitExhaustedError so job-runner re-queues the row.
//      Zero data lost.
//
//  RESET / COOL-DOWN:
//    → Each model tracks its own blockedUntil timestamp. Once it expires the
//      model is automatically re-promoted to "active" and used first again if
//      it's the highest-priority available model.
//
// Model chain (highest priority → lowest):
//   1. gemini-3.8-flash       Primary
//   2. gemini-3.7-flash       Fallback 1
//   3. gemini-3.6-flash       Fallback 2
//   4. gemini-3.5-flash       Fallback 3
//   5. gemini-3.5-flash-lite  Fallback 4
//   6. gemini-3.1-flash-lite  Fallback 5 (last resort)

import { GoogleGenAI } from "@google/genai";

// ── Model definitions ────────────────────────────────────────────────────────

interface ModelDef {
  id: string;
  displayName: string;
  role: string;
  /** How long (ms) to block a model after a rate-limit hit */
  rateLimitCooldownMs: number;
}

const MODEL_CHAIN: ModelDef[] = [
  { id: "gemini-3.8-flash",      displayName: "Gemini 3.8 Flash",      role: "Primary",    rateLimitCooldownMs: 60_000 },
  { id: "gemini-3.7-flash",      displayName: "Gemini 3.7 Flash",      role: "Fallback 1", rateLimitCooldownMs: 60_000 },
  { id: "gemini-3.6-flash",      displayName: "Gemini 3.6 Flash",      role: "Fallback 2", rateLimitCooldownMs: 60_000 },
  { id: "gemini-3.5-flash",      displayName: "Gemini 3.5 Flash",      role: "Fallback 3", rateLimitCooldownMs: 60_000 },
  { id: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash Lite", role: "Fallback 4", rateLimitCooldownMs: 60_000 },
  { id: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite", role: "Fallback 5", rateLimitCooldownMs: 60_000 },
];

// ── Per-model runtime state (in-process; resets on worker restart) ─────────

interface ModelState {
  /** Epoch ms until which this model must not be tried (rate-limited) */
  blockedUntil: number;
  /** Total 429/503 hits ever */
  rateLimitHits: number;
  /** Total successful completions */
  successCount: number;
  /** Epoch ms of last successful call */
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

function markRateLimited(modelId: string, cooldownMs: number) {
  const state = getState(modelId);
  state.blockedUntil = Date.now() + cooldownMs;
  state.rateLimitHits += 1;
  const def = MODEL_CHAIN.find((m) => m.id === modelId);
  console.warn(
    `[gemini] RATE LIMITED: ${modelId} — blocked for ${cooldownMs / 1000}s (total hits: ${state.rateLimitHits}). ` +
    `Switching to next model instantly.`
  );
  if (def) {
    const nextIdx = MODEL_CHAIN.indexOf(def) + 1;
    if (nextIdx < MODEL_CHAIN.length) {
      console.info(`[gemini] → Next model: ${MODEL_CHAIN[nextIdx].id}`);
    }
  }
}

function markSuccess(modelId: string) {
  const state = getState(modelId);
  state.successCount += 1;
  state.lastUsedAt = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
   * Default: 25_000 ms (25 seconds) — for fast chat fallback.
   * Override to ~120_000 for large background document classification.
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

// ── Sentinel error ─────────────────────────────────────────────────────────

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

// ── Core fallback function ───────────────────────────────────────────────────

/**
 * Calls Gemini with automatic model fallback.
 *
 * Fallback rules:
 *  - RATE LIMIT (429 / RESOURCE_EXHAUSTED): instantly switch to next model,
 *    block the current model for 60 s.
 *  - SERVICE UNAVAILABLE (503 / MODEL_CAPACITY_EXHAUSTED): wait 10 s, retry
 *    SAME model ONCE, then switch if still failing.
 *  - TIMEOUT / NO RESPONSE: instantly switch to next model.
 *  - RESET: once a model's 60 s cooldown expires it is available again and
 *    will be used first if it is the highest-priority unblocked model.
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

  const ai = new GoogleGenAI({ apiKey });
  const timeoutMs = opts.timeoutMs ?? 25_000;

  const rateLimitErrors: string[] = [];
  const otherErrors: string[] = [];

  for (const modelDef of MODEL_CHAIN) {
    // Skip models still in their rate-limit cooldown window
    if (isBlocked(modelDef.id)) {
      const state = getState(modelDef.id);
      const remainingSec = Math.ceil((state.blockedUntil - Date.now()) / 1000);
      rateLimitErrors.push(`${modelDef.id}: cooling down (${remainingSec}s left)`);
      console.info(`[gemini] ⏭ skipping ${modelDef.id} — still rate-limited (${remainingSec}s left)`);
      continue;
    }

    // Each model gets up to 2 attempts: 1 normal + 1 retry only for 503 UNAVAILABLE
    let attempts = 0;
    const maxAttemptsForThisModel = 2;

    while (attempts < maxAttemptsForThisModel) {
      attempts++;
      let timeoutId: NodeJS.Timeout | undefined;

      try {
        console.info(`[gemini] 🔄 trying ${modelDef.id} (attempt ${attempts})`);

        const abortController = new AbortController();
        timeoutId = setTimeout(
          () => abortController.abort(new Error(`Timeout: ${modelDef.id} did not respond within ${timeoutMs / 1000}s`)),
          timeoutMs
        );

        const history = messages.slice(0, -1).map((m) => ({
          role: m.role,
          parts: [{ text: m.content }],
        }));
        const lastMessage = messages[messages.length - 1];

        const messagePayloadParts =
          opts.fileParts && opts.fileParts.length > 0
            ? [...opts.fileParts, { text: lastMessage.content }]
            : [{ text: lastMessage.content }];

        const contents = [...history, { role: "user", parts: messagePayloadParts }];

        const result = await ai.models.generateContent({
          model: modelDef.id,
          contents,
          config: {
            systemInstruction: opts.system,
            temperature: opts.temperature ?? 0.2,
            maxOutputTokens: opts.maxOutputTokens ?? 4096,
            httpOptions: { signal: abortController.signal } as any,
          },
        });

        const text = result.text ?? "";
        const usageMetadata = result.usageMetadata;
        const promptTokens     = usageMetadata?.promptTokenCount     ?? 0;
        const completionTokens = usageMetadata?.candidatesTokenCount ?? 0;
        const tokensUsed       = usageMetadata?.totalTokenCount ?? (promptTokens + completionTokens);

        clearTimeout(timeoutId);
        markSuccess(modelDef.id);
        console.info(
          `[gemini] ✅ ${modelDef.id} OK — ${tokensUsed} tokens (${promptTokens}p + ${completionTokens}c)`
        );

        return {
          text,
          modelUsed: modelDef.id,
          modelDisplayName: modelDef.displayName,
          tokensUsed,
          promptTokens,
          completionTokens,
        };

      } catch (err) {
        clearTimeout(timeoutId);
        const errMsg = err instanceof Error ? err.message : String(err);

        // ── Rate limit: instant switch, no retry on this model ─────────────
        const isRateLimit =
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("rate limit") ||
          errMsg.toLowerCase().includes("quota");

        if (isRateLimit) {
          markRateLimited(modelDef.id, modelDef.rateLimitCooldownMs);
          rateLimitErrors.push(`${modelDef.id}: rate limited`);
          // Break inner while — move to next model immediately
          break;
        }

        // ── Timeout / no response: instant switch ─────────────────────────
        const isTimeout =
          errMsg.includes("Timeout") ||
          errMsg.includes("AbortError") ||
          errMsg.includes("signal");

        if (isTimeout) {
          console.warn(`[gemini] ⏱ ${modelDef.id} timed out — switching to next model instantly`);
          rateLimitErrors.push(`${modelDef.id}: timeout`);
          break;
        }

        // ── Service unavailable: wait 10 s then retry ONCE ────────────────
        const isUnavailable =
          errMsg.includes("503") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("MODEL_CAPACITY_EXHAUSTED");

        if (isUnavailable) {
          if (attempts < maxAttemptsForThisModel) {
            console.warn(
              `[gemini] ⚠ ${modelDef.id} service unavailable — waiting 10 s before retry...`
            );
            await sleep(10_000);
            // Loop again (attempt 2)
            continue;
          } else {
            // Second attempt also failed → switch to next model
            console.warn(`[gemini] ⚠ ${modelDef.id} still unavailable after retry — switching to next model`);
            rateLimitErrors.push(`${modelDef.id}: unavailable (2 attempts)`);
            break;
          }
        }

        // ── Non-retryable error (bad request, auth issue, etc.) ───────────
        console.error(`[gemini] ✗ ${modelDef.id} non-recoverable error:`, errMsg);
        otherErrors.push(`${modelDef.id}: ${errMsg}`);
        break;
      }
    } // end while
  } // end for

  // All models tried.
  // If all failures were rate-limits/timeouts → throw retryable so job re-queues.
  if (rateLimitErrors.length > 0 && otherErrors.length === 0) {
    throw new GeminiRateLimitExhaustedError(`\n${rateLimitErrors.join("\n")}`);
  }

  throw new Error(
    `All Gemini models exhausted.\nRate limits: ${rateLimitErrors.join("; ")}\nOther errors: ${otherErrors.join("; ")}`
  );
}

// ── Model status export (for /api/ai/model-status) ─────────────────────────

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
