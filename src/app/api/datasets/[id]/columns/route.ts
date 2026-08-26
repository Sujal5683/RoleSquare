import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyDatasetAccess, requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { mergeAndGetColumnIds } from "@/lib/dataset-columns";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireOrgContext(req);
    
    const dataset = await db.dataset.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (!dataset || !(await verifyDatasetAccess(dataset, organizationId, user.id, "read"))) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const columns = await db.datasetColumnDef.findMany({
      where: { datasetId: id, isDeleted: false },
      orderBy: { position: "asc" },
    });

    return NextResponse.json(columns);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: "Failed to fetch columns" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    
    const dataset = await db.dataset.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (!dataset || !(await verifyDatasetAccess(dataset, organizationId, user.id, "edit"))) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, type = "text", required = false, options = [], position } = body;

    if (!name) {
      return NextResponse.json({ error: "Column name is required" }, { status: 400 });
    }

    const colMap = await mergeAndGetColumnIds(id, [{
      name,
      type,
      required,
      options: options.length ? JSON.stringify(options) : null,
    }]);

    const newColId = colMap.get(name);
    
    // If a specific position is requested, shift other columns and update the new one
    if (typeof position === "number" && newColId) {
      // First, get the internal database ID of the column we just created/restored
      const col = await db.datasetColumnDef.findFirst({
        where: { datasetId: id, columnId: newColId }
      });
      
      if (col) {
        // Shift everything at or after the target position forward by 1
        await db.datasetColumnDef.updateMany({
          where: { 
            datasetId: id, 
            position: { gte: position },
            id: { not: col.id } // exclude the one we're moving
          },
          data: { position: { increment: 1 } }
        });
        
        // Update the new column to be exactly at the target position
        await db.datasetColumnDef.update({
          where: { id: col.id },
          data: { position }
        });
      }
    }

    return NextResponse.json({ ok: true, columnId: newColId });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: "Failed to create column" }, { status: 500 });
  }
}
