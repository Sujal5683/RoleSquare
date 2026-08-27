import { db } from "@/lib/db";
import { updateRunProgress } from "@/lib/job-runner";
import { ensureDefaultDataset } from "@/lib/dataset-provisioner";
import { bumpUsageMetric } from "@/lib/usage";
import { getSheetsClient } from "@/lib/google-client";
import { agentInfo } from "@/lib/agent-logger";

export async function processSheetsScan(
  job: { id: string; organizationId: string; payload: string },
  payload: { sourceId?: string; runId?: string; mode?: string }
): Promise<Record<string, unknown>> {
  const { sourceId, runId, mode } = payload;
  if (!sourceId || !runId) {
    throw new Error("Missing sourceId or runId in SHEETS_SCAN payload");
  }

  const existingRun = await db.sourceRun.findUnique({ where: { id: runId } });
  if (!existingRun) throw new Error(`Source run ${runId} not found`);
  if (existingRun.status === "success") {
    return { skipped: true, reason: "Run already completed" };
  }

  const source = await db.source.findUnique({
    where: { id: sourceId },
    include: { rules: { orderBy: { position: "asc" } } },
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  await ensureDefaultDataset(sourceId);
  await updateRunProgress(runId, 10, "connecting");

  let spreadsheetId: string | null = null;
  let range: string | null = null;
  for (const rule of source.rules) {
    let value: string;
    try { value = JSON.parse(rule.value as string); } catch { value = String(rule.value); }
    if (rule.filterType === "spreadsheet_id") {
      spreadsheetId = value;
    } else if (rule.filterType === "range") {
      range = value;
    }
  }

  if (!spreadsheetId) {
    throw new Error("SHEETS_SCAN requires a spreadsheet_id rule.");
  }

  await updateRunProgress(runId, 20, "scanning");

  const sheets = await getSheetsClient(source.googleConnectionId);
  
  await updateRunProgress(runId, 35, "fetching");
  let rowsMatched = 0;

  try {
    const sheetResp = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    }, { signal: AbortSignal.timeout(30000) });
    const sheetTitle = sheetResp.data.properties?.title ?? "Untitled Spreadsheet";

    // If no range specified, fetch all data from the first sheet
    let targetRange: string | null = range;
    if (!targetRange && sheetResp.data.sheets && sheetResp.data.sheets.length > 0) {
      targetRange = sheetResp.data.sheets[0].properties?.title ?? null;
    }

    const dataResp = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: targetRange || "A1:Z1000",
    });
    
    const rows = dataResp.data.values ?? [];
    await agentInfo(job.id, job.organizationId, "system", `Fetched ${rows.length} rows from spreadsheet`, { spreadsheetId, sourceId });

    for (let i = 0; i < rows.length; i++) {
      const rowId = `${spreadsheetId}-${targetRange}-row-${i}`;
      const rowData = JSON.stringify(rows[i]);
      
      await db.email.upsert({
        where: { sourceId_googleMessageId: { sourceId, googleMessageId: rowId } },
        create: {
          sourceId,
          googleMessageId: rowId,
          fromAddress: "sheet-owner",
          toAddress: "",
          subject: sheetTitle,
          snippet: "application/vnd.google-apps.spreadsheet",
          bodyText: rowData,
          bodyHtml: null,
          receivedAt: new Date(),
          dedupHash: rowId,
          processingStatus: "matched",
        },
        update: {
          subject: sheetTitle,
          bodyText: rowData,
          receivedAt: new Date(),
          processingStatus: "matched",
        },
      });
      rowsMatched++;
    }
  } catch (err) {
    console.warn(`[sheets-scan] Failed to process spreadsheet ${spreadsheetId}:`, err instanceof Error ? err.message : err);
  }

  await updateRunProgress(runId, 95, "finalizing");

  const stats = { rowsMatched, recordsExtracted: 0 };

  await db.sourceRun.update({
    where: { id: runId },
    data: {
      status: "success",
      progress: 100,
      finishedAt: new Date(),
      stats: JSON.stringify(stats),
    },
  });

  await db.source.update({
    where: { id: sourceId },
    data: { runState: "idle", lastRunAt: new Date() },
  });

  await bumpUsageMetric(job.organizationId, "emails_scanned", rowsMatched);

  if (rowsMatched > 0) {
    await db.aiJob.create({
      data: {
        organizationId: job.organizationId,
        type: "DETERMINISTIC_SYNC",
        status: "queued",
        payload: JSON.stringify({ sourceId }),
        progress: 0,
      },
    });
  }

  return { mode, stats };
}
