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
import { PLANS } from "@/lib/plans";

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
          costUsd: true,
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
      const cost = dayOutputs.reduce((sum, o) => sum + (o.costUsd || 0), 0);
      dailyTokens.push({
        date: dayStart.toISOString().split("T")[0],
        tokens,
        cost,
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
    const currentMonthAiOutputs = aiOutputs.filter(o => o.createdAt >= startOfMonth);
    const aiTokensCost = currentMonthAiOutputs.reduce((sum, o) => sum + (o.costUsd || 0), 0);

    const costByMetric = currentMonthMetrics.map((m) => {
      const cost =
        m.metricType === "ai_tokens"
          ? aiTokensCost
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
    const currentMonthTokens = currentMonthAiOutputs.reduce((sum, o) => sum + o.tokensUsed, 0);
    const prevMonthAiOutputs = aiOutputs.filter(o => o.createdAt >= startOfPrevMonth && o.createdAt <= endOfPrevMonth);
    const prevMonthTokens = prevMonthAiOutputs.reduce((sum, o) => sum + o.tokensUsed, 0);
    const tokenTrend =
      prevMonthTokens > 0
        ? ((currentMonthTokens - prevMonthTokens) / prevMonthTokens) * 100
        : 0;
    
    const prevMonthAiCost = prevMonthAiOutputs.reduce((sum, o) => sum + (o.costUsd || 0), 0);

    const currentMonthEmails =
      currentMonthMetrics.find((m) => m.metricType === "emails_scanned")?.value || 0;
    const prevMonthEmails =
      prevMonthMetrics.find((m) => m.metricType === "emails_scanned")?.value || 0;
    const emailTrend =
      prevMonthEmails > 0
        ? ((currentMonthEmails - prevMonthEmails) / prevMonthEmails) * 100
        : 0;

    // ── Model usage breakdown ───────────────────────────────────────────
    const modelCounts: Record<string, { tokens: number; calls: number; cost: number }> = {};
    for (const o of aiOutputs) {
      if (!modelCounts[o.modelUsed]) {
        modelCounts[o.modelUsed] = { tokens: 0, calls: 0, cost: 0 };
      }
      modelCounts[o.modelUsed].tokens += o.tokensUsed;
      modelCounts[o.modelUsed].calls += 1;
      modelCounts[o.modelUsed].cost += (o.costUsd || 0);
    }
    const modelUsage = Object.entries(modelCounts).map(([model, data]) => ({
      model,
      tokens: data.tokens,
      calls: data.calls,
      cost: data.cost,
    }));

    // ── Quota calculation ───────────────────────────────────────────────
    // Fetch the user's individual plan
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { plan: true },
    });
    
    const userPlan = dbUser?.plan || "free";
    const limits = (PLANS[userPlan] || PLANS.free).limits;

    // We can count total records extracted this month for the user
    // Wait, datasets might be tied to organization, but let's count user's jobs or usage if possible.
    // The user said "keep these as users individual plans/limits". We can count usage by the user.
    // For now, if we count by org, we still apply user plan limits. Let's count records created by this user.
    const currentMonthRecords = await db.datasetRecord.count({
      where: { dataset: { createdBy: user.id }, createdAt: { gte: startOfMonth } }
    });
    
    // Count jobs created by this user
    const userJobs = await db.aiJob.findMany({
        where: { userId: user.id, createdAt: { gte: startOfMonth } },
        select: { id: true }
    });
    const currentMonthJobs = userJobs.length;

    // Count tokens used by this user's jobs
    const userOutputs = await db.aiOutput.findMany({
        where: { job: { userId: user.id }, createdAt: { gte: startOfMonth } },
        select: { tokensUsed: true }
    });
    const currentMonthUserTokens = userOutputs.reduce((sum, o) => sum + o.tokensUsed, 0);

    const quotas = [
      {
        id: "tokens",
        name: "AI Tokens",
        limit: limits.maxAiTokensPerMonth,
        used: currentMonthUserTokens,
        remaining: limits.maxAiTokensPerMonth === -1 ? -1 : Math.max(0, limits.maxAiTokensPerMonth - currentMonthUserTokens),
        percent: limits.maxAiTokensPerMonth === -1 ? 0 : (limits.maxAiTokensPerMonth > 0 ? Math.min(100, (currentMonthUserTokens / limits.maxAiTokensPerMonth) * 100) : 0),
      },
      {
        id: "jobs",
        name: "AI Jobs",
        limit: limits.maxAiJobsPerMonth,
        used: currentMonthJobs,
        remaining: limits.maxAiJobsPerMonth === -1 ? -1 : Math.max(0, limits.maxAiJobsPerMonth - currentMonthJobs),
        percent: limits.maxAiJobsPerMonth === -1 ? 0 : (limits.maxAiJobsPerMonth > 0 ? Math.min(100, (currentMonthJobs / limits.maxAiJobsPerMonth) * 100) : 0),
      },
      {
        id: "records",
        name: "Records Extracted",
        limit: limits.maxRecordsPerMonth,
        used: currentMonthRecords,
        remaining: limits.maxRecordsPerMonth === -1 ? -1 : Math.max(0, limits.maxRecordsPerMonth - currentMonthRecords),
        percent: limits.maxRecordsPerMonth === -1 ? 0 : (limits.maxRecordsPerMonth > 0 ? Math.min(100, (currentMonthRecords / limits.maxRecordsPerMonth) * 100) : 0),
      }
    ];

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
        currentMonthCost: aiTokensCost,
        prevMonthCost: prevMonthAiCost,
        costTrend:
          prevMonthAiCost > 0
            ? ((aiTokensCost - prevMonthAiCost) / prevMonthAiCost) * 100
            : 0,
      },
      quota: { // legacy support for older components
        plan: userPlan,
        limit: limits.maxAiTokensPerMonth,
        used: Math.min(currentMonthUserTokens, limits.maxAiTokensPerMonth === -1 ? currentMonthUserTokens : limits.maxAiTokensPerMonth),
        remaining: limits.maxAiTokensPerMonth === -1 ? -1 : Math.max(0, limits.maxAiTokensPerMonth - currentMonthUserTokens),
        percent: limits.maxAiTokensPerMonth === -1 ? 0 : (limits.maxAiTokensPerMonth > 0 ? (currentMonthUserTokens / limits.maxAiTokensPerMonth) * 100 : 0),
      },
      quotas,
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
