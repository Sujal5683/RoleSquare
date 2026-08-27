import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/serialize";
import { requireRole, AuthError, authErrorResponse, verifyDatasetAccess } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    
    const dataset = await db.dataset.findUnique({ where: { id } });
    if (!dataset || !(await verifyDatasetAccess(dataset, organizationId, user.id, "read"))) {
      return NextResponse.json({ error: "Dataset not found or unauthorized" }, { status: 403 });
    }

    const { format } = await req.json();
    
    if (format !== "csv" && format !== "json") {
      return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }

    const count = await db.datasetRecord.count({ where: { datasetId: id } });

    return NextResponse.json({
      jobId: `exp-${Date.now()}`,
      downloadUrl: `/api/datasets/${id}/export?format=${format}`,
      recordCount: count
    });
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Auth check
    const { user, organizationId } = await requireRole(req, "member");
    const checkDataset = await db.dataset.findUnique({ where: { id } });
    if (!checkDataset || !(await verifyDatasetAccess(checkDataset, organizationId, user.id, "read"))) {
      return new NextResponse("Dataset not found or unauthorized", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format");

    const dataset = await db.dataset.findUnique({
      where: { id },
      include: {
        schema: { include: { fields: true } },
        records: { include: { values: true } },
      },
    });

    if (!dataset) {
      return new NextResponse("Dataset not found", { status: 404 });
    }

    const { records, schema } = dataset;
    const fields = schema?.fields || [];

    const normalizedData = records.map((r) => {
      const row: Record<string, any> = {
        _recordId: r.id,
        _status: r.status,
        _confidence: r.confidence,
        _createdAt: r.createdAt,
      };

      for (const field of fields) {
        const val = r.values.find((v) => v.fieldId === field.id);
        if (val) {
          const parsedVal = parseJson(val.value as any, null);
          row[field.name] = parsedVal !== null ? parsedVal : val.value;
        } else {
          row[field.name] = null;
        }
      }

      return row;
    });

    if (format === "json") {
      const jsonString = JSON.stringify(normalizedData, null, 2);
      return new NextResponse(jsonString, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${dataset.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_export.json"`,
        },
      });
    }

    if (format === "csv") {
      const headerRow = [
        "_recordId", "_status", "_confidence", "_createdAt",
        ...fields.map((f) => f.name),
      ];

      const csvRows = normalizedData.map((row) => {
        return headerRow
          .map((fieldName) => {
            let val = row[fieldName];
            if (val == null) return "";
            if (typeof val === "object") val = JSON.stringify(val);
            else val = String(val);
            
            val = val.replace(/"/g, '""');
            if (val.includes(",") || val.includes("\n") || val.includes('"')) {
              return `"${val}"`;
            }
            return val;
          })
          .join(",");
      });

      const csvString = [headerRow.join(","), ...csvRows].join("\n");
      return new NextResponse(csvString, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${dataset.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_export.csv"`,
        },
      });
    }

    return new NextResponse("Invalid format", { status: 400 });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return authErrorResponse(err);
    }
    return new NextResponse(err.message, { status: 500 });
  }
}
