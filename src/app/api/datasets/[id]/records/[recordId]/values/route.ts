import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, verifyDatasetAccess, AuthError, authErrorResponse } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  try {
    const { id, recordId } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    
    const dataset = await db.dataset.findUnique({ where: { id } });
    if (!dataset || !(await verifyDatasetAccess(dataset, organizationId, user.id, "edit"))) {
      return NextResponse.json({ error: "Not found or no edit access" }, { status: 403 });
    }
    
    const body = await req.json();
    const { fieldId, value, confidence, evidence } = body;
    
    if (!fieldId) {
      return NextResponse.json({ error: "fieldId is required" }, { status: 400 });
    }

    // Check if the record belongs to the dataset
    const record = await db.datasetRecord.findUnique({ where: { id: recordId } });
    if (!record || record.datasetId !== id) {
       return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    
    const newValue = await db.datasetValue.create({
      data: {
        recordId,
        fieldId,
        value: JSON.stringify(value),
        confidence: confidence ?? 1.0,
        evidence: evidence || "Manual entry",
        modelUsed: "manual",
        correctedAt: new Date(),
        correctedBy: user.id,
      },
    });
    
    return NextResponse.json({
      ...newValue,
      value: JSON.parse(newValue.value),
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create value" },
      { status: 500 }
    );
  }
}
