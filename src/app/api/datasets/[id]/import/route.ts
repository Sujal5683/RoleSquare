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
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { serializeDatasetRecord } from "@/lib/serialize";
import { mergeAndGetColumnIds } from "@/lib/dataset-columns";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireRole(req, "member");
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

    // Fetch the dataset
    const dataset = await db.dataset.findFirst({
      where: { id: datasetId },
    });

    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const { verifyDatasetAccess } = await import("@/lib/auth");
    if (!(await verifyDatasetAccess(dataset, organizationId, user.id, "edit"))) {
      return NextResponse.json({ error: "Dataset not found or read-only access" }, { status: 403 });
    }

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

      const headers = parseLine(lines[0]).map((h) => h.trim());
      for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          if (header) {
            row[header] = (values[idx] || "").trim();
          }
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

    // Determine the unique headers across all rows
    const allHeaders = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        allHeaders.add(key);
      }
    }

    const incomingFields = Array.from(allHeaders).map(name => ({
      name,
      type: "text" // Default everything to text for imports unless they match an existing schema
    }));

    // This handles mapping names to column IDs (or creating new columns if missing)
    const columnIdMap = await mergeAndGetColumnIds(datasetId, incomingFields);

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
              create: Array.from(allHeaders)
                .filter(h => {
                  const val = row[h];
                  return val !== undefined && val !== null && val !== "";
                })
                .map(h => {
                  return {
                    fieldId: columnIdMap.get(h)!,
                    value: row[h],
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
