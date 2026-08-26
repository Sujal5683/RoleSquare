import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyDatasetAccess, requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> }
) {
  try {
    const { id, columnId } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    
    const dataset = await db.dataset.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (!dataset || !(await verifyDatasetAccess(dataset, organizationId, user.id, "edit"))) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    // Soft delete the column
    await db.datasetColumnDef.updateMany({
      where: { datasetId: id, columnId },
      data: { isDeleted: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: "Failed to delete column" }, { status: 500 });
  }
}
