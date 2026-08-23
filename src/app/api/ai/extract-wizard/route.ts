// POST /api/ai/extract-wizard
//
// Launches a two-step AI extraction from a source dataset into a target dataset.
// Body:
//   sourceDatasetId    — the Default/raw dataset to read from
//   schemaId           — the extraction schema to apply
//   targetDatasetId?   — existing custom dataset to append to
//   targetDatasetName? — name for new dataset (used if targetDatasetId omitted)
//   agentKeys?         — subset of agents to run (defaults to all)
//   extraInstructions? — appended to the extraction prompt
//
// Returns: { jobId, targetDatasetId }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ensureJobRunnerStarted } from "@/lib/job-runner";

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));

    const sourceDatasetId = String(body?.sourceDatasetId ?? "").trim();
    const schemaId = String(body?.schemaId ?? "").trim();
    const targetDatasetName = String(body?.targetDatasetName ?? "").trim();
    let targetDatasetId = String(body?.targetDatasetId ?? "").trim();
    const agentKeys: string[] = Array.isArray(body?.agentKeys) ? body.agentKeys : [];
    const extraInstructions = String(body?.extraInstructions ?? "").trim();

    if (!sourceDatasetId || !schemaId) {
      return NextResponse.json(
        { error: "sourceDatasetId and schemaId are required" },
        { status: 400 }
      );
    }

    // Verify source dataset exists and belongs to org
    const sourceDataset = await db.dataset.findUnique({
      where: { id: sourceDatasetId },
      select: { id: true, organizationId: true, name: true, recordCount: true },
    });
    if (!sourceDataset || sourceDataset.organizationId !== organizationId) {
      return NextResponse.json({ error: "Source dataset not found" }, { status: 404 });
    }

    // Verify schema exists and belongs to org
    const schema = await db.schema.findUnique({
      where: { id: schemaId },
      select: { id: true, organizationId: true, name: true, fields: { select: { id: true } } },
    });
    if (!schema || schema.organizationId !== organizationId) {
      return NextResponse.json({ error: "Schema not found" }, { status: 404 });
    }
    if (!schema.fields.length) {
      return NextResponse.json({ error: "Schema has no fields" }, { status: 400 });
    }

    // Resolve or create the target dataset
    if (targetDatasetId) {
      const existing = await db.dataset.findUnique({
        where: { id: targetDatasetId },
        select: { id: true, organizationId: true },
      });
      if (!existing || existing.organizationId !== organizationId) {
        return NextResponse.json({ error: "Target dataset not found" }, { status: 404 });
      }
    } else {
      const name = targetDatasetName || `${schema.name} — Extracted ${new Date().toLocaleDateString()}`;
      const created = await db.dataset.create({
        data: {
          organizationId,
          schemaId,
          createdBy: user.id,
          name,
          description: `AI-extracted from "${sourceDataset.name}" using schema "${schema.name}"`,
          isDefault: false,
          datasetType: "custom",
        },
      });
      targetDatasetId = created.id;
    }

    // Queue the AI_EXTRACTION job
    const job = await db.aiJob.create({
      data: {
        organizationId,
        userId: user.id,
        type: "AI_EXTRACTION",
        status: "queued",
        agentKey: agentKeys.length > 0 ? agentKeys[0] : "extractor",
        payload: JSON.stringify({
          sourceDatasetId,
          targetDatasetId,
          targetSchemaId: schemaId,
          agentKeys,
          extraInstructions,
        }),
        progress: 0,
      },
    });

    // Ensure job runner is started
    ensureJobRunnerStarted();

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "extract",
      entity: "dataset",
      entityId: targetDatasetId,
      after: { sourceDatasetId, schemaId, targetDatasetId, jobId: job.id },
    });

    return NextResponse.json(
      { jobId: job.id, targetDatasetId },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start extraction" },
      { status: 500 }
    );
  }
}
