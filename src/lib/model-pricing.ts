// Workspace Intelligence Platform — Model Pricing
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

/** Pricing map keyed by the exact model string returned by the Gemini API */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gemini-1.5-pro": {
    displayName: "Gemini 1.5 Pro",
    promptCostPer1k: 0.00125,
    completionCostPer1k: 0.005,
  },
  "gemini-1.5-pro-latest": {
    displayName: "Gemini 1.5 Pro (Latest)",
    promptCostPer1k: 0.00125,
    completionCostPer1k: 0.005,
  },
  "gemini-1.5-flash": {
    displayName: "Gemini 1.5 Flash",
    promptCostPer1k: 0.000075,
    completionCostPer1k: 0.0003,
  },
  "gemini-1.5-flash-latest": {
    displayName: "Gemini 1.5 Flash (Latest)",
    promptCostPer1k: 0.000075,
    completionCostPer1k: 0.0003,
  },
  "gemini-2.0-flash": {
    displayName: "Gemini 2.0 Flash",
    promptCostPer1k: 0.0001,
    completionCostPer1k: 0.0004,
  },
  "gemini-2.0-flash-exp": {
    displayName: "Gemini 2.0 Flash (Exp)",
    promptCostPer1k: 0.0001,
    completionCostPer1k: 0.0004,
  },
  "gemini-2.5-pro": {
    displayName: "Gemini 2.5 Pro",
    promptCostPer1k: 0.00125,
    completionCostPer1k: 0.01,
  },
  "gemini-2.5-flash": {
    displayName: "Gemini 2.5 Flash",
    promptCostPer1k: 0.0003,
    completionCostPer1k: 0.0025,
  },
  "gemini-2.5-pro-preview": {
    displayName: "Gemini 2.5 Pro Preview",
    promptCostPer1k: 0.00125,
    completionCostPer1k: 0.01,
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
 * Falls back to DEFAULT_PRICING if the model is unknown.
 */
export function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const promptCost = (promptTokens / 1000) * pricing.promptCostPer1k;
  const completionCost = (completionTokens / 1000) * pricing.completionCostPer1k;
  return promptCost + completionCost;
}

/**
 * Returns the display name for a model string.
 */
export function modelDisplayName(model: string): string {
  return MODEL_PRICING[model]?.displayName ?? model;
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
