// POST /api/google-sheets/org-export
//
// Exports all selected datasets from an organization into a single Google
// Spreadsheet. Each dataset gets its own tab named after the dataset.
//
// Body: {
//   sheetsAccountId: string,
//   spreadsheetId?: string | null,   // null = create new
//   spreadsheetName?: string,         // name for the new spreadsheet
//   createNew: boolean,
//   datasetIds: string[],
//   organizationId: string,           // validated against session
// }
//
// Response: { spreadsheetUrl: string, tabsCreated: number }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { getSheetsClient, withRetry } from "@/lib/services/google-sheets-client";

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req);
    const body = await req.json().catch(() => ({}));

    const {
      sheetsAccountId,
      spreadsheetId: existingSpreadsheetId,
      spreadsheetName,
      createNew = true,
      datasetIds = [],
      direction = "bidirectional",
      conflictStrategy = "flag",
      scheduleExpr = "5m",
    } = body;

    if (!sheetsAccountId || !Array.isArray(datasetIds) || datasetIds.length === 0) {
      return NextResponse.json(
        { error: "sheetsAccountId and at least one datasetId are required" },
        { status: 400 }
      );
    }

    // IDOR: verify Sheets account belongs to this org
    const account = await db.googleSheetsAccount.findFirst({
      where: { id: sheetsAccountId, organizationId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Sheets account not found" }, { status: 404 });
    }

    // Load all requested datasets (only those in this org)
    const datasets = await db.dataset.findMany({
      where: { id: { in: datasetIds }, organizationId },
      include: {
        columnDefs: {
          where: { isDeleted: false },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!datasets.length) {
      return NextResponse.json({ error: "No matching datasets found" }, { status: 404 });
    }

    // ── Step 1: Create or open the spreadsheet ──────────────────────────────
    let finalSpreadsheetId: string;
    let spreadsheetUrl: string;

    // Map to store sheetId per tabTitle
    const sheetIdMap = new Map<string, number>();

    const sheets = await getSheetsClient(sheetsAccountId);

    if (createNew || !existingSpreadsheetId) {
      // Build sheet tabs list upfront so they're created all at once
      const sheetTitles = datasets.map((d) =>
        d.name.slice(0, 100).replace(/[\\/\?\*\[\]]/g, "_")
      );

      const created = await withRetry(() =>
        sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: spreadsheetName || "Organization Datasets Export",
            },
            sheets: sheetTitles.map((title, i) => ({
              properties: { title, index: i },
            })),
          },
        })
      );

      finalSpreadsheetId = created.data.spreadsheetId!;
      spreadsheetUrl =
        created.data.spreadsheetUrl ??
        `https://docs.google.com/spreadsheets/d/${finalSpreadsheetId}`;
      
      created.data.sheets?.forEach(s => {
         if (s.properties?.title && s.properties?.sheetId != null) {
             sheetIdMap.set(s.properties.title, s.properties.sheetId as number);
         }
      });
    } else {
      finalSpreadsheetId = existingSpreadsheetId;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${finalSpreadsheetId}`;

      // For existing spreadsheet: fetch existing sheets first
      const spreadsheet = await withRetry(() => 
        sheets.spreadsheets.get({ spreadsheetId: finalSpreadsheetId })
      );
      
      const existingSheets = spreadsheet.data.sheets || [];
      const existingTitles = new Set(existingSheets.map(s => s.properties?.title));
      
      // Map existing sheet IDs so we can use them later
      existingSheets.forEach(s => {
        if (s.properties?.title && s.properties?.sheetId != null) {
          sheetIdMap.set(s.properties.title, s.properties.sheetId as number);
        }
      });

      // Only add tabs that don't already exist
      const requests = datasets
        .map((d) => d.name.slice(0, 100).replace(/[\\/\?\*\[\]]/g, "_"))
        .filter((title) => !existingTitles.has(title))
        .map((title) => ({
          addSheet: {
            properties: {
              title,
            },
          },
        }));

      if (requests.length > 0) {
        const batchRes = await withRetry(() =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId: finalSpreadsheetId,
            requestBody: {
              requests,
            },
          })
        );

        batchRes.data.replies?.forEach(reply => {
            if (reply.addSheet?.properties?.title && reply.addSheet?.properties?.sheetId != null) {
                sheetIdMap.set(reply.addSheet.properties.title, reply.addSheet.properties.sheetId as number);
            }
        });
      }
    }

    // ── Step 2: Create DB Mappings and Trigger Sync ─────────────────────────
    let tabsCreated = 0;
    
    // Import runSync dynamically to avoid circular issues
    const { runSync } = await import("@/lib/services/sync-engine");

    const conn = await db.spreadsheetConnection.upsert({
      where: {
        organizationId_spreadsheetId: { organizationId, spreadsheetId: finalSpreadsheetId },
      },
      create: {
        organizationId,
        sheetsAccountId,
        spreadsheetId: finalSpreadsheetId,
        spreadsheetName: spreadsheetName || "Organization Datasets Export",
      },
      update: {
        sheetsAccountId,
      },
    });

    for (const dataset of datasets) {
      const tabTitle = dataset.name.slice(0, 100).replace(/[\\/\?\*\[\]]/g, "_");
      const sheetId = sheetIdMap.get(tabTitle);
      
      if (sheetId === undefined) continue;

      // Ensure not already linked
      const existing = await db.sheetMapping.findFirst({
        where: {
          datasetId: dataset.id,
          spreadsheetConnectionId: conn.id,
          sheetName: tabTitle,
          status: { not: "unlinked" },
        },
        select: { id: true },
      });

      if (!existing) {
        const m = await db.sheetMapping.create({
          data: {
            organizationId,
            datasetId: dataset.id,
            spreadsheetConnectionId: conn.id,
            sheetId,
            sheetName: tabTitle,
            direction,
            status: "active",
          },
        });

        await db.syncState.create({
          data: {
            sheetMappingId: m.id,
            enabled: true,
            conflictStrategy,
            scheduleMode: scheduleExpr === "manual" ? "manual" : "interval",
            scheduleExpr: scheduleExpr === "manual" ? "5m" : scheduleExpr,
          },
        });

        // Trigger initial push in background
        runSync(m.id, "manual").catch(err => 
            console.error(`[org-export] Initial sync failed for dataset ${dataset.id}:`, err)
        );
        tabsCreated++;
      }
    }

    return NextResponse.json({
      spreadsheetUrl,
      spreadsheetId: finalSpreadsheetId,
      tabsCreated,
      datasetsExported: tabsCreated,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("[org-export] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
