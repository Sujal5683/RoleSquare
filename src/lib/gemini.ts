// RoleSquare — Gemini Fallback Client
//
// Provides callGeminiWithFallback() — a drop-in replacement for the
// z-ai-web-dev-sdk wrapper. Calls the Google Generative AI API directly,
// cycling through a priority chain of 5 Gemini models.
//
// Fallback strategy:
//   - Models are tried in order (fastest/cheapest first).
//   - When a model returns HTTP 429 / RESOURCE_EXHAUSTED, it is marked
//     "blocked" with a cooldown timestamp. The next model in the chain is
//     tried immediately.
//   - After the cooldown window the model becomes eligible again.
//   - We do NOT pre-count requests — real API errors drive the fallback.
//     This avoids hardcoding rate-limit numbers and ensures we always use
//     the most capable available model.
//
// Model chain (priority order):
//   1. gemini-3.7-flash          — 5 RPM / 20 RPD
//   2. gemini-3.6-flash          — 5 RPM / 20 RPD
//   3. gemini-3.5-flash          — 5 RPM / 20 RPD
//   4. gemini-3.5-flash-lite     — 15 RPM / 500 RPD
//   5. gemini-3.1-flash-lite     — 15 RPM / 500 RPD

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// ── Model definitions ────────────────────────────────────────────────────────

interface ModelDef {
  /** Google Generative AI model identifier */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Role label shown in the UI */
  role: string;
  /** RPM cooldown in ms (60 s = 1 min window) */
  rpmCooldownMs: number;
}

const MODEL_CHAIN: ModelDef[] = [
  {
    id: "gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash",
    role: "Primary",
    rpmCooldownMs: 60_000,
  },
  {
    id: "gemini-3.6-flash",
    displayName: "Gemini 3.6 Flash",
    role: "Fallback 1",
    rpmCooldownMs: 60_000,
  },
  {
    id: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    role: "Fallback 2",
    rpmCooldownMs: 60_000,
  },
  {
    id: "gemini-3.5-flash-lite",
    displayName: "Gemini 3.5 Flash Lite",
    role: "Fallback 3",
    rpmCooldownMs: 60_000,
  },
  {
    id: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash Lite",
    role: "Fallback 4",
    rpmCooldownMs: 60_000,
  },
];

// ── Rate-limit state (in-process, resets on server restart) ─────────────────

interface ModelState {
  /** Unix timestamp (ms) until which this model is blocked. 0 = not blocked. */
  blockedUntil: number;
  /** Total 429 hits recorded. */
  rateLimitHits: number;
  /** Total successful calls. */
  successCount: number;
  /** Last model used for a successful call (undefined if never called). */
  lastUsedAt: number | null;
}

// Keyed by model ID
const modelState = new Map<string, ModelState>(
  MODEL_CHAIN.map((m) => [
    m.id,
    { blockedUntil: 0, rateLimitHits: 0, successCount: 0, lastUsedAt: null },
  ])
);

function getState(modelId: string): ModelState {
  if (!modelState.has(modelId)) {
    modelState.set(modelId, {
      blockedUntil: 0,
      rateLimitHits: 0,
      successCount: 0,
      lastUsedAt: null,
    });
  }
  return modelState.get(modelId)!;
}

function isBlocked(modelId: string): boolean {
  const state = getState(modelId);
  return state.blockedUntil > Date.now();
}

function markBlocked(modelId: string, cooldownMs: number) {
  const state = getState(modelId);
  state.blockedUntil = Date.now() + cooldownMs;
  state.rateLimitHits += 1;
  console.warn(
    `[gemini] model ${modelId} rate-limited. Cooling down for ${cooldownMs / 1000}s ` +
      `(total hits: ${state.rateLimitHits})`
  );
}

function markSuccess(modelId: string) {
  const state = getState(modelId);
  state.successCount += 1;
  state.lastUsedAt = Date.now();
}

// ── Type helpers ─────────────────────────────────────────────────────────────

export interface GeminiMessage {
  role: "user" | "model";
  content: string;
}

export interface GeminiCallOptions {
  /** System instruction (prepended to the conversation). */
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiResult {
  text: string;
  modelUsed: string;
  modelDisplayName: string;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
}

// ── Core call with fallback ──────────────────────────────────────────────────

/**
 * Calls the Gemini API with automatic model fallback.
 *
 * Tries each model in the chain in priority order. If a model is currently
 * rate-limited (blocked), it is skipped. If a model returns 429, it is
 * marked as blocked and the next model is tried immediately.
 *
 * Throws if all models are exhausted.
 */
export async function callGeminiWithFallback(
  messages: GeminiMessage[],
  opts: GeminiCallOptions = {}
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in environment variables."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const errors: string[] = [];

  for (const modelDef of MODEL_CHAIN) {
    // Skip if currently blocked
    if (isBlocked(modelDef.id)) {
      const state = getState(modelDef.id);
      const remainingSec = Math.ceil((state.blockedUntil - Date.now()) / 1000);
      errors.push(`${modelDef.id}: rate-limited (${remainingSec}s remaining)`);
      console.info(`[gemini] skipping ${modelDef.id} — still cooling down`);
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
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      });

      // Build history (all messages except the last user message)
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));
      const lastMessage = messages[messages.length - 1];

      const chat = model.startChat({ history });
      
      const result = await Promise.race([
        chat.sendMessage(lastMessage.content),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout: model did not respond within 30s")), 30000)
        ),
      ]);
      const response = result.response;

      const text = response.text();
      const usageMetadata = response.usageMetadata;
      const promptTokens = usageMetadata?.promptTokenCount ?? 0;
      const completionTokens = usageMetadata?.candidatesTokenCount ?? 0;
      const tokensUsed = promptTokens + completionTokens;

      markSuccess(modelDef.id);
      console.info(
        `[gemini] ${modelDef.id} succeeded — ${tokensUsed} tokens used (${promptTokens} prompt, ${completionTokens} completion)`
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
      const errMsg =
        err instanceof Error ? err.message : String(err);
      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("rate limit") ||
        errMsg.toLowerCase().includes("quota");

      if (isRateLimit) {
        markBlocked(modelDef.id, modelDef.rpmCooldownMs);
        errors.push(`${modelDef.id}: rate limited — ${errMsg}`);
        // Continue to next model
        continue;
      }

      // Non-rate-limit error — still try the next model but log it
      console.error(`[gemini] ${modelDef.id} non-rate-limit error:`, errMsg);
      errors.push(`${modelDef.id}: ${errMsg}`);
      continue;
    }
  }

  throw new Error(
    `All Gemini models exhausted. Errors:\n${errors.join("\n")}`
  );
}

// ── Model status export (for /api/ai/model-status) ──────────────────────────

export interface ModelStatus {
  modelId: string;
  displayName: string;
  role: string;
  /** "active" | "rate_limited" */
  status: "active" | "rate_limited";
  /** ISO timestamp when the cooldown ends, or null if active */
  cooldownUntil: string | null;
  /** Seconds remaining in cooldown, or 0 if active */
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
      cooldownUntil: blocked
        ? new Date(state.blockedUntil).toISOString()
        : null,
      cooldownRemainingSeconds: Math.ceil(remainingMs / 1000),
      rateLimitHits: state.rateLimitHits,
      successCount: state.successCount,
      lastUsedAt: state.lastUsedAt
        ? new Date(state.lastUsedAt).toISOString()
        : null,
    };
  });
}
