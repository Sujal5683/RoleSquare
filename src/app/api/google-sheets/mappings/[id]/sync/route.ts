// POST /api/google-sheets/mappings/[id]/sync
// Triggers a manual sync for a SheetMapping.
// Runs asynchronously via the job runner.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { runSync } from "@/lib/services/sync-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireRole(req, "member");

    // IDOR: verify mapping belongs to this org
    const mapping = await db.sheetMapping.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }
    if (mapping.status === "unlinked") {
      return NextResponse.json(
        { error: "Cannot sync an unlinked mapping" },
        { status: 400 }
      );
    }

    // Run sync — in production this should be enqueued to the job runner.
    // Here we run it in the background and return immediately.
    runSync(id, "manual").catch((err) =>
      console.error(`[sync/manual] Error for mapping ${id}:`, err)
    );

    return NextResponse.json({ ok: true, message: "Sync started" });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger sync" },
      { status: 500 }
    );
  }
}
