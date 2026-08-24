// Schema Versioning Service
//
// Every schema-changing operation MUST call createSchemaVersion() first.
// This creates an immutable snapshot of the column definitions before the change,
// enabling rollback to any previous version.
//
// Version numbers are monotonically increasing per dataset. Version 1 is the
// "initial" version created when a dataset is first linked to Google Sheets.

import { db } from "@/lib/db";
import { computeSchemaFingerprint, type ColumnSpec } from "@/lib/services/schema-validation";
import { logAudit } from "@/lib/audit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchemaVersionRecord {
  id: string;
  datasetId: string;
  version: number;
  columns: ColumnSpec[];
  fingerprint: string;
  changedBy: string | null;
  changeSource: string;
  reason: string | null;
  createdAt: string;
}

// ── Create version snapshot ───────────────────────────────────────────────────

/**
 * Creates a new schema version snapshot for a dataset.
 * Should be called BEFORE applying any schema changes.
 *
 * @param datasetId     The dataset being versioned
 * @param columns       The current (pre-change) column definitions
 * @param source        What triggered the version: "user" | "sync" | "import" | "rollback" | "initial"
 * @param changedBy     userId who approved the change (null for system actions)
 * @param reason        Human-readable reason for the version
 */
export async function createSchemaVersion(
  datasetId: string,
  columns: ColumnSpec[],
  source: string,
  changedBy?: string | null,
  reason?: string
): Promise<SchemaVersionRecord> {
  // Get the next version number
  const latest = await db.datasetSchemaVersion.findFirst({
    where: { datasetId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  const fingerprint = computeSchemaFingerprint(columns);

  const version = await db.datasetSchemaVersion.create({
    data: {
      datasetId,
      version: nextVersion,
      columns: JSON.stringify(columns),
      fingerprint,
      changedBy: changedBy ?? null,
      changeSource: source,
      reason: reason ?? null,
    },
  });

  return {
    id: version.id,
    datasetId: version.datasetId,
    version: version.version,
    columns,
    fingerprint,
    changedBy: version.changedBy,
    changeSource: version.changeSource,
    reason: version.reason,
    createdAt: version.createdAt.toISOString(),
  };
}

// ── Get current columns ───────────────────────────────────────────────────────

/**
 * Returns the current (non-deleted) column definitions for a dataset
 * in position order. These are the authoritative app-side columns.
 */
export async function getCurrentColumns(datasetId: string): Promise<ColumnSpec[]> {
  const cols = await db.datasetColumnDef.findMany({
    where: { datasetId, isDeleted: false },
    orderBy: { position: "asc" },
  });

  return cols.map((c) => ({
    columnId: c.columnId,
    name: c.name,
    dataType: c.dataType,
    position: c.position,
    required: c.required,
  }));
}

// ── List versions ─────────────────────────────────────────────────────────────

export async function getSchemaVersions(
  datasetId: string
): Promise<SchemaVersionRecord[]> {
  const versions = await db.datasetSchemaVersion.findMany({
    where: { datasetId },
    orderBy: { version: "desc" },
  });

  return versions.map((v) => ({
    id: v.id,
    datasetId: v.datasetId,
    version: v.version,
    columns: safeParseColumns(v.columns),
    fingerprint: v.fingerprint,
    changedBy: v.changedBy,
    changeSource: v.changeSource,
    reason: v.reason,
    createdAt: v.createdAt.toISOString(),
  }));
}

// ── Rollback ──────────────────────────────────────────────────────────────────

/**
 * Rolls back a dataset's column definitions to a previous schema version.
 * Steps:
 *   1. Load the target version snapshot
 *   2. Create a new version (so the rollback itself is versioned)
 *   3. Soft-delete current columns
 *   4. Recreate columns from the snapshot
 *   5. Update SheetMapping fingerprint
 *   6. Audit log
 */
export async function rollbackToVersion(
  datasetId: string,
  versionId: string,
  organizationId: string,
  userId: string
): Promise<{ newVersion: number; columns: ColumnSpec[] }> {
  // Load target version
  const target = await db.datasetSchemaVersion.findFirst({
    where: { id: versionId, datasetId },
  });
  if (!target) {
    throw new Error("Schema version not found");
  }

  const targetColumns = safeParseColumns(target.columns);

  // Get current columns for snapshot before rollback
  const currentColumns = await getCurrentColumns(datasetId);

  return db.$transaction(async (tx) => {
    // 1. Create version snapshot of current state
    const latest = await tx.datasetSchemaVersion.findFirst({
      where: { datasetId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    const currentFingerprint = computeSchemaFingerprint(currentColumns);

    await tx.datasetSchemaVersion.create({
      data: {
        datasetId,
        version: nextVersion,
        columns: JSON.stringify(currentColumns),
        fingerprint: currentFingerprint,
        changedBy: userId,
        changeSource: "rollback",
        reason: `Rollback to version ${target.version}`,
      },
    });

    // 2. Soft-delete all current non-deleted columns
    await tx.datasetColumnDef.updateMany({
      where: { datasetId, isDeleted: false },
      data: { isDeleted: true },
    });

    // 3. Recreate columns from snapshot
    for (const col of targetColumns) {
      await tx.datasetColumnDef.upsert({
        where: { datasetId_columnId: { datasetId, columnId: col.columnId } },
        create: {
          datasetId,
          columnId: col.columnId,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          required: col.required,
          isDeleted: false,
        },
        update: {
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          required: col.required,
          isDeleted: false,
        },
      });
    }

    // 4. Update SheetMapping fingerprint if one exists
    const targetFingerprint = computeSchemaFingerprint(targetColumns);
    await tx.sheetMapping.updateMany({
      where: { datasetId },
      data: {
        schemaFingerprint: targetFingerprint,
        status: "active",
      },
    });

    return { newVersion: nextVersion + 1, columns: targetColumns };
  }).then(async (result) => {
    // Audit log outside transaction
    await logAudit({
      organizationId,
      actorId: userId,
      action: "rollback",
      entity: "dataset_schema",
      entityId: datasetId,
      before: { version: target.version + 1, columnCount: currentColumns.length },
      after: { version: target.version, columnCount: targetColumns.length },
      reason: `Schema rolled back to version ${target.version}`,
    });
    return result;
  });
}

// ── Initialize columns from schema fields ─────────────────────────────────────

/**
 * Seeds DatasetColumnDef rows from the existing SchemaField rows.
 * Called during the initial link of a dataset to Google Sheets.
 * Idempotent — skips columns that already exist.
 */
export async function initializeDatasetColumns(
  datasetId: string,
  userId: string,
  organizationId: string
): Promise<ColumnSpec[]> {
  // Check if already initialized
  const existing = await db.datasetColumnDef.findMany({
    where: { datasetId, isDeleted: false },
  });
  if (existing.length > 0) {
    return existing.map((c) => ({
      columnId: c.columnId,
      name: c.name,
      dataType: c.dataType,
      position: c.position,
      required: c.required,
    }));
  }

  // Load from Schema → SchemaField
  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    include: { schema: { include: { fields: { orderBy: { position: "asc" } } } } },
  });

  const fields = dataset?.schema?.fields ?? [];
  const { randomUUID } = await import("crypto");

  const columns: ColumnSpec[] = fields.map((f, i) => ({
    columnId: `col_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    name: f.name,
    dataType: mapSchemaFieldType(f.type),
    position: i,
    required: f.required,
  }));

  // If no schema fields, return empty (will be defined during import/link)
  if (!columns.length) return [];

  await db.$transaction(
    columns.map((col) =>
      db.datasetColumnDef.create({
        data: {
          datasetId,
          columnId: col.columnId,
          name: col.name,
          dataType: col.dataType,
          position: col.position,
          required: col.required,
        },
      })
    )
  );

  // Create initial schema version
  await createSchemaVersion(datasetId, columns, "initial", userId);

  return columns;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseColumns(raw: string): ColumnSpec[] {
  try {
    return JSON.parse(raw) as ColumnSpec[];
  } catch {
    return [];
  }
}

function mapSchemaFieldType(schemaType: string): string {
  const map: Record<string, string> = {
    text: "text",
    number: "number",
    date: "date",
    boolean: "boolean",
    enum: "enum",
    array: "text",
    multiselect: "text",
  };
  return map[schemaType] ?? "text";
}
