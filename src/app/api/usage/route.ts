// GET /api/usage — usage metrics + real AI cost breakdown for this org.
//
// Returns:
//   metrics    — UsageMetric rows (emails_scanned, ai_tokens, etc.)
//   aiCost     — per-model cost aggregated from real AiOutput rows
//   totalCostUsd — sum of all AiOutput.costUsd in the period


export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { currentMonthUsage } from "@/lib/usage";
import { serializeUsageMetric } from "@/lib/serialize";
import { modelDisplayName } from "@/lib/model-pricing";

export async function GET(req: NextRequest) {
  try {
    const { organizationId, user } = await requireOrgContext(req);

    // Period: first day of current month to now
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [metrics, aiOutputRows] = await Promise.all([
      db.usageMetric.findMany({
        where: {
          organizationId,
          periodStart: { gte: periodStart },
        },
      }),
      db.aiOutput.findMany({
        where: {
          job: { userId: user.id },
          createdAt: { gte: periodStart },
        },
        select: {
          modelUsed: true,
          tokensUsed: true,
          promptTokens: true,
          completionTokens: true,
          costUsd: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Aggregate per-model stats
    const modelMap = new Map<string, {
      model: string;
      displayName: string;
      promptTokens: number;
      completionTokens: number;
      tokensUsed: number;
      totalCostUsd: number;
      calls: number;
    }>();

    for (const row of aiOutputRows) {
      const key = row.modelUsed;
      if (!modelMap.has(key)) {
        modelMap.set(key, {
          model: key,
          displayName: modelDisplayName(key),
          promptTokens: 0,
          completionTokens: 0,
          tokensUsed: 0,
          totalCostUsd: 0,
          calls: 0,
        });
      }
      const entry = modelMap.get(key)!;
      entry.promptTokens += row.promptTokens;
      entry.completionTokens += row.completionTokens;
      entry.tokensUsed += row.tokensUsed;
      entry.totalCostUsd += row.costUsd;
      entry.calls += 1;
    }

    // Daily cost breakdown for charting
    const dailyCostMap = new Map<string, number>();
    for (const row of aiOutputRows) {
      const day = row.createdAt.toISOString().slice(0, 10);
      dailyCostMap.set(day, (dailyCostMap.get(day) ?? 0) + row.costUsd);
    }

    const totalCostUsd = aiOutputRows.reduce((sum, r) => sum + r.costUsd, 0);

    return NextResponse.json({
      metrics: metrics.map(serializeUsageMetric),
      aiCost: {
        perModel: Array.from(modelMap.values()),
        dailyCost: Array.from(dailyCostMap.entries())
          .map(([date, costUsd]) => ({ date, costUsd }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        totalCostUsd,
        totalPromptTokens: Array.from(modelMap.values()).reduce((s, m) => s + m.promptTokens, 0),
        totalCompletionTokens: Array.from(modelMap.values()).reduce((s, m) => s + m.completionTokens, 0),
        totalCalls: Array.from(modelMap.values()).reduce((s, m) => s + m.calls, 0),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load usage" },
      { status: 500 }
    );
  }
}
