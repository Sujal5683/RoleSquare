import { db } from "@/lib/db";
import { updateRunProgress } from "@/lib/job-runner";
import { ensureDefaultDataset } from "@/lib/dataset-provisioner";
import { bumpUsageMetric } from "@/lib/usage";
import { getDriveClient } from "@/lib/google-client";
import { agentInfo } from "@/lib/agent-logger";
import { exploreLinkedContent } from "@/lib/drive-reader";

export async function processDriveScan(
  job: { id: string; organizationId: string; payload: string },
  payload: { sourceId?: string; runId?: string; mode?: string }
): Promise<Record<string, unknown>> {
  const { sourceId, runId, mode } = payload;
  if (!sourceId || !runId) {
    throw new Error("Missing sourceId or runId in DRIVE_SCAN payload");
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

  // Construct search query
  const queryParts: string[] = [];
  for (const rule of source.rules) {
    let value: unknown;
    try { value = JSON.parse(rule.value as string); } catch { value = rule.value; }
    
    switch (rule.filterType) {
      case "folder_id":
        queryParts.push(`'${value}' in parents`);
        break;
      case "name":
        queryParts.push(rule.operator === "contains" ? `name contains '${value}'` : `name = '${value}'`);
        break;
      case "mime_type":
        queryParts.push(`mimeType = '${value}'`);
        break;
    }
  }

  // Ensure only files are fetched (not folders) unless specified
  if (!queryParts.some(p => p.includes('mimeType'))) {
    queryParts.push(`mimeType != 'application/vnd.google-apps.folder'`);
  }

  const driveQuery = queryParts.join(" and ");

  await updateRunProgress(runId, 20, "scanning");

  const drive = await getDriveClient(source.googleConnectionId);
  const listResp = await drive.files.list({
    q: driveQuery || undefined,
    fields: "files(id, name, mimeType, modifiedTime, owners)",
    pageSize: source.maxEmailsPerScan ?? 100, // Reuse max limit config
  }, { signal: AbortSignal.timeout(30000) });

  const files = listResp.data.files ?? [];
  await agentInfo(job.id, job.organizationId, "system", `Fetching ${files.length} drive files (limit: ${source.maxEmailsPerScan ?? 100})`, { query: driveQuery, sourceId });

  await updateRunProgress(runId, 35, "fetching");

  let filesMatched = 0;
  const total = files.length;
  const chunkSize = 5;

  for (let i = 0; i < total; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    const pct = 35 + Math.floor(((i + 1) / Math.max(total, 1)) * 45);
    await updateRunProgress(runId, pct, "parsing");

    await Promise.all(chunk.map(async (file) => {
      if (!file.id) return;
      try {
        const ownerEmail = file.owners?.[0]?.emailAddress ?? "unknown";
        
        let contentText = "";
        try {
          // Explore/read content using existing drive-reader utility
          const explored = await exploreLinkedContent(
            [`https://drive.google.com/open?id=${file.id}`],
            { connectionId: source.googleConnectionId, maxBytes: 50000 }
          );
          contentText = explored.combinedText || "";
        } catch (readErr) {
          console.warn(`[drive-scan] Could not extract text from file ${file.id}`);
        }

        const emailRow = await db.email.upsert({
          where: { sourceId_googleMessageId: { sourceId, googleMessageId: file.id } },
          create: {
            sourceId,
            googleMessageId: file.id,
            threadId: file.mimeType ?? null, // Abuse threadId to store mimeType for default-dataset mapping
            fromAddress: ownerEmail,
            toAddress: "",
            subject: file.name ?? "Untitled",
            snippet: file.mimeType ?? "",
            bodyText: contentText,
            bodyHtml: null,
            receivedAt: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
            dedupHash: file.id,
            processingStatus: "matched",
          },
          update: {
            fromAddress: ownerEmail,
            subject: file.name ?? "Untitled",
            snippet: file.mimeType ?? "",
            bodyText: contentText,
            receivedAt: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
            processingStatus: "matched",
          },
        });
        filesMatched++;
      } catch (err) {
        console.warn(`[drive-scan] Failed to process file ${file.id}:`, err instanceof Error ? err.message : err);
      }
    }));
  }

  await updateRunProgress(runId, 95, "finalizing");

  const stats = { filesMatched, recordsExtracted: 0 };

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

  await bumpUsageMetric(job.organizationId, "emails_scanned", filesMatched); // Count files as scans

  if (filesMatched > 0) {
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
