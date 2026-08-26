import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyDatasetAccess, requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
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
    const { user, organizationId } = await requireOrgContext(req);
    
    const dataset = await db.dataset.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    if (!dataset || !(await verifyDatasetAccess(dataset, organizationId, user.id, "edit"))) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, type = "text", required = false, options = [] } = body;

    if (!name) {
      return NextResponse.json({ error: "Column name is required" }, { status: 400 });
    }

    const colMap = await mergeAndGetColumnIds(id, [{
      name,
      type,
      required,
      options: options.length ? JSON.stringify(options) : null,
    }]);

    return NextResponse.json({ ok: true, columnId: colMap.get(name) });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json({ error: "Failed to create column" }, { status: 500 });
  }
}
