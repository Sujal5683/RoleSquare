import { db } from "@/lib/db";
import { SourceType } from "./types";

const SCHEMAS: Record<SourceType, { name: string; description: string; fields: Array<{ name: string; type: string; description: string; position: number }> }> = {
  gmail: {
    name: "Default Email Schema",
    description: "Auto-generated schema for deterministic email field extraction",
    fields: [
      { name: "Date", type: "date", description: "Email received date", position: 0 },
      { name: "Sender", type: "text", description: "From address", position: 1 },
      { name: "To", type: "text", description: "Primary recipient(s)", position: 2 },
      { name: "CC", type: "text", description: "CC addresses (comma-separated)", position: 3 },
      { name: "Subject", type: "text", description: "Email subject line", position: 4 },
      { name: "Body", type: "text", description: "Main email body text", position: 5 },
      { name: "Signature", type: "text", description: "Detected signature / footer block", position: 6 },
      { name: "Attachments Summary", type: "text", description: "e.g. '3 attachments: report.pdf (pdf)'", position: 7 },
      { name: "Drive Links", type: "text", description: "Google Drive/Docs/Sheets URLs", position: 8 },
      { name: "Form Links", type: "text", description: "Google Forms URLs", position: 9 },
      { name: "Other Links", type: "text", description: "All other hyperlinks", position: 10 },
    ]
  },
  drive: {
    name: "Default Drive Schema",
    description: "Auto-generated schema for Google Drive file metadata",
    fields: [
      { name: "File Name", type: "text", description: "Name of the file", position: 0 },
      { name: "Mime Type", type: "text", description: "File mime type", position: 1 },
      { name: "Owner", type: "text", description: "Owner of the file", position: 2 },
      { name: "Last Modified", type: "date", description: "Last modified date", position: 3 },
      { name: "Content Preview", type: "text", description: "Extracted text content preview", position: 4 },
    ]
  },
  docs: {
    name: "Default Docs Schema",
    description: "Auto-generated schema for Google Docs",
    fields: [
      { name: "Document Title", type: "text", description: "Title of the document", position: 0 },
      { name: "Content", type: "text", description: "Extracted document text", position: 1 },
      { name: "Links", type: "text", description: "Extracted links from document", position: 2 },
    ]
  },
  sheets: {
    name: "Default Sheets Schema",
    description: "Auto-generated schema for Google Sheets rows",
    fields: [
      { name: "Spreadsheet Title", type: "text", description: "Title of spreadsheet", position: 0 },
      { name: "Sheet Name", type: "text", description: "Name of the sheet tab", position: 1 },
      { name: "Row Index", type: "number", description: "Row number", position: 2 },
      { name: "Row Data", type: "text", description: "JSON string of row values", position: 3 },
    ]
  },
  forms: {
    name: "Default Forms Schema",
    description: "Auto-generated schema for Google Form responses",
    fields: [
      { name: "Form Title", type: "text", description: "Title of the form", position: 0 },
      { name: "Submitter Email", type: "text", description: "Email of the submitter", position: 1 },
      { name: "Submitted At", type: "date", description: "Submission timestamp", position: 2 },
      { name: "Answers", type: "text", description: "JSON string of form answers", position: 3 },
    ]
  }
};

export async function ensureDefaultSchema(organizationId: string, sourceType: SourceType = "gmail"): Promise<{ id: string }> {
  const schemaDef = SCHEMAS[sourceType] || SCHEMAS.gmail;
  
  const existing = await db.schema.findFirst({
    where: { organizationId, isDefault: true, name: schemaDef.name },
    select: { id: true },
  });
  if (existing) return existing;

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
        name: schemaDef.name,
        description: schemaDef.description,
        isDefault: true,
        datasetType: "default",
        version: 1,
      },
    });

    await tx.schemaField.createMany({
      data: schemaDef.fields.map((f) => ({
        schemaId: schema.id,
        name: f.name,
        type: f.type,
        description: f.description,
        required: false,
        position: f.position,
        confidenceThreshold: 1.0,
      })),
    });

    return { id: schema.id };
  });
}
