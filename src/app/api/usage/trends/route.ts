// GET /api/usage/trends — returns detailed usage analytics for charts:
//   - daily AI token consumption for the last 30 days
//   - job type distribution (counts by type)
//   - job status distribution (counts by status)
//   - per-source extraction counts
//   - cost breakdown by metric type
//   - monthly summary (current vs previous month)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Fetch all data in parallel
    const [
      aiJobs,
      aiOutputs,
      currentMonthMetrics,
      prevMonthMetrics,
      sources,
      datasets,
    ] = await Promise.all([
      db.aiJob.findMany({
        where: { organizationId, createdAt: { gte: thirtyDaysAgo } },
        select: {
          id: true,
          type: true,
          status: true,
          progress: true,
          createdAt: true,
          finishedAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      db.aiOutput.findMany({
        where: { job: { organizationId } },
        select: {
          id: true,
          jobId: true,
          modelUsed: true,
          tokensUsed: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      db.usageMetric.findMany({
        where: {
          organizationId,
          periodStart: { gte: startOfMonth },
        },
      }),
      db.usageMetric.findMany({
        where: {
          organizationId,
          periodStart: { gte: startOfPrevMonth, lte: endOfPrevMonth },
        },
      }),
      db.source.count({ where: { organizationId } }),
      db.dataset.count({ where: { organizationId } }),
    ]);

    // ── Daily token consumption (last 30 days) ──────────────────────────
    const dailyTokens: { date: string; tokens: number; cost: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
      const dayOutputs = aiOutputs.filter(
        (o) => o.createdAt >= dayStart && o.createdAt <= dayEnd
      );
      const tokens = dayOutputs.reduce((sum, o) => sum + o.tokensUsed, 0);
      dailyTokens.push({
        date: dayStart.toISOString().split("T")[0],
        tokens,
        cost: tokens * 0.001, // $0.001 per 1K tokens → $1 per 1M tokens
      });
    }

    // ── Job type distribution ────────────────────────────────────────────
    const jobTypeCounts: Record<string, number> = {};
    for (const job of aiJobs) {
      jobTypeCounts[job.type] = (jobTypeCounts[job.type] || 0) + 1;
    }
    const jobTypeData = Object.entries(jobTypeCounts).map(([type, count]) => ({
      type,
      count,
      fill: JOB_TYPE_COLORS[type] || "#94a3b8",
    }));

    // ── Job status distribution ─────────────────────────────────────────
    const jobStatusCounts: Record<string, number> = {};
    for (const job of aiJobs) {
      jobStatusCounts[job.status] = (jobStatusCounts[job.status] || 0) + 1;
    }
    const jobStatusData = Object.entries(jobStatusCounts).map(([status, count]) => ({
      status,
      count,
    }));

    // ── Cost breakdown by metric type (current month) ───────────────────
    const costByMetric = currentMonthMetrics.map((m) => {
      const cost =
        m.metricType === "ai_tokens"
          ? m.value * 0.001
          : m.metricType === "documents_parsed"
          ? m.value * 0.01
          : m.metricType === "exports"
          ? m.value * 0.05
          : 0;
      return {
        metricType: m.metricType,
        value: m.value,
        cost,
      };
    });

    // ── Monthly summary ─────────────────────────────────────────────────
    const currentMonthTokens =
      currentMonthMetrics.find((m) => m.metricType === "ai_tokens")?.value || 0;
    const prevMonthTokens =
      prevMonthMetrics.find((m) => m.metricType === "ai_tokens")?.value || 0;
    const tokenTrend =
      prevMonthTokens > 0
        ? ((currentMonthTokens - prevMonthTokens) / prevMonthTokens) * 100
        : 0;

    const currentMonthEmails =
      currentMonthMetrics.find((m) => m.metricType === "emails_scanned")?.value || 0;
    const prevMonthEmails =
      prevMonthMetrics.find((m) => m.metricType === "emails_scanned")?.value || 0;
    const emailTrend =
      prevMonthEmails > 0
        ? ((currentMonthEmails - prevMonthEmails) / prevMonthEmails) * 100
        : 0;

    // ── Model usage breakdown ───────────────────────────────────────────
    const modelCounts: Record<string, { tokens: number; calls: number }> = {};
    for (const o of aiOutputs) {
      if (!modelCounts[o.modelUsed]) {
        modelCounts[o.modelUsed] = { tokens: 0, calls: 0 };
      }
      modelCounts[o.modelUsed].tokens += o.tokensUsed;
      modelCounts[o.modelUsed].calls += 1;
    }
    const modelUsage = Object.entries(modelCounts).map(([model, data]) => ({
      model,
      tokens: data.tokens,
      calls: data.calls,
      cost: data.tokens * 0.001,
    }));

    // ── Quota calculation ───────────────────────────────────────────────
    // Assume team plan = 100,000 tokens/month, free = 1,000, enterprise = 1,000,000
    const quotaMap: Record<string, number> = {
      free: 1_000,
      team: 100_000,
      enterprise: 1_000_000,
    };
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });
    const quota = quotaMap[org?.plan || "free"] || 1_000;
    const quotaUsed = Math.min(currentMonthTokens, quota);
    const quotaPercent = quota > 0 ? (quotaUsed / quota) * 100 : 0;

    return NextResponse.json({
      dailyTokens,
      jobTypeData,
      jobStatusData,
      costByMetric,
      modelUsage,
      monthlySummary: {
        currentMonthTokens,
        prevMonthTokens,
        tokenTrend,
        currentMonthEmails,
        prevMonthEmails,
        emailTrend,
        currentMonthCost: currentMonthTokens * 0.001,
        prevMonthCost: prevMonthTokens * 0.001,
        costTrend:
          prevMonthTokens > 0
            ? ((currentMonthTokens - prevMonthTokens) / prevMonthTokens) * 100
            : 0,
      },
      quota: {
        plan: org?.plan || "free",
        limit: quota,
        used: quotaUsed,
        remaining: Math.max(0, quota - currentMonthTokens),
        percent: quotaPercent,
      },
      counts: {
        sources,
        datasets,
        totalJobs: aiJobs.length,
        totalOutputs: aiOutputs.length,
        totalTokens: aiOutputs.reduce((s, o) => s + o.tokensUsed, 0),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load usage trends" },
      { status: 500 }
    );
  }
}

const JOB_TYPE_COLORS: Record<string, string> = {
  GMAIL_SCAN: "#38bdf8",
  EMAIL_PARSE: "#22d3ee",
  ATTACHMENT_PROCESS: "#2dd4bf",
  DRIVE_DISCOVERY: "#34d399",
  DOCUMENT_PARSE: "#fbbf24",
  AI_EXTRACTION: "#a78bfa",
  AI_VALIDATION: "#e879f9",
  EXPORT: "#fb7185",
};
