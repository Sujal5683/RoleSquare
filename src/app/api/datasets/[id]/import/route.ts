// POST /api/datasets/[id]/import — creates dataset records from a CSV
// or JSON payload. The body should contain either:
//   { format: "csv", data: "field1,field2\nvalue1,value2" }
//   { format: "json", data: [{ field1: "value1", field2: "value2" }] }
//
// Field names in the data must match the schema field names. Values that
// don't match any field are ignored. All imported records are created
// with status="valid" and confidence=1.0 (human-verified import).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeDatasetRecord } from "@/lib/serialize";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const { id: datasetId } = await params;

    const body = await req.json();
    const format: string = body.format || "csv";
    const rawData: unknown = body.data;

    if (!rawData) {
      return NextResponse.json(
        { error: "Missing 'data' field in request body" },
        { status: 400 }
      );
    }

    // Fetch the dataset + schema fields
    const dataset = await db.dataset.findFirst({
      where: { id: datasetId },
      include: { schema: { include: { fields: true } } },
    });

    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const { verifyDatasetAccess } = await import("@/lib/auth");
    if (!(await verifyDatasetAccess(dataset, organizationId, user.id, "edit"))) {
      return NextResponse.json({ error: "Dataset not found or read-only access" }, { status: 403 });
    }

    if (!dataset.schema) {
      return NextResponse.json(
        { error: "Dataset has no schema assigned — cannot map CSV columns" },
        { status: 400 }
      );
    }

    const fields = dataset.schema.fields;
    const fieldByName = new Map(fields.map((f) => [f.name.toLowerCase(), f]));

    // Parse the data into a uniform format: array of { fieldName: value }
    let rows: Record<string, string>[] = [];

    if (format === "csv") {
      const text = String(rawData);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        return NextResponse.json(
          { error: "CSV needs at least a header row and one data row" },
          { status: 400 }
        );
      }
      // Parse CSV (simple parser — handles quoted fields with commas)
      const parseLine = (line: string): string[] => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
          } else {
            current += ch;
          }
        }
        result.push(current);
        return result;
      };

      const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
      for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = (values[idx] || "").trim();
        });
        rows.push(row);
      }
    } else if (format === "json") {
      if (!Array.isArray(rawData)) {
        return NextResponse.json(
          { error: "JSON data must be an array of objects" },
          { status: 400 }
        );
      }
      rows = rawData as Record<string, string>[];
    } else {
      return NextResponse.json(
        { error: `Unsupported format: ${format}. Use "csv" or "json".` },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }

    // Create records + values transactionally
    const created = await db.$transaction(async (tx) => {
      const records = [];
      for (const row of rows) {
        // Create the record
        const record = await tx.datasetRecord.create({
          data: {
            datasetId,
            status: "valid",
            confidence: 1.0,
            values: {
              create: fields
                .filter((f) => {
                  const val = row[f.name.toLowerCase()];
                  return val !== undefined && val !== "";
                })
                .map((f) => {
                  const val = row[f.name.toLowerCase()]!;
                  let parsedValue: unknown = val;
                  // Parse value based on field type
                  if (f.type === "number") {
                    parsedValue = Number(val);
                    if (Number.isNaN(parsedValue)) parsedValue = val;
                  } else if (f.type === "boolean") {
                    parsedValue = /^(true|yes|1|y)$/i.test(val);
                  } else if (f.type === "array" || f.type === "multiselect") {
                    parsedValue = val.split(";").map((s) => s.trim()).filter(Boolean);
                  } else if (f.type === "date") {
                    // Keep as string for ISO date
                    parsedValue = val;
                  }
                  return {
                    fieldId: f.id,
                    value: JSON.stringify(parsedValue),
                    confidence: 1.0,
                    evidence: "Imported via CSV/JSON upload",
                    sourceFile: "manual-import",
                    modelUsed: "manual",
                    promptVersion: "import",
                  };
                }),
            },
          },
          include: { values: true },
        });
        records.push(record as unknown as typeof records[0]);
      }

      // Update dataset record count
      await tx.dataset.update({
        where: { id: datasetId },
        data: { recordCount: { increment: rows.length } },
      });

      return records;
    });

    await logAudit({
      organizationId,
      actorType: "user",
      actorId: user.id,
      action: "create",
      entity: "record",
      entityId: datasetId,
      after: { count: created.length, format },
      reason: `Bulk import of ${created.length} records via ${format.toUpperCase()}`,
    });

    return NextResponse.json({
      imported: created.length,
      records: created.map(serializeDatasetRecord),
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
