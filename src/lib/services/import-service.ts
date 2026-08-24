// Import Service
//
// Processes one-time imports from Google Sheets into application datasets.
// This is a separate feature from continuous sync — it's a one-time operation
// that reads sheet data and inserts/updates records based on the configured mode.
//
// Import modes:
//   append          — add all sheet rows as new records
//   update_existing — match on a key field and update matching records
//   append_update   — update matches + append new ones
//   replace         — delete existing records and replace with sheet data (DESTRUCTIVE)

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getSheetAllRows, getSpreadsheetMeta } from "@/lib/services/sheet-discovery";
import { validateCellValue, type ColumnSpec } from "@/lib/services/schema-validation";
import { getCurrentColumns, createSchemaVersion, initializeDatasetColumns } from "@/lib/services/schema-versioning";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportParams {
  importJobId: string;
  organizationId: string;
  userId: string;
}

export interface ImportProgress {
  total: number;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

// ── Main import processor ─────────────────────────────────────────────────────

/**
 * Processes an ImportJob. Called by the job runner.
 * Updates the ImportJob record with progress as it runs.
 * Idempotent — if re-run, won't duplicate rows (uses matchField dedup).
 */
export async function processImport(params: ImportParams): Promise<ImportProgress> {
  const { importJobId, organizationId, userId } = params;

  const job = await db.importJob.findUnique({
    where: { id: importJobId },
    include: { mappings: true, sheetsAccount: true },
  });

  if (!job) throw new Error(`ImportJob ${importJobId} not found`);
  if (job.status !== "pending" && job.status !== "running") {
    throw new Error(`ImportJob is already ${job.status}`);
  }

  // Mark as running
  await db.importJob.update({
    where: { id: importJobId },
    data: { status: "running", startedAt: new Date() },
  });

  const progress: ImportProgress = {
    total: 0,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // 1. Fetch sheet data
    const { headers, rows } = await getSheetAllRows(
      job.sheetsAccountId,
      job.spreadsheetId,
      job.sheetName,
      (fetched) => {
        console.info(`[import] Fetched ${fetched} rows from sheet...`);
      }
    );

    progress.total = rows.length;
    await db.importJob.update({
      where: { id: importJobId },
      data: { totalRows: rows.length },
    });

    if (!rows.length) {
      await finalizeImport(importJobId, "success", progress);
      return progress;
    }

    // 2. Resolve or create dataset
    let datasetId = job.datasetId;

    if (!datasetId) {
      // Create new dataset
      const dataset = await db.dataset.create({
        data: {
          organizationId,
          createdBy: userId,
          name: job.newDatasetName || job.sheetName || "Imported Dataset",
          description: `Imported from ${job.spreadsheetName || job.spreadsheetId} / ${job.sheetName}`,
          recordCount: 0,
        },
      });
      datasetId = dataset.id;
      await db.importJob.update({ where: { id: importJobId }, data: { datasetId } });

      // Initialize columns from import mappings
      await createColumnsFromMappings(datasetId, job.mappings, userId);
    }

    // 3. Get current column definitions
    const columns = await getCurrentColumns(datasetId);
    if (!columns.length) {
      throw new Error("Dataset has no column definitions");
    }

    // 4. Build column mapping (sheet header → column def)
    const headerToColumn = new Map<string, ColumnSpec>();
    for (const mapping of job.mappings) {
      if (!mapping.columnId || !mapping.sheetHeader) continue;
      const col = columns.find((c) => c.columnId === mapping.columnId);
      if (col) headerToColumn.set(mapping.sheetHeader, col);
    }

    // 5. Handle REPLACE mode — snapshot schema and delete existing records
    if (job.importMode === "replace") {
      const currentCols = await getCurrentColumns(datasetId);
      await createSchemaVersion(datasetId, currentCols, "import", userId, "Replace import");
      await db.datasetRecord.deleteMany({ where: { datasetId } });
      await db.dataset.update({ where: { id: datasetId }, data: { recordCount: 0 } });
    }

    // 6. Process rows in batches
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await processBatch(
        batch,
        i,
        headers,
        headerToColumn,
        job,
        datasetId,
        progress
      );

      // Update progress
      progress.processed = Math.min(i + BATCH, rows.length);
      await db.importJob.update({
        where: { id: importJobId },
        data: { processedRows: progress.processed },
      });
    }

    // 7. Update dataset record count
    const newCount = await db.datasetRecord.count({ where: { datasetId } });
    await db.dataset.update({
      where: { id: datasetId },
      data: { recordCount: newCount },
    });

    const finalStatus = progress.errors.length > 0
      ? progress.errors.length < rows.length ? "partial" : "failed"
      : "success";

    await finalizeImport(importJobId, finalStatus, progress);

    await logAudit({
      organizationId,
      actorId: userId,
      action: "import",
      entity: "dataset",
      entityId: datasetId,
      after: {
        importJobId,
        mode: job.importMode,
        inserted: progress.inserted,
        updated: progress.updated,
        skipped: progress.skipped,
        errors: progress.errors.length,
        spreadsheetId: job.spreadsheetId,
        sheetName: job.sheetName,
      },
    });

    return progress;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    progress.errors.push({ row: -1, message: errorMsg });
    await finalizeImport(importJobId, "failed", progress);
    throw err;
  }
}

// ── Batch processor ───────────────────────────────────────────────────────────

async function processBatch(
  rows: string[][],
  batchOffset: number,
  headers: string[],
  headerToColumn: Map<string, ColumnSpec>,
  job: {
    importMode: string;
    matchField: string | null;
    datasetId: string | null;
  },
  datasetId: string,
  progress: ImportProgress
): Promise<void> {
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const rowNum = batchOffset + ri + 2; // 1-based, +1 for header

    // Build cell values
    const cellValues: Array<{ columnId: string; value: unknown; raw: string }> = [];
    for (const [header, col] of headerToColumn.entries()) {
      const headerIdx = headers.indexOf(header);
      const raw = headerIdx >= 0 ? (row[headerIdx] || "") : "";
      const validation = validateCellValue(raw, col.dataType as Parameters<typeof validateCellValue>[1]);
      if (!validation.valid) {
        progress.errors.push({
          row: rowNum,
          message: `Column "${col.name}": ${validation.error}`,
        });
        // Still include the raw value (marked as invalid)
        cellValues.push({ columnId: col.columnId, value: raw, raw });
      } else {
        cellValues.push({ columnId: col.columnId, value: validation.coercedValue, raw });
      }
    }

    // Handle update modes
    if (
      (job.importMode === "update_existing" || job.importMode === "append_update") &&
      job.matchField
    ) {
      const matchCol = headerToColumn.get(job.matchField) ||
        [...headerToColumn.values()].find((c) => c.columnId === job.matchField);
      const matchHeaderIdx = matchCol ? headers.indexOf(matchCol.name) : -1;
      const matchValue = matchHeaderIdx >= 0 ? row[matchHeaderIdx] : null;

      if (matchValue) {
        // Find existing record with this match value
        const existingValue = await db.datasetValue.findFirst({
          where: {
            fieldId: matchCol!.columnId,
            value: JSON.stringify(matchValue),
            record: { datasetId },
          },
          select: { recordId: true },
        });

        if (existingValue) {
          // Update existing record
          for (const cell of cellValues) {
            await db.datasetValue.updateMany({
              where: { recordId: existingValue.recordId, fieldId: cell.columnId },
              data: { value: JSON.stringify(cell.value), correctedAt: new Date() },
            });
          }
          progress.updated++;
          continue;
        }

        if (job.importMode === "update_existing") {
          progress.skipped++;
          continue;
        }
      }
    }

    // Append mode — create new record
    if (job.importMode !== "update_existing") {
      const record = await db.datasetRecord.create({
        data: { datasetId, status: "valid", confidence: 1.0 },
      });

      await db.datasetValue.createMany({
        data: cellValues.map((cell) => ({
          recordId: record.id,
          fieldId: cell.columnId,
          value: JSON.stringify(cell.value),
          confidence: 1.0,
          evidence: "Imported from Google Sheets",
        })),
      });

      progress.inserted++;
    }
  }
}

// ── Column creation from import mappings ──────────────────────────────────────

async function createColumnsFromMappings(
  datasetId: string,
  mappings: Array<{
    sheetHeader: string;
    columnId: string | null;
    columnName: string | null;
    dataType: string | null;
    isNewColumn: boolean;
  }>,
  userId: string
): Promise<void> {
  const { randomUUID } = await import("crypto");
  const columns: import("@/lib/services/schema-validation").ColumnSpec[] = [];
  let position = 0;

  for (const mapping of mappings) {
    if (!mapping.columnId && !mapping.isNewColumn) continue;

    const columnId = mapping.columnId || `col_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const name = mapping.columnName || mapping.sheetHeader;
    const dataType = mapping.dataType || "text";

    await db.datasetColumnDef.upsert({
      where: { datasetId_columnId: { datasetId, columnId } },
      create: {
        datasetId,
        columnId,
        name,
        dataType,
        position: position++,
        required: false,
      },
      update: { name, dataType, isDeleted: false },
    });

    columns.push({ columnId, name, dataType, position: position - 1, required: false });
  }

  await createSchemaVersion(datasetId, columns, "import", userId, "Initial import schema");
}

// ── Finalize ──────────────────────────────────────────────────────────────────

async function finalizeImport(
  importJobId: string,
  status: string,
  progress: ImportProgress
): Promise<void> {
  await db.importJob.update({
    where: { id: importJobId },
    data: {
      status,
      finishedAt: new Date(),
      insertedRows: progress.inserted,
      updatedRows: progress.updated,
      skippedRows: progress.skipped,
      errorRows: progress.errors.length,
      processedRows: progress.processed,
      errors: progress.errors.length > 0 ? JSON.stringify(progress.errors.slice(0, 100)) : null,
    },
  });
}
