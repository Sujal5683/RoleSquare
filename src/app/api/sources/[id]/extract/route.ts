// POST /api/sources/[id]/extract
//
// Triggers an AI_EXTRACTION job (Mode B — two-step pipeline) for a source.
// Reads records from the source's Default Dataset and populates a Custom Dataset
// using the provided schema. Creates the Custom Dataset if needed.
//
// Body: { schemaId: string, datasetId?: string, datasetName?: string }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { logAudit } from "@/lib/audit";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");

    // Validate source
    const source = await db.source.findUnique({ where: { id } });
    if (!source || source.organizationId !== organizationId) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { schemaId, datasetId: existingDatasetId, datasetName } = body as {
      schemaId?: string;
      datasetId?: string;
      datasetName?: string;
    };

    if (!schemaId) {
      return NextResponse.json({ error: "schemaId is required" }, { status: 400 });
    }

    // Validate schema belongs to this org
    const schema = await db.schema.findUnique({ where: { id: schemaId } });
    if (!schema || schema.organizationId !== organizationId) {
      return NextResponse.json({ error: "Schema not found" }, { status: 404 });
    }

    // Ensure source has a Default Dataset to read from
    if (!source.datasetId) {
      return NextResponse.json(
        { error: "Source has no default dataset. Run a scan first." },
        { status: 400 }
      );
    }

    const { verifyDatasetWriteAccess } = await import("@/lib/dataset-access");
    const canEditSource = await verifyDatasetWriteAccess(source.datasetId, user.id, organizationId);
    if (!canEditSource) {
      return NextResponse.json(
        { error: "You do not have write access to the source dataset." },
        { status: 403 }
      );
    }

    // Get or create the target Custom Dataset
    let targetDatasetId: string;
    if (existingDatasetId) {
      const ds = await db.dataset.findUnique({ where: { id: existingDatasetId } });
      if (!ds) {
        return NextResponse.json({ error: "Target dataset not found" }, { status: 404 });
      }
      
      const { verifyDatasetWriteAccess } = await import("@/lib/dataset-access");
      const canEdit = await verifyDatasetWriteAccess(existingDatasetId, user.id, organizationId);
      if (!canEdit) {
        return NextResponse.json(
          { error: "You do not have write access to the selected target dataset." },
          { status: 403 }
        );
      }
      targetDatasetId = existingDatasetId;
    } else {
      const name = datasetName || `${source.name} — ${schema.name}`;
      const ds = await db.dataset.create({
        data: {
          organizationId,
          createdBy: user.id,
          schemaId,
          name,
          description: `AI-extracted from ${source.name} using schema "${schema.name}"`,
          isDefault: false,
          datasetType: "custom",
        },
      });
      targetDatasetId = ds.id;
    }

    // Queue the AI_EXTRACTION job (Mode B)
    try {
      const { checkUserLimits } = await import("@/lib/usage");
      await checkUserLimits(user.id, "jobs");
      await checkUserLimits(user.id, "tokens");
      await checkUserLimits(user.id, "records");
    } catch (limitErr) {
      return NextResponse.json(
        { error: limitErr instanceof Error ? limitErr.message : "Usage limit exceeded" },
        { status: 403 }
      );
    }

    const job = await db.aiJob.create({
      data: {
        organizationId,
        userId: user.id,
        type: "AI_EXTRACTION",
        status: "queued",
        payload: JSON.stringify({
          sourceDatasetId: source.datasetId,
          targetDatasetId,
          targetSchemaId: schemaId,
        }),
        progress: 0,
      },
    });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "extract",
      entity: "source",
      entityId: id,
      after: { schemaId, targetDatasetId, jobId: job.id },
    });

    fetch(new URL("/api/jobs/process", req.url).toString(), { method: "POST" }).catch(() => {});

    return NextResponse.json(
      { jobId: job.id, targetDatasetId, message: "AI extraction queued" },
      { status: 202 }
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger extraction" },
      { status: 500 }
    );
  }
}
