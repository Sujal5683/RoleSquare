// RoleSquare — Model Pricing
//
// Static pricing table for all supported Gemini model families.
// Used by job-runner.ts (at AiOutput write time) and by the AI Studio cost tab.
// Prices are in USD per 1K tokens.

export interface ModelPricing {
  /** Cost per 1K prompt (input) tokens */
  promptCostPer1k: number;
  /** Cost per 1K completion (output) tokens */
  completionCostPer1k: number;
  /** Human-readable display name */
  displayName: string;
}

/** Pricing map keyed by the exact model string returned by the Gemini API.
 *  These are the exact same 6 models used in callGeminiWithFallback() (gemini.ts),
 *  in the same priority order: 3.8 → 3.7 → 3.6 → 3.5 → 3.5-lite → 3.1-lite
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gemini-3.8-flash": {
    displayName: "Gemini 3.8 Flash",
    promptCostPer1k: 0.0003,
    completionCostPer1k: 0.001,
  },
  "gemini-3.7-flash": {
    displayName: "Gemini 3.7 Flash",
    promptCostPer1k: 0.0003,
    completionCostPer1k: 0.001,
  },
  "gemini-3.6-flash": {
    displayName: "Gemini 3.6 Flash",
    promptCostPer1k: 0.0003,
    completionCostPer1k: 0.001,
  },
  "gemini-3.5-flash": {
    displayName: "Gemini 3.5 Flash",
    promptCostPer1k: 0.0003,
    completionCostPer1k: 0.001,
  },
  "gemini-3.5-flash-lite": {
    displayName: "Gemini 3.5 Flash Lite",
    promptCostPer1k: 0.0001,
    completionCostPer1k: 0.0004,
  },
  "gemini-3.1-flash-lite": {
    displayName: "Gemini 3.1 Flash Lite",
    promptCostPer1k: 0.0001,
    completionCostPer1k: 0.0004,
  },
};

/** Fallback pricing when the model isn't in the table */
export const DEFAULT_PRICING: ModelPricing = {
  displayName: "Unknown Model",
  promptCostPer1k: 0.001,
  completionCostPer1k: 0.003,
};

/**
 * Computes the USD cost for a given model and token counts.
 * Uses standard pricing: $1 per 1,000,000 tokens for all models.
 */
export function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const totalTokens = promptTokens + completionTokens;
  return (totalTokens / 1_000_000) * 1.0;
}

/**
 * Returns the human-readable display name for a model string.
 * Handles special cases like "none", "deterministic", and "manual"
 * which are set by the system and should never show as raw strings.
 */
export function modelDisplayName(model: string): string {
  if (!model || model === "none" || model === "unknown") return "No Model";
  if (model === "deterministic") return "Deterministic Parser";
  if (model === "manual") return "Manual Import";

  // Check the pricing table first
  if (MODEL_PRICING[model]) return MODEL_PRICING[model].displayName;

  // Fallback: parse the model string into a readable name
  // e.g. "gemini-3.7-flash-exp" → "Gemini 3.7 Flash (Exp)"
  return model
    .replace(/^gemini-/, "Gemini ")
    .replace(/-exp$/, " (Exp)")
    .replace(/-preview$/, " (Preview)")
    .replace(/-latest$/, " (Latest)")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
}

/**
 * Returns all known model keys with their pricing.
 */
export function getAllModelPricing(): Array<{ model: string } & ModelPricing> {
  return Object.entries(MODEL_PRICING).map(([model, pricing]) => ({
    model,
    ...pricing,
  }));
}
