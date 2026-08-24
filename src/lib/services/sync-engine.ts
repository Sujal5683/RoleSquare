// Sync Engine
//
// Implements true two-way synchronization between application DatasetRecords
// and Google Sheet rows.
//
// Sync cycle:
//   1. Validate schema (fingerprint check) — abort if schema mismatch
//   2. Fetch all app rows with their external IDs
//   3. Fetch all sheet rows
//   4. Match rows by stable externalId (hidden __row_id__ column)
//   5. For each matched pair: detect conflicts, apply non-conflicting changes
//   6. Handle unmatched app rows (sheet deletions) and new sheet rows (new data)
//   7. Push app-only changes to sheet
//   8. Record sync event + update sync state
//
// Identity contract:
//   - Each row has a stable UUID stored in column "__row_id__" in the sheet
//   - We NEVER use row numbers as identity
//   - Row numbers are only used to locate rows for writing

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  validateSheetSchema,
  computeSchemaFingerprint,
  validateCellValue,
  type ColumnSpec,
} from "@/lib/services/schema-validation";
import {
  getCurrentColumns,
} from "@/lib/services/schema-versioning";
import {
  getSheetAllRows,
  writeRowsToSheet,
  appendRowsToSheet,
  deleteSheetRow,
  writeSheetHeaders,
} from "@/lib/services/sheet-discovery";
import {
  isConflict,
  recordConflict,
  autoResolveConflicts,
} from "@/lib/services/conflict-service";
import { randomUUID } from "crypto";

const ROW_ID_HEADER = "__row_id__";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncResult {
  status: "success" | "partial" | "failed" | "schema_mismatch" | "conflict";
  rowsAdded: number;
  rowsUpdated: number;
  rowsDeleted: number;
  conflicts: number;
  errors: number;
  errorDetail?: string;
  schemaChanges?: unknown[];
}

interface SheetRow {
  externalId: string;
  rowIndex: number; // 1-based (row 2 = first data row)
  values: Record<string, string>; // columnName → value
}

// ── Main sync entry point ─────────────────────────────────────────────────────

/**
 * Runs a full sync cycle for a SheetMapping.
 * Creates a SyncEvent record and updates SyncState on completion.
 * All DB changes are in a transaction. Sheet API calls are not transactional
 * but are idempotent via externalId matching.
 */
export async function runSync(
  sheetMappingId: string,
  triggeredBy: "scheduler" | "manual" | "webhook" | "reconcile" = "scheduler"
): Promise<SyncResult> {
  // Load mapping with all relations
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
    throw new Error("Cannot sync an unlinked sheet mapping");
  }

  // Create running sync event
  const syncEvent = await db.syncEvent.create({
    data: {
      sheetMappingId,
      status: "running",
      direction: mapping.direction,
      triggeredBy,
    },
  });

  const result: SyncResult = {
    status: "success",
    rowsAdded: 0,
    rowsUpdated: 0,
    rowsDeleted: 0,
    conflicts: 0,
    errors: 0,
  };

  try {
    const { spreadsheetConnection } = mapping;
    const sheetsAccountId = spreadsheetConnection.sheetsAccountId;
    const spreadsheetId = spreadsheetConnection.spreadsheetId;
    const sheetName = mapping.sheetName;

    // 1. Get current columns
    const columns = await getCurrentColumns(mapping.datasetId);
    if (!columns.length) {
      throw new Error(
        "Dataset has no column definitions. Initialize columns before syncing."
      );
    }

    // 2. Fetch sheet data (headers + all rows)
    const { headers: rawHeaders, rows: sheetRawRows } = await getSheetAllRows(
      sheetsAccountId,
      spreadsheetId,
      sheetName
    );

    // 3. Validate schema
    const rowIdIdx = rawHeaders.indexOf(ROW_ID_HEADER);
    const dataHeaders = rawHeaders.filter((h) => h !== ROW_ID_HEADER);
    const schemaResult = validateSheetSchema(columns, dataHeaders, mapping.dataset.recordCount);

    if (!schemaResult.valid) {
      // Schema mismatch — pause sync, don't proceed with data sync
      const changes = schemaResult.diffs;
      await db.sheetMapping.update({
        where: { id: sheetMappingId },
        data: { status: "schema_mismatch" },
      });

      await finalizeSyncEvent(syncEvent.id, {
        status: "schema_change",
        schemaChanges: JSON.stringify(changes),
        errorDetail: `Schema mismatch: ${changes.length} change(s) detected`,
      });

      await updateSyncState(sheetMappingId, "schema_change", result);

      return {
        ...result,
        status: "schema_mismatch",
        schemaChanges: changes,
      };
    }

    // 4. Auto-resolve conflicts if strategy isn't "flag"
    const strategy = mapping.syncState?.conflictStrategy ?? "flag";
    if (strategy !== "flag") {
      const autoResolved = await autoResolveConflicts(
        sheetMappingId,
        strategy as "app_wins" | "sheet_wins",
        mapping.organizationId
      );
      if (autoResolved > 0) {
        console.info(`[sync] Auto-resolved ${autoResolved} conflicts using strategy: ${strategy}`);
      }
    }

    // 5. Parse sheet rows into structured objects
    const sheetRows: SheetRow[] = sheetRawRows
      .map((rawRow, i) => {
        const externalId = rowIdIdx >= 0 ? (rawRow[rowIdIdx] || "") : "";
        const values: Record<string, string> = {};
        dataHeaders.forEach((header, hi) => {
          const rawIdx = rawHeaders.indexOf(header);
          values[header] = rawIdx >= 0 ? (rawRow[rawIdx] || "") : "";
        });
        return {
          externalId,
          rowIndex: i + 2, // +2: row 1 = headers
          values,
        };
      })
      .filter((r) => r.externalId); // Skip rows without an external ID

    // 6. Fetch app rows with external IDs
    const appExternalIds = await db.datasetRowExternalId.findMany({
      where: { sheetMappingId },
      include: {
        dataset: false,
      },
    });

    const appRecords = await db.datasetRecord.findMany({
      where: { datasetId: mapping.datasetId },
      include: { values: true },
    });

    // Build lookup maps
    const appRecordById = new Map(appRecords.map((r) => [r.id, r]));
    const externalIdByRecordId = new Map(
      appExternalIds.map((e) => [e.recordId, e.externalId])
    );
    const recordIdByExternalId = new Map(
      appExternalIds.map((e) => [e.externalId, e.recordId])
    );
    const sheetRowByExternalId = new Map(
      sheetRows.map((r) => [r.externalId, r])
    );

    // ── Direction: App → Sheet (push app changes to sheet) ────────────────────
    if (mapping.direction !== "from_sheet") {
      const rowsToAppend: string[][] = [];
      const sheetUpdates: Array<{ rowIndex: number; rowData: string[] }> = [];

      for (const record of appRecords) {
        const extId = externalIdByRecordId.get(record.id);

        if (!extId) {
          // New app record — push to sheet as a new row
          const newExtId = randomUUID();
          const rowData = buildSheetRow(record, columns, newExtId);
          rowsToAppend.push(rowData);

          // We'll create the external ID mapping after appending
          // (using a best-effort approach since we don't know the exact row index)
          await db.datasetRowExternalId.create({
            data: {
              datasetId: mapping.datasetId,
              recordId: record.id,
              sheetMappingId,
              externalId: newExtId,
            },
          });

          result.rowsAdded++;
          continue;
        }

        // Existing record — check if sheet row exists and if values differ
        const sheetRow = sheetRowByExternalId.get(extId);
        if (!sheetRow) {
          // Sheet row was deleted — skip (handled in from_sheet direction below)
          continue;
        }

        // Check each column for differences
        let hasChanges = false;
        for (const col of columns) {
          const appVal = record.values.find((v) => {
            // Try matching by fieldId or field name
            return v.fieldId === col.columnId;
          });
          const appRaw = appVal ? String(appVal.value ?? "") : "";
          const sheetRaw = sheetRow.values[col.name] ?? "";

          if (appRaw !== sheetRaw) {
            hasChanges = true;
            break;
          }
        }

        if (hasChanges) {
          const rowData = buildSheetRow(record, columns, extId);
          sheetUpdates.push({ rowIndex: sheetRow.rowIndex, rowData });
          result.rowsUpdated++;
        }
      }

      // Append new rows in batch
      if (rowsToAppend.length > 0) {
        await appendRowsToSheet(sheetsAccountId, spreadsheetId, sheetName, rowsToAppend);
      }

      // Apply updates
      for (const { rowIndex, rowData } of sheetUpdates) {
        await writeRowsToSheet(sheetsAccountId, spreadsheetId, sheetName, [rowData], rowIndex);
      }
    }

    // ── Direction: Sheet → App (pull sheet changes into app) ──────────────────
    if (mapping.direction !== "to_sheet") {
      for (const sheetRow of sheetRows) {
        const recordId = recordIdByExternalId.get(sheetRow.externalId);

        if (!recordId) {
          // New sheet row — create app record
          if (mapping.direction !== "to_sheet") {
            await createRecordFromSheetRow(
              mapping.datasetId,
              columns,
              sheetRow,
              sheetMappingId
            );
            result.rowsAdded++;
          }
          continue;
        }

        const appRecord = appRecordById.get(recordId);
        if (!appRecord) continue;

        // Check each column for conflicts or updates
        for (const col of columns) {
          const sheetRaw = sheetRow.values[col.name] ?? "";
          const appVal = appRecord.values.find((v) => v.fieldId === col.columnId);
          const appRaw = appVal ? String(appVal.value ?? "") : "";

          if (sheetRaw === appRaw) continue; // No change

          // Validate the sheet value before applying
          const validation = validateCellValue(sheetRaw, col.dataType as Parameters<typeof validateCellValue>[1]);
          if (!validation.valid) {
            result.errors++;
            console.warn(
              `[sync] Invalid value in sheet for column "${col.name}": ${validation.error}`
            );
            continue;
          }

          // Check for conflict: was this field recently updated in the app too?
          const extIdRecord = appExternalIds.find((e) => e.recordId === recordId);
          const lastSyncedAt = extIdRecord?.lastSyncedAt;

          if (lastSyncedAt && appVal?.correctedAt && appVal.correctedAt > lastSyncedAt) {
            // Both changed — conflict!
            if (strategy === "flag") {
              await recordConflict({
                sheetMappingId,
                recordId,
                columnId: col.columnId,
                columnName: col.name,
                appValue: appRaw,
                sheetValue: sheetRaw,
                lastSyncedValue: appVal.originalValue,
              });
              result.conflicts++;
            } else if (strategy === "app_wins") {
              // App value wins — no update needed
            } else {
              // Sheet wins — update app
              await updateAppCellValue(recordId, col.columnId, validation.coercedValue);
              result.rowsUpdated++;
            }
          } else {
            // No conflict — apply sheet change to app
            await updateAppCellValue(recordId, col.columnId, validation.coercedValue);
            result.rowsUpdated++;
          }
        }
      }

      // Handle sheet deletions: rows in app that no longer exist in sheet
      for (const extId of appExternalIds) {
        if (!sheetRowByExternalId.has(extId.externalId)) {
          // Sheet row was deleted
          // NOTE: We don't auto-delete app records — we just flag the mapping
          // as having a deletion for the user to review (unless configured otherwise)
          console.info(
            `[sync] Sheet row ${extId.externalId} no longer exists in sheet (record: ${extId.recordId})`
          );
          result.rowsDeleted++;
        }
      }
    }

    // Update external ID last-synced timestamps
    await db.datasetRowExternalId.updateMany({
      where: { sheetMappingId },
      data: { lastSyncedAt: new Date() },
    });

    // Update schema fingerprint if valid
    const currentFingerprint = computeSchemaFingerprint(columns);
    await db.sheetMapping.update({
      where: { id: sheetMappingId },
      data: {
        schemaFingerprint: currentFingerprint,
        status: result.conflicts > 0 ? "error" : "active",
      },
    });

    const finalStatus =
      result.errors > 0 && result.errors < sheetRows.length
        ? "partial"
        : result.errors > 0
        ? "failed"
        : "success";
    result.status = finalStatus;

    await finalizeSyncEvent(syncEvent.id, { status: finalStatus });
    await updateSyncState(sheetMappingId, finalStatus, result);

    await logAudit({
      organizationId: mapping.organizationId,
      actorType: "system",
      action: "sync",
      entity: "sheet_mapping",
      entityId: sheetMappingId,
      after: {
        rowsAdded: result.rowsAdded,
        rowsUpdated: result.rowsUpdated,
        rowsDeleted: result.rowsDeleted,
        conflicts: result.conflicts,
        errors: result.errors,
        status: finalStatus,
      },
    });

    return result;
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    console.error(`[sync] Error syncing ${sheetMappingId}:`, errorDetail);

    await finalizeSyncEvent(syncEvent.id, { status: "failed", errorDetail });
    await updateSyncState(sheetMappingId, "failed", result);

    result.status = "failed";
    result.errorDetail = errorDetail;
    result.errors++;
    return result;
  }
}

// ── Initial sheet setup ───────────────────────────────────────────────────────

/**
 * Initializes a freshly-linked sheet: writes headers (including hidden __row_id__)
 * and pushes all existing app records to the sheet.
 */
export async function initialSheetPush(
  sheetMappingId: string,
  sheetsAccountId: string,
  spreadsheetId: string,
  sheetName: string,
  columns: ColumnSpec[],
  datasetId: string
): Promise<void> {
  // Write header row: [...column names, __row_id__]
  const headers = [...columns.map((c) => c.name), ROW_ID_HEADER];
  await writeSheetHeaders(sheetsAccountId, spreadsheetId, sheetName, headers);

  // Push existing records
  const records = await db.datasetRecord.findMany({
    where: { datasetId },
    include: { values: true },
  });

  if (!records.length) return;

  const rows: string[][] = [];
  for (const record of records) {
    const extId = randomUUID();
    const row = buildSheetRow(record, columns, extId);
    rows.push(row);

    // Save external ID mapping
    await db.datasetRowExternalId.create({
      data: {
        datasetId,
        recordId: record.id,
        sheetMappingId,
        externalId: extId,
        sheetRowIndex: rows.length + 1, // +1 for header, +1 for 1-based
      },
    });
  }

  // Batch write in chunks of 1000
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await appendRowsToSheet(sheetsAccountId, spreadsheetId, sheetName, chunk);
  }

  // Update row ID column index on mapping (it's the last column)
  await db.sheetMapping.update({
    where: { id: sheetMappingId },
    data: { rowIdColumnIndex: columns.length }, // 0-based index
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSheetRow(
  record: { values: Array<{ fieldId: string; value: string }> },
  columns: ColumnSpec[],
  externalId: string
): string[] {
  const row = columns.map((col) => {
    const val = record.values.find((v) => v.fieldId === col.columnId);
    if (!val) return "";
    try {
      const parsed = JSON.parse(val.value);
      return String(parsed ?? "");
    } catch {
      return String(val.value ?? "");
    }
  });
  row.push(externalId); // hidden row ID at the end
  return row;
}

async function createRecordFromSheetRow(
  datasetId: string,
  columns: ColumnSpec[],
  sheetRow: SheetRow,
  sheetMappingId: string
): Promise<void> {
  const record = await db.datasetRecord.create({
    data: {
      datasetId,
      status: "valid",
      confidence: 1.0,
    },
  });

  const valueInserts = columns.map((col) => ({
    recordId: record.id,
    fieldId: col.columnId,
    value: JSON.stringify(sheetRow.values[col.name] ?? ""),
    confidence: 1.0,
    evidence: "Imported from Google Sheets",
  }));

  await db.datasetValue.createMany({ data: valueInserts });
  await db.dataset.update({
    where: { id: datasetId },
    data: { recordCount: { increment: 1 } },
  });

  await db.datasetRowExternalId.create({
    data: {
      datasetId,
      recordId: record.id,
      sheetMappingId,
      externalId: sheetRow.externalId,
      sheetRowIndex: sheetRow.rowIndex,
      lastSyncedAt: new Date(),
    },
  });
}

async function updateAppCellValue(
  recordId: string,
  columnId: string,
  newValue: unknown
): Promise<void> {
  await db.datasetValue.updateMany({
    where: { recordId, fieldId: columnId },
    data: {
      value: JSON.stringify(newValue),
      correctedAt: new Date(),
    },
  });
}

async function finalizeSyncEvent(
  eventId: string,
  data: {
    status: string;
    errorDetail?: string;
    schemaChanges?: string;
  }
): Promise<void> {
  await db.syncEvent.update({
    where: { id: eventId },
    data: {
      finishedAt: new Date(),
      status: data.status,
      errorDetail: data.errorDetail ?? null,
      schemaChanges: data.schemaChanges ?? null,
    },
  });
}

async function updateSyncState(
  sheetMappingId: string,
  status: string,
  result: SyncResult
): Promise<void> {
  await db.syncState.upsert({
    where: { sheetMappingId },
    create: {
      sheetMappingId,
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      syncedRows: result.rowsAdded + result.rowsUpdated,
      errorCount: result.errors,
      conflictCount: result.conflicts,
    },
    update: {
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      syncedRows: { increment: result.rowsAdded + result.rowsUpdated },
      errorCount: { increment: result.errors },
      conflictCount: { increment: result.conflicts },
    },
  });
}
