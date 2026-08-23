import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId } = await requireOrgContext(req);
    const { id: sourceId } = await params;

    // Verify source exists and belongs to org
    const source = await db.source.findUnique({
      where: { id: sourceId },
      select: { organizationId: true, datasetId: true },
    });

    if (!source || source.organizationId !== organizationId) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (!source.datasetId) {
      return NextResponse.json({ error: "Source has no dataset linked" }, { status: 404 });
    }

    // Check if the dataset is default
    const dataset = await db.dataset.findUnique({
      where: { id: source.datasetId },
      include: {
        schema: { include: { fields: true } },
      },
    });

    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    if (!dataset.isDefault) {
      // In a strict design, we might return 404 here, but maybe returning it is fine
      // Or we can query by isDefault: true explicitly on the source's organization if needed, 
      // but ensureDefaultDataset links the default dataset as source.datasetId.
      return NextResponse.json(
        { error: "Source's linked dataset is not a default dataset" },
        { status: 400 }
      );
    }

    return NextResponse.json(dataset);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch default dataset" },
      { status: 500 }
    );
  }
}
