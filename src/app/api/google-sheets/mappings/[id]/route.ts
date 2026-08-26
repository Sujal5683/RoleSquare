// GET /api/google-sheets/mappings/[id] — get mapping details + sync state
// PATCH /api/google-sheets/mappings/[id] — update sync settings
// DELETE /api/google-sheets/mappings/[id] — unlink (pause/remove mapping)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse , requireRole} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireMapping(id: string, organizationId: string) {
  const mapping = await db.sheetMapping.findFirst({
    where: { id, organizationId },
    include: {
      spreadsheetConnection: {
        include: { sheetsAccount: { select: { id: true, googleEmail: true, status: true } } },
      },
      syncState: true,
      dataset: { select: { id: true, name: true, recordCount: true } },
      _count: { select: { syncConflicts: { where: { status: "pending" } } } },
    },
  });
  return mapping;
}

function serializeMapping(m: NonNullable<Awaited<ReturnType<typeof requireMapping>>>) {
  return {
    id: m.id,
    organizationId: m.organizationId,
    datasetId: m.datasetId,
    datasetName: m.dataset.name,
    datasetRecordCount: m.dataset.recordCount,
    spreadsheetId: m.spreadsheetConnection.spreadsheetId,
    spreadsheetName: m.spreadsheetConnection.spreadsheetName,
    spreadsheetUrl: m.spreadsheetConnection.spreadsheetUrl,
    sheetsAccount: {
      id: m.spreadsheetConnection.sheetsAccount.id,
      email: m.spreadsheetConnection.sheetsAccount.googleEmail,
      status: m.spreadsheetConnection.sheetsAccount.status,
    },
    sheetName: m.sheetName,
    sheetId: m.sheetId,
    direction: m.direction,
    schemaFingerprint: m.schemaFingerprint,
    status: m.status,
    pendingConflicts: m._count.syncConflicts,
    syncState: m.syncState
      ? {
          enabled: m.syncState.enabled,
          conflictStrategy: m.syncState.conflictStrategy,
          scheduleMode: m.syncState.scheduleMode,
          scheduleExpr: m.syncState.scheduleExpr,
          lastSyncAt: m.syncState.lastSyncAt?.toISOString() ?? null,
          lastSyncStatus: m.syncState.lastSyncStatus,
          nextSyncAt: m.syncState.nextSyncAt?.toISOString() ?? null,
          syncedRows: m.syncState.syncedRows,
          errorCount: m.syncState.errorCount,
          conflictCount: m.syncState.conflictCount,
        }
      : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { organizationId } = await requireOrgContext(req);

    const mapping = await requireMapping(id, organizationId);
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    return NextResponse.json(serializeMapping(mapping));
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get mapping" },
      { status: 500 }
    );
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const mapping = await requireMapping(id, organizationId);
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      direction,
      conflictStrategy,
      scheduleMode,
      scheduleExpr,
      enabled,
      status,
    } = body;

    const before = serializeMapping(mapping);

    // Update mapping fields
    const updatedMapping = await db.sheetMapping.update({
      where: { id },
      data: {
        ...(direction !== undefined && { direction }),
        ...(status !== undefined && { status }),
      },
    });

    // Update sync state
    if (
      conflictStrategy !== undefined ||
      scheduleMode !== undefined ||
      scheduleExpr !== undefined ||
      enabled !== undefined
    ) {
      await db.syncState.updateMany({
        where: { sheetMappingId: id },
        data: {
          ...(conflictStrategy !== undefined && { conflictStrategy }),
          ...(scheduleMode !== undefined && { scheduleMode }),
          ...(scheduleExpr !== undefined && { scheduleExpr }),
          ...(enabled !== undefined && { enabled }),
        },
      });
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "update",
      entity: "sheet_mapping",
      entityId: id,
      before,
      after: body,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update mapping" },
      { status: 500 }
    );
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");
    const mapping = await requireMapping(id, organizationId);
    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const deleteData = searchParams.get("deleteData") === "true";

    if (deleteData) {
      // Full delete: remove mapping + row external IDs + conflicts
      await db.sheetMapping.delete({ where: { id } });
    } else {
      // Soft unlink: just mark as unlinked, preserve history
      await db.sheetMapping.update({
        where: { id },
        data: { status: "unlinked" },
      });
    }

    await logAudit({
      organizationId,
      actorId: user.id,
      action: deleteData ? "delete" : "unlink",
      entity: "sheet_mapping",
      entityId: id,
      before: {
        datasetId: mapping.datasetId,
        spreadsheetId: mapping.spreadsheetConnection.spreadsheetId,
        sheetName: mapping.sheetName,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to unlink mapping" },
      { status: 500 }
    );
  }
}
