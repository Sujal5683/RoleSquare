// GET /api/ai/model-status — returns live Gemini model chain status.
//
// Reads the in-process rate-limit state from gemini.ts and returns
// which models are active vs. cooling down. Used by the AI Studio
// "Model & Cost" tab to show real-time model health.
//
// No authentication required (status is non-sensitive metadata).

import { NextResponse } from "next/server";
import { getModelChainStatus } from "@/lib/gemini";

export async function GET() {
  try {
    const status = getModelChainStatus();
    return NextResponse.json({ models: status, updatedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get model status" },
      { status: 500 }
    );
  }
}
