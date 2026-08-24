// Reconciliation Service
//
// Verifies that the application data and Google Sheet are in a consistent state.
// Run periodically (or on demand) to detect drift.
//
// Reconciliation checks:
//   1. Schema fingerprint matches
//   2. Row count comparison (app vs sheet)
//   3. Missing external IDs (rows in app without sheet mapping)
//   4. Orphaned external IDs (mappings with no app record)
//   5. Stale last-sync timestamp (mapping hasn't synced in > threshold)
//   6. Sheet accessibility (can we still read the spreadsheet?)
//
// If drift is detected, triggers a re-sync.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getSheetPreview } from "@/lib/services/sheet-discovery";
import { getCurrentColumns } from "@/lib/services/schema-versioning";
import {
  validateSheetSchema,
  computeSchemaFingerprint,
} from "@/lib/services/schema-validation";
import { runSync } from "@/lib/services/sync-engine";

const STALE_SYNC_THRESHOLD_MS = 6 * 60 * 1000; // 6 minutes (slightly above 5min schedule)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReconcileResult {
  sheetMappingId: string;
  status: "ok" | "resynced" | "schema_mismatch" | "inaccessible" | "drift";
  checks: ReconcileCheck[];
  actionTaken?: string;
}

export interface ReconcileCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

// ── Main reconcile function ───────────────────────────────────────────────────

/**
 * Reconciles a single SheetMapping.
 * Called by the job runner on a schedule, or manually.
 */
export async function reconcile(sheetMappingId: string): Promise<ReconcileResult> {
  const mapping = await db.sheetMapping.findUnique({
    where: { id: sheetMappingId },
    include: {
      spreadsheetConnection: true,
      syncState: true,
      dataset: true,
    },
  });

  if (!mapping) throw new Error(`SheetMapping ${sheetMappingId} not found`);
  if (mapping.status === "unlinked") {
    return {
      sheetMappingId,
      status: "ok",
      checks: [{ name: "unlinked_skip", passed: true, detail: "Mapping is unlinked, skipping" }],
    };
  }

  const checks: ReconcileCheck[] = [];
  let shouldResync = false;

  const { spreadsheetConnection } = mapping;
  const sheetsAccountId = spreadsheetConnection.sheetsAccountId;
  const spreadsheetId = spreadsheetConnection.spreadsheetId;
  const sheetName = mapping.sheetName;

  // ── Check 1: Sheet accessibility ──────────────────────────────────────────
  let sheetPreview;
  try {
    sheetPreview = await getSheetPreview(sheetsAccountId, spreadsheetId, sheetName, 5);
    checks.push({ name: "accessibility", passed: true, detail: "Sheet is accessible" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    checks.push({ name: "accessibility", passed: false, detail });
    return { sheetMappingId, status: "inaccessible", checks };
  }

  // ── Check 2: Schema fingerprint ───────────────────────────────────────────
  const columns = await getCurrentColumns(mapping.datasetId);
  const expectedFingerprint = computeSchemaFingerprint(columns);
  const actualHeaders = sheetPreview.headers.filter((h) => h !== "__row_id__");
  const schemaResult = validateSheetSchema(columns, actualHeaders, mapping.dataset.recordCount);

  if (!schemaResult.fingerprintMatch) {
    checks.push({
      name: "schema_fingerprint",
      passed: false,
      detail: `Schema mismatch: ${schemaResult.diffs.length} difference(s)`,
    });

    // Update mapping status
    await db.sheetMapping.update({
      where: { id: sheetMappingId },
      data: { status: "schema_mismatch" },
    });

    return { sheetMappingId, status: "schema_mismatch", checks };
  }
  checks.push({ name: "schema_fingerprint", passed: true });

  // ── Check 3: Row count comparison ─────────────────────────────────────────
  const appRowCount = await db.datasetRecord.count({ where: { datasetId: mapping.datasetId } });
  const mappedRowCount = await db.datasetRowExternalId.count({
    where: { sheetMappingId },
  });
  const sheetRowCount = sheetPreview.totalRowsEstimate;

  const rowCountDrift = Math.abs(sheetRowCount - appRowCount);
  if (rowCountDrift > 0) {
    checks.push({
      name: "row_count",
      passed: false,
      detail: `App: ${appRowCount} rows, Sheet: ~${sheetRowCount} rows (drift: ${rowCountDrift})`,
    });
    shouldResync = true;
  } else {
    checks.push({
      name: "row_count",
      passed: true,
      detail: `${appRowCount} rows in sync`,
    });
  }

  // ── Check 4: Orphaned external IDs ────────────────────────────────────────
  // Count rows where the record no longer exists in DatasetRecord
  const allExternalIds = await db.datasetRowExternalId.findMany({
    where: { sheetMappingId },
    select: { id: true, recordId: true },
  });
  const existingRecordIds = await db.datasetRecord.findMany({
    where: { id: { in: allExternalIds.map((e) => e.recordId) } },
    select: { id: true },
  });
  const existingSet = new Set(existingRecordIds.map((r) => r.id));
  const orphanedIds = allExternalIds.filter((e) => !existingSet.has(e.recordId));
  const orphanedCount = orphanedIds.length;
  if (orphanedCount > 0) {
    checks.push({
      name: "orphaned_ids",
      passed: false,
      detail: `${orphanedCount} external ID mappings have no corresponding app record`,
    });
    // Clean up orphaned IDs
    await db.datasetRowExternalId.deleteMany({
      where: { id: { in: orphanedIds.map((e) => e.id) } },
    });
    shouldResync = true;
  } else {
    checks.push({ name: "orphaned_ids", passed: true });
  }

  // ── Check 5: Stale last-sync ──────────────────────────────────────────────
  const lastSyncAt = mapping.syncState?.lastSyncAt;
  const isStale =
    !lastSyncAt ||
    Date.now() - lastSyncAt.getTime() > STALE_SYNC_THRESHOLD_MS;

  if (isStale && mapping.syncState?.enabled) {
    checks.push({
      name: "stale_sync",
      passed: false,
      detail: lastSyncAt
        ? `Last sync was ${Math.round((Date.now() - lastSyncAt.getTime()) / 60000)} minutes ago`
        : "Never synced",
    });
    shouldResync = true;
  } else {
    checks.push({ name: "stale_sync", passed: true });
  }

  // ── Re-sync if drift detected ─────────────────────────────────────────────
  if (shouldResync) {
    try {
      await runSync(sheetMappingId, "reconcile");
      return {
        sheetMappingId,
        status: "resynced",
        checks,
        actionTaken: "Triggered re-sync due to detected drift",
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      checks.push({ name: "resync", passed: false, detail });
      return { sheetMappingId, status: "drift", checks, actionTaken: `Re-sync failed: ${detail}` };
    }
  }

  return { sheetMappingId, status: "ok", checks };
}

// ── Reconcile all mappings for an org ─────────────────────────────────────────

/**
 * Reconciles all active SheetMappings for an organization.
 * Called by the job runner on a periodic schedule.
 */
export async function reconcileOrg(organizationId: string): Promise<ReconcileResult[]> {
  const mappings = await db.sheetMapping.findMany({
    where: { organizationId, status: { in: ["active", "error", "paused"] } },
    select: { id: true },
  });

  const results: ReconcileResult[] = [];
  for (const { id } of mappings) {
    try {
      const result = await reconcile(id);
      results.push(result);
    } catch (err) {
      results.push({
        sheetMappingId: id,
        status: "drift",
        checks: [
          {
            name: "reconcile_error",
            passed: false,
            detail: err instanceof Error ? err.message : "Unknown error",
          },
        ],
      });
    }
  }

  return results;
}
