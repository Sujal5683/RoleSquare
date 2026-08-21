// GET /api/health — operational diagnostics endpoint.
//
// Returns the health status of all platform subsystems:
//   - Database connectivity + table counts
//   - Job runner status (running, queued, failed counts)
//   - Stale job detection (jobs running >10 minutes)
//   - Google connection health (active/degraded/expired counts)
//   - AI quota utilization
//   - Webhook delivery health
//
// This endpoint does NOT require authentication — it's designed for
// uptime monitoring and operational dashboards. It returns a 503 status
// if any critical subsystem is unhealthy.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentMonthUsage } from "@/lib/usage";

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { status: "healthy" | "degraded" | "unhealthy"; message: string; data?: unknown }> = {};

  try {
    // ── Database check ────────────────────────────────────────────────
    try {
      await db.$queryRawUnsafe("SELECT 1");
      const userCount = await db.user.count();
      const orgCount = await db.organization.count();
      checks.database = {
        status: "healthy",
        message: "Database connected",
        data: { users: userCount, organizations: orgCount },
      };
    } catch (err) {
      checks.database = {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Database connection failed",
      };
    }

    // ── Job runner check ──────────────────────────────────────────────
    try {
      const [queued, running, failed, dlq] = await Promise.all([
        db.aiJob.count({ where: { status: "queued" } }),
        db.aiJob.count({ where: { status: "running" } }),
        db.aiJob.count({ where: { status: "failed" } }),
        db.aiJob.count({ where: { status: "dlq" } }),
      ]);

      // Check for stale jobs (running >10 minutes)
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
      const staleCount = await db.aiJob.count({
        where: {
          status: "running",
          startedAt: { lt: staleThreshold },
        },
      });

      const jobStatus =
        staleCount > 0
          ? "degraded"
          : dlq > 5
          ? "degraded"
          : "healthy";

      checks.jobs = {
        status: jobStatus,
        message:
          staleCount > 0
            ? `${staleCount} stale job(s) detected`
            : dlq > 5
            ? `${dlq} jobs in dead-letter queue`
            : "Job runner operational",
        data: { queued, running, failed, dlq, stale: staleCount },
      };
    } catch (err) {
      checks.jobs = {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Job check failed",
      };
    }

    // ── Google connections check ──────────────────────────────────────
    try {
      const [active, degraded, expired, revoked] = await Promise.all([
        db.googleConnection.count({ where: { status: "active" } }),
        db.googleConnection.count({ where: { status: "degraded" } }),
        db.googleConnection.count({ where: { status: "expired" } }),
        db.googleConnection.count({ where: { status: "revoked" } }),
      ]);

      // Check for watches expiring soon
      const watchThreshold = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const expiringSoon = await db.googleConnection.count({
        where: {
          status: "active",
          watchExpiresAt: { lte: watchThreshold },
        },
      });

      checks.connections = {
        status: expired > 0 || revoked > 0 ? "degraded" : "healthy",
        message:
          expiringSoon > 0
            ? `${expiringSoon} connection(s) with watch expiring soon`
            : expired > 0
            ? `${expired} expired connection(s)`
            : "All connections healthy",
        data: { active, degraded, expired, revoked, expiringSoon },
      };
    } catch (err) {
      checks.connections = {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Connection check failed",
      };
    }

    // ── Usage / quota check ───────────────────────────────────────────
    try {
      const firstOrg = await db.organization.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, plan: true },
      });
      if (firstOrg) {
        const metrics = await currentMonthUsage(firstOrg.id);
        const aiTokens = metrics.find((m) => m.metricType === "ai_tokens")?.value || 0;
        const quotaMap: Record<string, number> = {
          free: 1_000,
          team: 100_000,
          enterprise: 1_000_000,
        };
        const quota = quotaMap[firstOrg.plan] || 1_000;
        const percent = quota > 0 ? (aiTokens / quota) * 100 : 0;

        checks.quota = {
          status: percent > 90 ? "degraded" : "healthy",
          message:
            percent > 90
              ? `AI quota at ${percent.toFixed(1)}% — approaching limit`
              : `AI quota at ${percent.toFixed(1)}%`,
          data: { used: aiTokens, quota, percent: Math.round(percent * 10) / 10, plan: firstOrg.plan },
        };
      } else {
        checks.quota = { status: "healthy", message: "No organizations" };
      }
    } catch (err) {
      checks.quota = {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Quota check failed",
      };
    }

    // ── Webhook health check ──────────────────────────────────────────
    try {
      const [activeWebhooks, failingWebhooks] = await Promise.all([
        db.webhook.count({ where: { status: "active" } }),
        db.webhook.count({ where: { status: "failing" } }),
      ]);

      checks.webhooks = {
        status: failingWebhooks > 0 ? "degraded" : "healthy",
        message:
          failingWebhooks > 0
            ? `${failingWebhooks} webhook(s) failing`
            : `${activeWebhooks} active webhook(s)`,
        data: { active: activeWebhooks, failing: failingWebhooks },
      };
    } catch (err) {
      checks.webhooks = {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Webhook check failed",
      };
    }

    // ── Overall status ────────────────────────────────────────────────
    const hasUnhealthy = Object.values(checks).some((c) => c.status === "unhealthy");
    const hasDegraded = Object.values(checks).some((c) => c.status === "degraded");
    const overall = hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy";
    const httpStatus = hasUnhealthy ? 503 : 200;

    return NextResponse.json(
      {
        status: overall,
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
        checks,
      },
      { status: httpStatus }
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : "Health check failed",
        checks,
      },
      { status: 503 }
    );
  }
}
