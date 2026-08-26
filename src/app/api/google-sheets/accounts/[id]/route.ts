// DELETE /api/google-sheets/accounts/[id]
// Disconnects and revokes a Google Sheets account.
// Also pauses any active SheetMappings associated with this account.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, requireRole, AuthError, authErrorResponse } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  decryptSheetsToken,
  revokeSheetsToken,
} from "@/lib/services/google-sheets-oauth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, organizationId } = await requireRole(req, "member");

    // IDOR: verify this account belongs to the org
    const account = await db.googleSheetsAccount.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        googleEmail: true,
        refreshToken: true,
        accessToken: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Pause associated mappings
    await db.sheetMapping.updateMany({
      where: {
        spreadsheetConnection: { sheetsAccountId: id },
        organizationId,
      },
      data: { status: "paused" },
    });

    // Revoke tokens at Google (best-effort)
    try {
      if (account.refreshToken) {
        const plainRefresh = decryptSheetsToken(account.refreshToken);
        await revokeSheetsToken(plainRefresh);
      }
      if (account.accessToken) {
        const plainAccess = decryptSheetsToken(account.accessToken);
        await revokeSheetsToken(plainAccess);
      }
    } catch {
      // Non-fatal — log but proceed with deletion
      console.warn(`[accounts/[id]] Could not revoke tokens for account ${id}`);
    }

    // Delete from DB (cascades to SpreadsheetConnection, SheetMapping via relations)
    await db.googleSheetsAccount.delete({ where: { id } });

    await logAudit({
      organizationId,
      actorId: user.id,
      action: "delete",
      entity: "google_sheets_account",
      entityId: id,
      before: { googleEmail: account.googleEmail },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect account" },
      { status: 500 }
    );
  }
}
