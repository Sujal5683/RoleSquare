// GET /api/dashboard — aggregates the data needed by the dashboard view:
//   - KPIs (connected accounts, active sources, records extracted,
//     review queue depth, running AI jobs, failed AI jobs)
//   - recentRuns (last 6 source runs with source name)
//   - reviewQueue (records with status=needs_review, include values+fields)
//   - recentDatasets (last 5)
//   - queueHealth (group ai_jobs by type+status)
//   - usageMetrics (current month)
//   - connectionAlerts (connections with status != active OR watchExpiresAt
//     within 2 days)

// Always fetch fresh — dashboard KPIs change frequently and must not be edge-cached
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { currentMonthUsage } from "@/lib/usage";
import {
  attachFieldsToRecords,
  fieldsByIdMap,
  serializeDataset,
  serializeDatasetRecord,
  serializeGoogleConnection,
  serializeSourceRun,
  serializeUsageMetric,
  serializeSharingRequest,
} from "@/lib/serialize";
import type { DashboardData } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);

    const url = new URL(req.url);
    const dateRangeParam = url.searchParams.get("dateRange") || "30d";
    const rangeDays = parseInt(dateRangeParam.replace("d", ""), 10) || 30;
    const rangeAgo = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const [
      connectedAccounts,
      activeSources,
      reviewQueueCount,
      aiJobsRunning,
      aiJobsFailed,
      recentRunsRaw,
      reviewQueueRaw,
      recentDatasetsRaw,
      queueHealthRaw,
      usageRaw,
      connectionAlertsRaw,
      pendingRequestsRaw,
      recordsExtracted,
      recentRecords,
      recentJobs,
    ] = await Promise.all([
      db.googleConnection.count({ where: { organizationId } }),
      db.source.count({ where: { organizationId, status: "active" } }),
      db.datasetRecord.count({
        where: { dataset: { organizationId }, status: "needs_review" },
      }),
      db.aiJob.count({
        where: { organizationId, status: { in: ["queued", "running"] } },
      }),
      db.aiJob.count({
        where: { organizationId, status: { in: ["failed", "dlq"] } },
      }),
      db.sourceRun.findMany({
        take: 6,
        orderBy: { startedAt: "desc" },
        where: { source: { organizationId } },
        include: { source: { select: { id: true, name: true } } },
      }),
      // Include schema fields inline (via schemaFields global fetch) so we can
      // enrich review queue records without a separate per-record query.
      db.datasetRecord.findMany({
        take: 10,
        orderBy: { updatedAt: "desc" },
        where: { status: "needs_review", dataset: { organizationId } },
        include: {
          values: true,
          dataset: { select: { id: true, name: true, schemaId: true } },
        },
      }),
      db.dataset.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        where: { organizationId },
        include: { schema: { select: { id: true, name: true, version: true } } },
      }),
      db.aiJob.groupBy({
        by: ["type", "status"],
        where: { organizationId },
        _count: { _all: true },
      }),
      currentMonthUsage(organizationId),
      db.googleConnection.findMany({
        where: {
          organizationId,
          OR: [
            { status: { not: "active" } },
            { watchExpiresAt: { lte: new Date(Date.now() + 2 * 86400_000) } },
          ],
        },
      }),
      db.sharingRequest.findMany({
        where: {
          status: "pending",
          OR: [
            { targetOrganizationId: organizationId },
            { targetUserId: user.id },
            { targetEmail: user.email },
          ],
        },
        include: {
          dataset: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true, email: true } },
        },
      }),
      db.datasetRecord.count({ where: { dataset: { organizationId } } }),
      db.$queryRaw<{date: string, count: bigint}[]>`
        SELECT DATE("createdAt")::text as date, COUNT(*) as count 
        FROM "DatasetRecord" 
        WHERE "datasetId" IN (SELECT id FROM "Dataset" WHERE "organizationId" = ${organizationId})
        AND "createdAt" >= ${rangeAgo}
        GROUP BY DATE("createdAt")
      `,
      db.$queryRaw<{date: string, count: bigint}[]>`
        SELECT DATE("createdAt")::text as date, COUNT(*) as count 
        FROM "AiJob" 
        WHERE "organizationId" = ${organizationId}
        AND "createdAt" >= ${rangeAgo}
        GROUP BY DATE("createdAt")
      `,
    ]);

    // Fetch schema fields only for the schemas used by the review queue
    const schemaIds = Array.from(new Set(reviewQueueRaw.map(r => r.dataset.schemaId).filter(Boolean))) as string[];
    const schemaFields = schemaIds.length > 0 
      ? await db.schemaField.findMany({ where: { schemaId: { in: schemaIds } } })
      : [];

    const fieldsMap = fieldsByIdMap(schemaFields);
    const reviewQueueEnriched = attachFieldsToRecords(reviewQueueRaw, fieldsMap);

    // Group by date string (YYYY-MM-DD)
    const chartDataMap = new Map<
      string,
      { date: string; records: number; jobs: number }
    >();

    // Initialize map with range days
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      chartDataMap.set(dateStr, { date: dateStr, records: 0, jobs: 0 });
    }

    for (const r of recentRecords) {
      if (chartDataMap.has(r.date)) {
        chartDataMap.get(r.date)!.records += Number(r.count);
      }
    }

    for (const j of recentJobs) {
      if (chartDataMap.has(j.date)) {
        chartDataMap.get(j.date)!.jobs += Number(j.count);
      }
    }

    const chartData = Array.from(chartDataMap.values());

    const data: DashboardData & { chartData: any[] } = {
      kpis: {
        connectedAccounts,
        activeSources,
        recordsExtracted,
        reviewQueue: reviewQueueCount,
        aiJobsRunning,
        aiJobsFailed,
      },
      recentRuns: recentRunsRaw.map((r) => ({
        ...serializeSourceRun(r),
        sourceName: r.source?.name ?? null,
      })) as any,
      reviewQueue: reviewQueueEnriched.map((r) => ({
        ...serializeDatasetRecord(r),
        dataset: r.dataset,
      })) as any,
      recentDatasets: recentDatasetsRaw.map(serializeDataset),
      queueHealth: queueHealthRaw.map((g) => ({
        type: g.type,
        status: g.status,
        count: g._count._all,
      })),
      usageMetrics: usageRaw.map(serializeUsageMetric),
      connectionAlerts: connectionAlertsRaw.map(serializeGoogleConnection),
      pendingSharingRequests: pendingRequestsRaw.map(serializeSharingRequest),
      chartData,
    };

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
