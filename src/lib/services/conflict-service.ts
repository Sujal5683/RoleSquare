// Conflict Service
//
// Handles detection and resolution of sync conflicts — situations where both
// the application and the Google Sheet have changed the same cell between
// two sync runs.
//
// Conflict lifecycle:
//   1. Detected during sync — conflict record created with status="pending"
//   2. Sync is paused for conflicted rows (neither side overwrites)
//   3. User resolves via UI: keep_app | keep_sheet | manual
//   4. Next sync applies the resolution

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConflictResolution = "keep_app" | "keep_sheet" | "manual";

export interface ConflictRecord {
  id: string;
  sheetMappingId: string;
  recordId: string;
  columnId: string;
  columnName: string;
  appValue: unknown;
  sheetValue: unknown;
  lastSyncedValue: unknown;
  detectedAt: string;
  status: string;
}

// ── Conflict detection ────────────────────────────────────────────────────────

/**
 * Determines if a conflict exists for a given cell.
 * A conflict occurs when:
 *   - The app value has changed since last sync AND
 *   - The sheet value has also changed since last sync AND
 *   - The two new values differ from each other
 */
export function isConflict(
  appValue: string | null,
  sheetValue: string | null,
  lastSyncedValue: string | null
): boolean {
  const appChanged = appValue !== lastSyncedValue;
  const sheetChanged = sheetValue !== lastSyncedValue;
  const valuesDisagree = appValue !== sheetValue;
  return appChanged && sheetChanged && valuesDisagree;
}

/**
 * Records a conflict in the database.
 * Idempotent — if a conflict for this record+column already exists as "pending",
 * updates it rather than creating a duplicate.
 */
export async function recordConflict(params: {
  sheetMappingId: string;
  recordId: string;
  columnId: string;
  columnName: string;
  appValue: unknown;
  sheetValue: unknown;
  lastSyncedValue: unknown;
}): Promise<string> {
  const existing = await db.syncConflict.findFirst({
    where: {
      sheetMappingId: params.sheetMappingId,
      recordId: params.recordId,
      columnId: params.columnId,
      status: "pending",
    },
    select: { id: true },
  });

  const appValueStr = params.appValue != null ? JSON.stringify(params.appValue) : null;
  const sheetValueStr = params.sheetValue != null ? JSON.stringify(params.sheetValue) : null;
  const lastSyncedStr = params.lastSyncedValue != null ? JSON.stringify(params.lastSyncedValue) : null;

  if (existing) {
    await db.syncConflict.update({
      where: { id: existing.id },
      data: { appValue: appValueStr, sheetValue: sheetValueStr, lastSyncedValue: lastSyncedStr },
    });
    return existing.id;
  }

  const conflict = await db.syncConflict.create({
    data: {
      sheetMappingId: params.sheetMappingId,
      recordId: params.recordId,
      columnId: params.columnId,
      columnName: params.columnName,
      appValue: appValueStr,
      sheetValue: sheetValueStr,
      lastSyncedValue: lastSyncedStr,
      status: "pending",
    },
  });

  // Bump conflict count on SyncState
  await db.syncState.updateMany({
    where: { sheetMappingId: params.sheetMappingId },
    data: { conflictCount: { increment: 1 } },
  });

  return conflict.id;
}

// ── Conflict resolution ───────────────────────────────────────────────────────

/**
 * Resolves a conflict by recording the user's decision.
 * The actual data update is applied by the sync engine on the next run,
 * or immediately if `applyNow` is true.
 *
 * Returns the resolved value (what should be used going forward).
 */
export async function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution,
  resolvedBy: string,
  organizationId: string,
  manualValue?: unknown
): Promise<{ resolvedValue: unknown }> {
  const conflict = await db.syncConflict.findUnique({
    where: { id: conflictId },
  });

  if (!conflict) throw new Error("Conflict not found");
  if (conflict.status !== "pending") throw new Error("Conflict already resolved");

  let resolvedValue: unknown;

  switch (resolution) {
    case "keep_app":
      resolvedValue = conflict.appValue ? JSON.parse(conflict.appValue) : null;
      break;
    case "keep_sheet":
      resolvedValue = conflict.sheetValue ? JSON.parse(conflict.sheetValue) : null;
      break;
    case "manual":
      resolvedValue = manualValue ?? null;
      break;
  }

  await db.syncConflict.update({
    where: { id: conflictId },
    data: {
      status: "resolved",
      resolution,
      resolvedBy,
      resolvedAt: new Date(),
    },
  });

  // Decrement conflict count on SyncState
  await db.syncState.updateMany({
    where: { sheetMappingId: conflict.sheetMappingId },
    data: { conflictCount: { decrement: 1 } },
  });

  await logAudit({
    organizationId,
    actorId: resolvedBy,
    action: "resolve_conflict",
    entity: "sync_conflict",
    entityId: conflictId,
    before: {
      appValue: conflict.appValue,
      sheetValue: conflict.sheetValue,
    },
    after: { resolution, resolvedValue: JSON.stringify(resolvedValue) },
  });

  return { resolvedValue };
}

// ── Query conflicts ───────────────────────────────────────────────────────────

export async function getUnresolvedConflicts(
  sheetMappingId: string
): Promise<ConflictRecord[]> {
  const conflicts = await db.syncConflict.findMany({
    where: { sheetMappingId, status: "pending" },
    orderBy: { detectedAt: "desc" },
  });

  return conflicts.map((c) => ({
    id: c.id,
    sheetMappingId: c.sheetMappingId,
    recordId: c.recordId,
    columnId: c.columnId,
    columnName: c.columnName,
    appValue: c.appValue ? safeJson(c.appValue) : null,
    sheetValue: c.sheetValue ? safeJson(c.sheetValue) : null,
    lastSyncedValue: c.lastSyncedValue ? safeJson(c.lastSyncedValue) : null,
    detectedAt: c.detectedAt.toISOString(),
    status: c.status,
  }));
}

export async function getConflictCount(sheetMappingId: string): Promise<number> {
  return db.syncConflict.count({
    where: { sheetMappingId, status: "pending" },
  });
}

// ── Auto-resolve ──────────────────────────────────────────────────────────────

/**
 * Auto-resolves all pending conflicts using the configured conflict strategy.
 * Called at the start of a sync when conflictStrategy !== "flag".
 */
export async function autoResolveConflicts(
  sheetMappingId: string,
  strategy: "app_wins" | "sheet_wins",
  organizationId: string
): Promise<number> {
  const pending = await db.syncConflict.findMany({
    where: { sheetMappingId, status: "pending" },
    select: { id: true },
  });

  const resolution: ConflictResolution =
    strategy === "app_wins" ? "keep_app" : "keep_sheet";

  for (const { id } of pending) {
    await db.syncConflict.update({
      where: { id },
      data: {
        status: "auto_resolved",
        resolution,
        resolvedAt: new Date(),
      },
    });
  }

  await db.syncState.updateMany({
    where: { sheetMappingId },
    data: { conflictCount: 0 },
  });

  if (pending.length > 0) {
    await logAudit({
      organizationId,
      action: "auto_resolve_conflicts",
      entity: "sheet_mapping",
      entityId: sheetMappingId,
      after: { strategy, resolved: pending.length },
    });
  }

  return pending.length;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
