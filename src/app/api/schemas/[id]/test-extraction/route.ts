// POST /api/schemas/[id]/test-extraction — runs AI extraction on a sample
//   text payload using the schema's fields. Body: { sampleText: string }.
//   Returns ExtractionResult. Increments ai_tokens usage for the org.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bumpUsageMetric } from "@/lib/usage";
import { extractWithLLM } from "@/lib/extraction";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const schema = await db.schema.findUnique({
      where: { id },
      include: { fields: { orderBy: { position: "asc" } } },
    });
    if (!schema || schema.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Schema not found" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sampleText = String(body?.sampleText ?? "");
    if (!sampleText) {
      return NextResponse.json(
        { error: "sampleText is required" },
        { status: 400 }
      );
    }

    const result = await extractWithLLM({
      fields: schema.fields.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description,
        instructions: f.instructions,
        required: f.required,
        options: f.options ? JSON.parse(f.options) : null,
      })),
      sourceText: sampleText,
      systemOverride: schema.promptTemplate || undefined,
    });

    if (result.tokensUsed > 0) {
      await bumpUsageMetric(organizationId, "ai_tokens", result.tokensUsed);
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "extract",
      entity: "schema",
      entityId: id,
      after: {
        fieldsExtracted: result.fields.length,
        tokensUsed: result.tokensUsed,
        overallConfidence: result.overallConfidence,
      },
      reason: "test_extraction",
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run test extraction" },
      { status: 500 }
    );
  }
}
