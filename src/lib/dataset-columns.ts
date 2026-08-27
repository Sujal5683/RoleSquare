// RoleSquare — Dataset Column Management
//
// The DatasetColumnDef table is the AUTHORITATIVE source of column definitions
// for a dataset. It is initialized from the schema's fields when a schema is
// first assigned, but remains independent thereafter.
//
// Key invariant: DatasetColumnDef.columnId === SchemaField.id (set in initializeDatasetColumns).
// This means DatasetValue.fieldId resolves through DatasetColumnDef, NOT SchemaField.

import { db } from "@/lib/db";

export interface ColumnDef {
  columnId: string;  // = SchemaField.id
  name: string;
  dataType: string;  // text | number | date | boolean | enum | array | multiselect
  position: number;
  required: boolean;
  options?: string[] | null;
  isDeleted: boolean;
}

/**
 * Returns the current column definitions for a dataset (non-deleted, ordered by position).
 * Falls back to the schema's fields if no DatasetColumnDef rows exist yet.
 */
export async function getDatasetColumns(datasetId: string, includeDeleted = false): Promise<ColumnDef[]> {
  const where: any = { datasetId };
  if (!includeDeleted) where.isDeleted = false;

  const cols = await db.datasetColumnDef.findMany({
    where,
    orderBy: { position: "asc" },
  });

  if (cols.length > 0) {
    return cols.map((c) => ({
      columnId: c.columnId,
      name: c.name,
      dataType: c.dataType,
      position: c.position,
      required: c.required,
      options: c.options ? JSON.parse(c.options) : null,
      isDeleted: c.isDeleted,
    }));
  }

  // No DatasetColumnDef rows exist yet — seed from schema fields
  const dataset = await db.dataset.findUnique({
    where: { id: datasetId },
    include: { schema: { include: { fields: { orderBy: { position: "asc" }, where: {} } } } },
  });

  if (!dataset?.schema?.fields?.length) return [];

  // Lazy-initialize column defs from schema
  await seedColumnsFromSchema(datasetId, dataset.schema.fields);

  // Re-query to return the freshly created rows
  const seeded = await db.datasetColumnDef.findMany({
    where: { datasetId, isDeleted: false },
    orderBy: { position: "asc" },
  });
  return seeded.map((c) => ({
    columnId: c.columnId,
    name: c.name,
    dataType: c.dataType,
    position: c.position,
    required: c.required,
    options: c.options ? JSON.parse(c.options) : null,
    isDeleted: c.isDeleted,
  }));
}

/**
 * Seeds DatasetColumnDef rows from schema fields.
 * Only creates rows that don't already exist (additive, never deletes).
 * Safe to call multiple times (idempotent).
 */
export async function seedColumnsFromSchema(
  datasetId: string,
  schemaFields: Array<{ id: string; name: string; type: string; position: number; required: boolean; options?: string | null }>
): Promise<void> {
  const existing = await db.datasetColumnDef.findMany({
    where: { datasetId },
    select: { columnId: true },
  });
  const existingIds = new Set(existing.map((c) => c.columnId));

  const maxPosition = existing.reduce((max, c: any) => {
    const col = c as any;
    return Math.max(max, col.position ?? 0);
  }, -1);

  let nextPosition = maxPosition + 1;
  const toCreate: Array<{
    datasetId: string;
    columnId: string;
    name: string;
    dataType: string;
    position: number;
    required: boolean;
    options?: string | null;
  }> = [];

  for (const field of schemaFields) {
    if (existingIds.has(field.id)) continue; // skip existing columns
    toCreate.push({
      datasetId,
      columnId: field.id, // CRITICAL: columnId = SchemaField.id
      name: field.name,
      dataType: mapFieldType(field.type),
      position: nextPosition++,
      required: field.required,
      options: field.options || null,
    });
  }

  if (toCreate.length > 0) {
    await db.datasetColumnDef.createMany({ data: toCreate, skipDuplicates: true });
  }
}

/**
 * Merges incoming field names with existing DatasetColumnDef rows.
 * - Fields that already exist as columns are returned (reuse existing columnId)
 * - Fields that don't exist are created as new DatasetColumnDef rows
 * - Existing columns are NEVER deleted or modified
 *
 * Returns a map of fieldName -> columnId for use when creating DatasetValue rows.
 */
export async function mergeAndGetColumnIds(
  datasetId: string,
  incomingFields: Array<{ id?: string; name: string; type: string; required?: boolean; options?: string | null }>
): Promise<Map<string, string>> {
  // Load all existing columns (including soft-deleted) so we can reuse IDs
  const existing = await db.datasetColumnDef.findMany({
    where: { datasetId },
  });

  const existingByColumnId = new Map(existing.map((c) => [c.columnId, c]));
  const existingByName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

  const resultMap = new Map<string, string>(); // fieldName -> columnId
  let nextPosition = existing.length > 0
    ? Math.max(...existing.map((c: any) => c.position)) + 1
    : 0;

  for (const field of incomingFields) {
    const nameLower = field.name.toLowerCase();
    const existingByIdCol = field.id ? existingByColumnId.get(field.id) : undefined;
    const existingByNameCol = existingByName.get(nameLower);

    if (existingByIdCol) {
      // Perfect match by ID — reuse
      if (existingByIdCol.isDeleted) {
        // Restore soft-deleted column
        await db.datasetColumnDef.update({
          where: { id: existingByIdCol.id },
          data: { isDeleted: false },
        });
      }
      resultMap.set(field.name, existingByIdCol.columnId);
    } else if (existingByNameCol) {
      // Match by name — reuse
      if (existingByNameCol.isDeleted) {
        await db.datasetColumnDef.update({
          where: { id: existingByNameCol.id },
          data: { isDeleted: false },
        });
      }
      resultMap.set(field.name, existingByNameCol.columnId);
    } else {
      // New column — create it
      const columnId = field.id ?? `col_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await db.datasetColumnDef.create({
        data: {
          datasetId,
          columnId,
          name: field.name,
          dataType: mapFieldType(field.type),
          position: nextPosition++,
          required: field.required ?? false,
          options: field.options || null,
          isDeleted: false,
        },
      });
      resultMap.set(field.name, columnId);
    }
  }

  return resultMap;
}

function mapFieldType(schemaType: string): string {
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
