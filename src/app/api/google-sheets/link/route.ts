import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { GoogleSheetsService } from "@/lib/services/google-sheets";
import { SchemaValidationService } from "@/lib/services/schema-validation";
import { SyncEngine } from "@/lib/services/sync-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { googleIntegrationId, spreadsheetId, sheetName, datasetId, columnMappings, organizationId } = body;

    let actualIntegrationId = googleIntegrationId;

    if (!actualIntegrationId || actualIntegrationId === "mock-integration" || actualIntegrationId === "") {
      if (!organizationId) {
        throw new Error("Missing organizationId to resolve google integration");
      }
      const integration = await prisma.googleIntegration.findFirst({
        where: { organizationId, status: "active" }
      });
      if (!integration) {
        throw new Error("No active Google Integration found for this organization. Please link an account first.");
      }
      actualIntegrationId = integration.id;
    }

    // 1. Create spreadsheet connection if it doesn't exist
    let connection = await prisma.spreadsheetConnection.findFirst({
      where: { googleIntegrationId: actualIntegrationId, spreadsheetId }
    });

    if (!connection) {
      const meta = await GoogleSheetsService.getSpreadsheetMetadata(actualIntegrationId, spreadsheetId);
      connection = await prisma.spreadsheetConnection.create({
        data: {
          googleIntegrationId: actualIntegrationId,
          spreadsheetId,
          name: meta.properties?.title || "Untitled Spreadsheet",
        }
      });
    }

    // 2. Upsert SheetMapping
    const sheetMapping = await prisma.sheetMapping.upsert({
      where: {
        spreadsheetConnectionId_sheetId: {
          spreadsheetConnectionId: connection.id,
          sheetId: sheetName,
        }
      },
      update: {
        datasetId,
        syncEnabled: true,
      },
      create: {
        spreadsheetConnectionId: connection.id,
        datasetId,
        sheetId: sheetName, // In production, resolve this to the actual numeric sheetId
        sheetName,
        syncEnabled: true,
      }
    });

    // 3. Save Column Mappings
    if (columnMappings && Array.isArray(columnMappings)) {
      await prisma.datasetColumnMapping.createMany({
        data: columnMappings.map((cm: any) => ({
          sheetMappingId: sheetMapping.id,
          fieldId: cm.fieldId,
          sheetColumnName: cm.sheetColumnName,
        }))
      });
    }

    // 4. Update Schema Fingerprint
    await SchemaValidationService.updateSchemaFingerprint(sheetMapping.id);

    // 5. Trigger initial sync to push dataset records to the empty sheet
    // We do this detached so the API responds quickly.
    SyncEngine.syncMapping(sheetMapping.id).catch(err => {
      console.error("Initial sync failed:", err);
    });

    return NextResponse.json({ success: true, sheetMappingId: sheetMapping.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
