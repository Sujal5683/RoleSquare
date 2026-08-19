// POST /api/datasets/[id]/export — kick off an export job.
//   Body: { format: "csv" | "json" | "xlsx" }
//   Creates an EXPORT ai_job and returns the job id. For small datasets
//   (<=500 records) and CSV format, also returns a synthetic data URL
//   containing the flattened CSV payload so the UI can offer an immediate
//   download without waiting for the job to finish.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bumpUsageMetric } from "@/lib/usage";

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.join("; ")
        : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    const dataset = await db.dataset.findUnique({
      where: { id },
      include: { schema: { include: { fields: { orderBy: { position: "asc" } } } } },
    });
    if (!dataset || dataset.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Dataset not found" },
        { status: 404 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const format =
      body?.format === "json" || body?.format === "xlsx" ? body.format : "csv";

    const now = new Date();
    const job = await db.aiJob.create({
      data: {
        organizationId,
        userId: user.id,
        type: "EXPORT",
        status: "queued",
        payload: JSON.stringify({ datasetId: id, format, datasetName: dataset.name }),
        progress: 0,
      },
    });

    await bumpUsageMetric(organizationId, "exports", 1);

    // For small CSV exports, generate a synthetic data URL the client can
    // open directly. Cap at 500 records to keep the URL under a sane size.
    let downloadUrl: string | undefined;
    let recordCount = 0;
    if (format === "csv") {
      const fields = dataset.schema?.fields ?? [];
      const records = await db.datasetRecord.findMany({
        where: { datasetId: id },
        include: { values: true },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
      recordCount = records.length;

      const header = ["recordId", "status", "confidence", ...fields.map((f) => f.name)];
      const rows = records.map((r) => {
        const byField = new Map(r.values.map((v) => [v.fieldId, v]));
        return [
          r.id,
          r.status,
          String(r.confidence ?? 0),
          ...fields.map((f) => {
            const v = byField.get(f.id);
            if (!v) return "";
            try {
              return csvEscape(JSON.parse(v.value));
            } catch {
              return csvEscape(v.value);
            }
          }),
        ];
      });
      const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
      downloadUrl =
        "data:text/csv;base64," +
        Buffer.from(csv, "utf-8").toString("base64");
    }

    // Mark job as success for small synchronous exports.
    if (downloadUrl) {
      await db.aiJob.update({
        where: { id: job.id },
        data: {
          status: "success",
          progress: 100,
          finishedAt: now,
          result: JSON.stringify({ format, recordCount, downloadUrl: !!downloadUrl }),
        },
      });
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "export",
      entity: "dataset",
      entityId: id,
      after: { format, jobId: job.id, recordCount },
    });

    return NextResponse.json({
      jobId: job.id,
      format,
      recordCount,
      downloadUrl,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start export" },
      { status: 500 }
    );
  }
}
