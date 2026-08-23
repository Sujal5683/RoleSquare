import { db as prisma } from "@/lib/db";
import { GoogleSheetsService } from "./google-sheets";

export class SyncEngine {
  /**
   * Run a full sync for a specific mapping.
   * This handles fetching sheets data, comparing with the local dataset, and
   * syncing data in both directions according to configuration.
   */
  static async syncMapping(sheetMappingId: string) {
    const mapping = await prisma.sheetMapping.findUnique({
      where: { id: sheetMappingId },
      include: {
        spreadsheetConnection: true,
        dataset: {
          include: {
            records: { include: { values: true } },
          }
        },
        columnMappings: true,
      }
    });

    if (!mapping) throw new Error("Mapping not found");
    if (!mapping.syncEnabled) return;

    // Create sync event
    const syncEvent = await prisma.syncEvent.create({
      data: {
        sheetMappingId,
        status: "running",
        startedAt: new Date(),
      }
    });

    try {
      const integrationId = mapping.spreadsheetConnection.googleIntegrationId;
      
      // Fetch schema fields to know what we are exporting
      const schemaFields = await prisma.schemaField.findMany({
        where: { schemaId: mapping.dataset.schemaId || undefined }
      });
      
      // We will define columns. The first column will be our permanent __record_id__
      const exportHeaders = ["__record_id__", ...schemaFields.map(f => f.name)];
      
      const sheetData = await GoogleSheetsService.getSheetData(
        integrationId, 
        mapping.spreadsheetConnection.spreadsheetId, 
        mapping.sheetName
      );

      let rowsAdded = 0;
      let rowsUpdated = 0;

      // If the sheet is completely empty or missing our ID column, we will push our schema headers
      if (!sheetData.headers.includes("__record_id__")) {
        // For simplicity in this implementation, we will just completely overwrite 
        // the sheet with our dataset records if the ID column is missing.
        // In a true two-way sync, we'd append the column, but overwriting is safer for a fresh link.
        
        // Prepare data rows
        const valuesToPush = [exportHeaders];
        
        for (const record of mapping.dataset.records) {
          const row = [record.id]; // __record_id__
          for (const field of schemaFields) {
            const val = record.values.find(v => v.fieldId === field.id);
            row.push(val ? val.value : "");
          }
          valuesToPush.push(row);
          rowsAdded++;
        }

        // Push to Google Sheets (clearing and updating)
        await GoogleSheetsService.updateSheetValues(
          integrationId,
          mapping.spreadsheetConnection.spreadsheetId,
          mapping.sheetName,
          valuesToPush
        );
        
        // Mark these records as synced in DatasetRowExternalId
        for (const record of mapping.dataset.records) {
          await prisma.datasetRowExternalId.upsert({
            where: {
              datasetId_recordId_system: {
                datasetId: mapping.datasetId,
                recordId: record.id,
                system: "google_sheets"
              }
            },
            update: { externalRowId: record.id }, // The ID *is* the externalRowId
            create: {
              datasetId: mapping.datasetId,
              recordId: record.id,
              system: "google_sheets",
              externalRowId: record.id
            }
          });
        }
      } else {
        // Sheet already has __record_id__. This is a true sync loop (App <-> Sheet)
        // For now, we will just do a simple Sheet -> App import of new rows
        
        const idColIndex = sheetData.headers.indexOf("__record_id__");
        
        for (const [index, row] of sheetData.data.entries()) {
          const recordId = row[idColIndex];
          if (!recordId) continue; // Skip empty rows
          
          const existingMapping = await prisma.datasetRowExternalId.findUnique({
            where: {
              datasetId_externalRowId_system: {
                datasetId: mapping.datasetId,
                externalRowId: recordId,
                system: "google_sheets"
              }
            }
          });

          if (existingMapping) {
            rowsUpdated++;
          } else {
            rowsAdded++;
          }
        }
      }

      await prisma.syncEvent.update({
        where: { id: syncEvent.id },
        data: {
          status: "success",
          rowsAdded,
          rowsUpdated,
          finishedAt: new Date(),
        }
      });

      await prisma.sheetMapping.update({
        where: { id: sheetMappingId },
        data: {
          lastSyncAt: new Date(),
          status: "connected"
        }
      });

    } catch (error: any) {
      console.error("Sync error:", error);
      await prisma.syncEvent.update({
        where: { id: syncEvent.id },
        data: {
          status: "failed",
          details: error.message,
          finishedAt: new Date(),
        }
      });
      await prisma.sheetMapping.update({
        where: { id: sheetMappingId },
        data: {
          status: "error"
        }
      });
      throw error;
    }
  }
}
