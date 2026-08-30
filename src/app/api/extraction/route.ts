// POST /api/extraction — the primary AI extraction endpoint.
//   Body: { schemaId, sourceText, sourceFile? }
//
// Loads the schema + fields, calls the shared LLM extraction helper with a
// schema-aware prompt, validates the result against the schema's field
// names (drops any fabricated fields), increments ai_tokens usage for the
// org, and returns the ExtractionResult. An audit log entry is recorded
// so the extraction trail is preserved.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bumpUsageMetric } from "@/lib/usage";
import { extractWithLLM, flagFieldsForReview } from "@/lib/extraction";
import { dispatchWebhookEvent } from "@/lib/webhook-dispatcher";

import type { ExtractionFieldResult } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    // Ensure the in-process job runner is alive so any queued AI jobs are
    fetch(new URL("/api/jobs/process", req.url).toString(), { method: "POST" }).catch(() => {});
    const { user, organizationId } = await requireRole(req, "member");
    const body = await req.json().catch(() => ({}));
    const schemaId = String(body?.schemaId ?? "").trim();
    const sourceText = String(body?.sourceText ?? "");
    const sourceFile = body?.sourceFile ? String(body.sourceFile) : undefined;

    if (!schemaId) {
      return NextResponse.json(
        { error: "schemaId is required" },
        { status: 400 }
      );
    }
    if (!sourceText) {
      return NextResponse.json(
        { error: "sourceText is required" },
        { status: 400 }
      );
    }

    try {
      const { checkUserLimits } = await import("@/lib/usage");
      await checkUserLimits(user.id, "tokens");
      await checkUserLimits(user.id, "records");
    } catch (limitErr) {
      return NextResponse.json(
        { error: limitErr instanceof Error ? limitErr.message : "Usage limit exceeded" },
        { status: 403 }
      );
    }

    const schema = await db.schema.findUnique({
      where: { id: schemaId },
      include: { fields: { orderBy: { position: "asc" } } },
    });
    if (!schema || schema.organizationId !== organizationId) {
      return NextResponse.json(
        { error: "Schema not found" },
        { status: 404 }
      );
    }

    const result = await extractWithLLM({
      fields: schema.fields.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description,
        instructions: f.instructions,
        required: f.required,
        options: f.options ? (JSON.parse(f.options) as string[]) : null,
        confidenceThreshold: f.confidenceThreshold,
      })),
      sourceText,
      sourceFile,
      systemOverride: schema.promptTemplate || undefined,
    });

    // Validate the LLM output against the schema's field names. Drop any
    // fabricated fields that don't exist in the schema.
    const validFieldNames = new Set(schema.fields.map((f) => f.name));
    const validatedFields: ExtractionFieldResult[] = result.fields.filter(
      (f) => validFieldNames.has(f.fieldName)
    );

    // Flag fields that fall below their per-field confidence threshold.
    const reviewFlags = flagFieldsForReview(validatedFields, schema.fields.map((f) => ({
      name: f.name,
      type: f.type,
      description: f.description,
      instructions: f.instructions,
      required: f.required,
      options: f.options ? (JSON.parse(f.options) as string[]) : undefined,
      confidenceThreshold: f.confidenceThreshold,
    })));
    const fieldsNeedingReview = reviewFlags.filter((f) => f.needsReview).length;

    if (result.tokensUsed > 0) {
      await bumpUsageMetric(organizationId, "ai_tokens", result.tokensUsed);
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "extract",
      entity: "schema",
      entityId: schemaId,
      after: {
        fieldsExtracted: validatedFields.length,
        tokensUsed: result.tokensUsed,
        overallConfidence: result.overallConfidence,
        sourceFile,
        fieldsNeedingReview,
      },
    });

    // Dispatch webhook events for extraction completion and review needed
    dispatchWebhookEvent({
      event: "extraction.completed",
      organizationId,
      data: {
        schemaId,
        fieldsExtracted: validatedFields.length,
        tokensUsed: result.tokensUsed,
        overallConfidence: result.overallConfidence,
        sourceFile,
      },
    });

    if (fieldsNeedingReview > 0) {
      dispatchWebhookEvent({
        event: "review.needed",
        organizationId,
        data: {
          schemaId,
          fieldsNeedingReview,
          reviewFlags: reviewFlags.filter((f) => f.needsReview),
        },
      });
    }

    return NextResponse.json({
      ...result,
      fields: validatedFields,
      reviewFlags,
      fieldsNeedingReview,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run extraction" },
      { status: 500 }
    );
  }
}
