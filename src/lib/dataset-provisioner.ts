// Workspace Intelligence Platform — Dataset Provisioner
//
// Ensures a Source always has a "Default Dataset" linked.
// The Default Dataset uses the Default Email Schema and is populated
// deterministically during a Gmail scan (no AI required).
//
// Also provides `writeDefaultDatasetRecord` to persist parsed email fields.

import { db } from "@/lib/db";
import { ensureDefaultSchema } from "@/lib/default-schema";
import type { ParsedEmailFields } from "@/lib/email-parser";

const DEFAULT_DATASET_SUFFIX = "(Default)";

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
    },
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  // If source already has a default dataset, return it
  if (source.datasetId) {
    const ds = await db.dataset.findUnique({
      where: { id: source.datasetId },
      select: { id: true, isDefault: true },
    });
    if (ds?.isDefault) return ds.id;
  }

  // Ensure the default schema exists
  const { id: schemaId } = await ensureDefaultSchema(source.organizationId);

  // Find or create the default dataset
  const existing = await db.dataset.findFirst({
    where: { organizationId: source.organizationId, isDefault: true },
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
        description: "Auto-created default dataset for deterministic email extraction",
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
  // Load schema fields so we can map field name → field id
  const schemaFields = await db.schemaField.findMany({
    where: { schemaId },
    select: { id: true, name: true },
  });
  const fieldIdByName = new Map(schemaFields.map((f) => [f.name, f.id]));

  // Check if a record already exists for this email in this dataset
  const existingRecord = await db.datasetRecord.findFirst({
    where: { datasetId, sourceEmailId: emailId },
    select: { id: true },
  });

  if (existingRecord) {
    // Update existing values
    for (const [name, value] of Object.entries(fields)) {
      const fieldId = fieldIdByName.get(name);
      if (!fieldId) continue;
      const rawValue = JSON.stringify(value ?? "");
      await db.datasetValue.updateMany({
        where: { recordId: existingRecord.id, fieldId },
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
        confidence: 1.0, // deterministic = 100% confidence
      },
    });

    const valuesToCreate = Object.entries(fields)
      .map(([name, value]) => {
        const fieldId = fieldIdByName.get(name);
        if (!fieldId) return null;
        return {
          recordId: record.id,
          fieldId,
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
