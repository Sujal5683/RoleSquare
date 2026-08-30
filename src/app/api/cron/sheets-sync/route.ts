// GET /api/cron/sheets-sync
//
// Automatic sync trigger — called by Vercel Cron (or any external cron service)
// on a 1-minute cadence. The route itself gates execution by checking
// `SyncState.nextSyncAt`, so running every minute is lightweight and correct.
//
// Security: requires a secret Authorization header to prevent unauthorized calls.
// Set CRON_SECRET in environment variables and pass it as:
//   Authorization: Bearer <CRON_SECRET>
//
// Vercel Cron config in vercel.json:
//   { "crons": [{ "path": "/api/cron/sheets-sync", "schedule": "* * * * *" }] }
//
// Vercel automatically adds the Authorization header when invoking cron routes.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runSync } from "@/lib/services/sync-engine";

export const runtime = "nodejs";
// Allow up to 5 minutes of execution (Vercel max for hobby is 60s; pro is 300s)
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const results: Array<{
    sheetMappingId: string;
    status: string;
    error?: string;
  }> = [];

  try {
    // Find all sync-enabled mappings whose nextSyncAt is due
    const dueMappings = await db.syncState.findMany({
      where: {
        enabled: true,
        scheduleMode: "interval",
        OR: [
          { nextSyncAt: null },           // never synced — due immediately
          { nextSyncAt: { lte: now } },   // overdue
        ],
        sheetMapping: {
          status: { in: ["active", "error"] }, // skip paused/unlinked/mismatch
        },
      },
      select: {
        sheetMappingId: true,
        scheduleExpr: true,
        sheetMapping: {
          select: { organizationId: true, datasetId: true },
        },
      },
      // Process at most 20 mappings per invocation to avoid timeout
      take: 20,
    });

    if (!dueMappings.length) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No mappings due for sync",
      });
    }

    // Run syncs sequentially to avoid flooding the Sheets API
    for (const mapping of dueMappings) {
      try {
        const result = await runSync(mapping.sheetMappingId, "scheduler");
        results.push({ sheetMappingId: mapping.sheetMappingId, status: result.status });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[cron/sheets-sync] Failed to sync mapping ${mapping.sheetMappingId}:`,
          errorMsg
        );
        results.push({
          sheetMappingId: mapping.sheetMappingId,
          status: "failed",
          error: errorMsg,
        });
        // Mark mapping as errored but continue with others
        await db.sheetMapping.update({
          where: { id: mapping.sheetMappingId },
          data: { status: "error" },
        }).catch(() => {}); // best-effort
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error("[cron/sheets-sync] Critical error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron sync failed" },
      { status: 500 }
    );
  }
}
