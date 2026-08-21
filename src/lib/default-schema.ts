// Workspace Intelligence Platform — Default Schema Provisioner
//
// Ensures every organization has a single "Default Email Schema" that mirrors
// all deterministic fields parsed from Gmail messages.
// This schema is system-owned (isDefault=true) and must not be deleted by users.
//
// Fields (all deterministic — zero AI tokens required):
//   date, sender, to, cc, subject, body, signature,
//   attachments_summary, drive_links, form_links, other_links

import { db } from "@/lib/db";

// Field definitions for the default email schema.
// These match what `emailParser.ts` deterministically extracts.
const DEFAULT_FIELDS = [
  { name: "Date",               type: "date",   description: "Email received date",                    position: 0 },
  { name: "Sender",             type: "text",   description: "From address",                            position: 1 },
  { name: "To",                 type: "text",   description: "Primary recipient(s)",                    position: 2 },
  { name: "CC",                 type: "text",   description: "CC addresses (comma-separated)",          position: 3 },
  { name: "Subject",            type: "text",   description: "Email subject line",                      position: 4 },
  { name: "Body",               type: "text",   description: "Main email body text",                    position: 5 },
  { name: "Signature",          type: "text",   description: "Detected signature / footer block",       position: 6 },
  { name: "Attachments Summary",type: "text",   description: "e.g. '3 attachments: report.pdf (pdf)'", position: 7 },
  { name: "Drive Links",        type: "text",   description: "Google Drive/Docs/Sheets URLs",           position: 8 },
  { name: "Form Links",         type: "text",   description: "Google Forms URLs",                       position: 9 },
  { name: "Other Links",        type: "text",   description: "All other hyperlinks",                    position: 10 },
] as const;

const DEFAULT_SCHEMA_NAME = "Default Email Schema";

/**
 * Returns the existing default schema for the org, creating it if it doesn't exist.
 * Idempotent — safe to call on every Source creation.
 */
export async function ensureDefaultSchema(organizationId: string): Promise<{ id: string }> {
  const existing = await db.schema.findFirst({
    where: { organizationId, isDefault: true },
    select: { id: true },
  });
  if (existing) return existing;

  // Find the org owner to set as createdBy
  const owner = await db.organizationMember.findFirst({
    where: { organizationId, role: "owner" },
    select: { userId: true },
  });
  const createdBy = owner?.userId ?? (await db.user.findFirst({ select: { id: true } }))?.id;
  if (!createdBy) throw new Error("Cannot provision default schema: no user found for org");

  return db.$transaction(async (tx) => {
    const schema = await tx.schema.create({
      data: {
        organizationId,
        createdBy,
        name: DEFAULT_SCHEMA_NAME,
        description: "Auto-generated schema for deterministic email field extraction",
        isDefault: true,
        datasetType: "default",
        version: 1,
      },
    });

    await tx.schemaField.createMany({
      data: DEFAULT_FIELDS.map((f) => ({
        schemaId: schema.id,
        name: f.name,
        type: f.type,
        description: f.description,
        required: false,
        position: f.position,
        confidenceThreshold: 1.0, // deterministic = always 100% confident
      })),
    });

    return { id: schema.id };
  });
}
