// RoleSquare — Dataset Provisioner
//
// Ensures a Source always has a "Default Dataset" linked.
// The Default Dataset uses the Default Email Schema and is populated
// deterministically during a Gmail scan (no AI required).
//
// Also provides `writeDefaultDatasetRecord` to persist parsed email fields.

import { db } from "@/lib/db";
import { ensureDefaultSchema } from "@/lib/default-schema";
import type { ParsedEmailFields } from "@/lib/email-parser";
import { mergeAndGetColumnIds } from "@/lib/dataset-columns";

const DEFAULT_DATASET_SUFFIX = "(Default)";

/**
 * Ensures an organization has the default dataset (and schema) created immediately.
 * Idempotent — safe to call on organization creation.
 */
export async function ensureOrgDefaultDataset(organizationId: string, createdBy: string): Promise<string> {
  const { id: schemaId } = await ensureDefaultSchema(organizationId);

  const existing = await db.dataset.findFirst({
    where: { organizationId, isDefault: true },
    select: { id: true },
  });

  if (existing) return existing.id;

  const ds = await db.dataset.create({
    data: {
      organizationId,
      schemaId,
      createdBy,
      name: "Default Email Dataset",
      description: "Auto-created default dataset for deterministic email extraction",
      isDefault: true,
      datasetType: "default",
    },
  });

  return ds.id;
}

/**
 * Returns the existing default dataset for a source, or creates one.
 * Links the default schema to the source if not already linked.
 * Idempotent — safe to call on every scan.
 */
export async function ensureDefaultDataset(sourceId: string): Promise<string> {
  const source = await db.source.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      ownerUserId: true,
      datasetId: true,
      sourceType: true,
    },
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  // If source already has a dataset, return it. Do not overwrite custom datasets.
  if (source.datasetId) {
    return source.datasetId;
  }

  // Ensure the default schema exists
  const { id: schemaId } = await ensureDefaultSchema(source.organizationId, source.sourceType as any);

  // Find or create the default dataset
  const existing = await db.dataset.findFirst({
    where: { organizationId: source.organizationId, isDefault: true, schemaId },
    select: { id: true },
  });

  let datasetId: string;
  if (existing) {
    datasetId = existing.id;
  } else {
    const ds = await db.dataset.create({
      data: {
        organizationId: source.organizationId,
        schemaId,
        createdBy: source.ownerUserId,
        name: `${source.name} ${DEFAULT_DATASET_SUFFIX}`,
        description: `Auto-created default dataset for ${source.sourceType} extraction`,
        isDefault: true,
        datasetType: "default",
      },
    });
    datasetId = ds.id;
  }

  // Link the source to the default dataset and schema
  await db.source.update({
    where: { id: sourceId },
    data: { datasetId, schemaId },
  });

  return datasetId;
}

/**
 * Writes a parsed email as a DatasetRecord + DatasetValues into the default dataset.
 * Uses `upsert` on the email ID so re-runs are idempotent.
 */
export async function writeDefaultDatasetRecord(
  emailId: string,
  datasetId: string,
  fields: ParsedEmailFields,
  schemaId: string
): Promise<void> {
  // Load schema fields to get types for column creation
  const schemaFields = await db.schemaField.findMany({
    where: { schemaId },
    select: { id: true, name: true, type: true, required: true, isHidden: true },
  });

  // Filter out hidden fields — user has opted to not include them in their dataset
  const visibleFields = schemaFields.filter((f) => !f.isHidden);

  // Merge incoming fields with DatasetColumnDef (additive — never removes columns)
  const incomingFieldSpecs = visibleFields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    required: f.required,
  }));
  const columnIdByName = await mergeAndGetColumnIds(datasetId, incomingFieldSpecs);

  // Check if a record already exists for this email in this dataset
  const existingRecord = await db.datasetRecord.findFirst({
    where: { datasetId, sourceEmailId: emailId },
    select: { id: true },
  });

  if (existingRecord) {
    // Update existing values
    for (const [name, value] of Object.entries(fields)) {
      const columnId = columnIdByName.get(name);
      if (!columnId) continue;
      const rawValue = JSON.stringify(value ?? "");
      await db.datasetValue.updateMany({
        where: { recordId: existingRecord.id, fieldId: columnId },
        data: { value: rawValue },
      });
    }
    return;
  }

  // Create new record + values in a transaction
  await db.$transaction(async (tx) => {
    const record = await tx.datasetRecord.create({
      data: {
        datasetId,
        sourceEmailId: emailId,
        status: "valid",
        confidence: 1.0,
      },
    });

    const valuesToCreate = Object.entries(fields)
      .map(([name, value]) => {
        const columnId = columnIdByName.get(name);
        if (!columnId) return null;
        return {
          recordId: record.id,
          fieldId: columnId,
          value: JSON.stringify(value ?? ""),
          confidence: 1.0,
          evidence: "Deterministically extracted from Gmail API",
          modelUsed: "deterministic",
          promptVersion: "v1",
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (valuesToCreate.length > 0) {
      await tx.datasetValue.createMany({ data: valuesToCreate });
    }

    await tx.dataset.update({
      where: { id: datasetId },
      data: { recordCount: { increment: 1 } },
    });
  });
}

/**
 * Writes a batch of parsed emails as DatasetRecord + DatasetValues into the default dataset.
 * Skips records that already exist for their respective sourceEmailId.
 */
export async function writeDefaultDatasetRecordsBulk(
  emailBatch: { emailId: string; fields: ParsedEmailFields }[],
  datasetId: string,
  schemaId: string
): Promise<{ recordsCreated: number }> {
  if (emailBatch.length === 0) return { recordsCreated: 0 };

  // Load schema fields to get types for column creation
  const schemaFields = await db.schemaField.findMany({
    where: { schemaId },
    select: { id: true, name: true, type: true, required: true, isHidden: true },
  });

  // Filter out hidden fields — user has opted to not include them in their dataset
  const visibleFields = schemaFields.filter((f) => !f.isHidden);

  // Merge incoming fields with DatasetColumnDef (additive — never removes columns)
  const incomingFieldSpecs = visibleFields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    required: f.required,
  }));
  const columnIdByName = await mergeAndGetColumnIds(datasetId, incomingFieldSpecs);

  // Check which records already exist to avoid duplicates
  const emailIds = emailBatch.map(e => e.emailId);
  const existingRecords = await db.datasetRecord.findMany({
    where: { datasetId, sourceEmailId: { in: emailIds } },
    select: { sourceEmailId: true },
  });
  const existingEmailIds = new Set(existingRecords.map(r => r.sourceEmailId));

  // Filter out existing emails
  const newEmails = emailBatch.filter(e => !existingEmailIds.has(e.emailId));
  if (newEmails.length === 0) {
    return { recordsCreated: 0 };
  }

  // Create new records + values in a transaction
  return await db.$transaction(async (tx) => {
    // 1. Bulk insert records and return them to get their IDs
    const records = await tx.datasetRecord.createManyAndReturn({
      data: newEmails.map(e => ({
        datasetId,
        sourceEmailId: e.emailId,
        status: "valid",
        confidence: 1.0,
      })),
      select: { id: true, sourceEmailId: true },
    });

    const recordIdByEmailId = new Map(records.map(r => [r.sourceEmailId, r.id]));

    // 2. Prepare values for all new records
    const valuesToCreate = newEmails.flatMap(e => {
      const recordId = recordIdByEmailId.get(e.emailId);
      if (!recordId) return [];
      
      return Object.entries(e.fields)
        .map(([name, value]) => {
          const columnId = columnIdByName.get(name);
          if (!columnId) return null;
          return {
            recordId: recordId,
            fieldId: columnId,
            value: JSON.stringify(value ?? ""),
            confidence: 1.0,
            evidence: "Deterministically extracted from Gmail API",
            modelUsed: "deterministic",
            promptVersion: "v1",
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);
    });

    // 3. Bulk insert values
    if (valuesToCreate.length > 0) {
      await tx.datasetValue.createMany({ data: valuesToCreate });
    }

    // 4. Update dataset count
    await tx.dataset.update({
      where: { id: datasetId },
      data: { recordCount: { increment: records.length } },
    });

    return { recordsCreated: records.length };
  }, { maxWait: 10000, timeout: 30000 });
}
