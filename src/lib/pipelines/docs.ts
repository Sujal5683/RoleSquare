import { db } from "@/lib/db";
import { updateRunProgress } from "@/lib/job-runner";
import { ensureDefaultDataset } from "@/lib/dataset-provisioner";
import { bumpUsageMetric } from "@/lib/usage";
import { getDocsClient } from "@/lib/google-client";
import { agentInfo } from "@/lib/agent-logger";
import { exploreLinkedContent } from "@/lib/drive-reader";
import { enqueueJob } from "@/lib/queue";

export async function processDocsScan(
  job: { id: string; organizationId: string; payload: string },
  payload: { sourceId?: string; runId?: string; mode?: string }
): Promise<Record<string, unknown>> {
  const { sourceId, runId, mode } = payload;
  if (!sourceId || !runId) {
    throw new Error("Missing sourceId or runId in DOCS_SCAN payload");
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

  // Since Google Docs API does not have a search endpoint, we rely on the document_id rule
  // Alternatively, we could search via Drive API, but to keep it simple, we expect a document_id
  let documentId: string | null = null;
  for (const rule of source.rules) {
    let value: string;
    try { value = JSON.parse(rule.value as string); } catch { value = String(rule.value); }
    if (rule.filterType === "document_id") {
      documentId = value;
      break;
    }
  }

  if (!documentId) {
    throw new Error("DOCS_SCAN requires a document_id rule.");
  }

  await updateRunProgress(runId, 20, "scanning");

  const docs = await getDocsClient(source.googleConnectionId);
  
  await updateRunProgress(runId, 35, "fetching");
  let docsMatched = 0;

  try {
    const docResp = await docs.documents.get({
      documentId: documentId,
    }, { signal: AbortSignal.timeout(30000) });
    const doc = docResp.data;

    await agentInfo(job.id, job.organizationId, "system", `Fetched document ${doc.title}`, { documentId, sourceId });

    let contentText = "";
    try {
      const explored = await exploreLinkedContent(
        [`https://docs.google.com/document/d/${documentId}`],
        { connectionId: source.googleConnectionId, maxBytes: 100000 }
      );
      contentText = explored.plainText || "";
    } catch (readErr) {
      console.warn(`[docs-scan] Could not extract text from doc ${documentId}`);
    }

    await db.email.upsert({
      where: { sourceId_googleMessageId: { sourceId, googleMessageId: documentId } },
      create: {
        sourceId,
        googleMessageId: documentId,
        fromAddress: "doc-owner",
        toAddress: "",
        subject: doc.title ?? "Untitled Document",
        snippet: "application/vnd.google-apps.document",
        bodyText: contentText,
        bodyHtml: null,
        receivedAt: new Date(),
        dedupHash: documentId,
        processingStatus: "matched",
      },
      update: {
        subject: doc.title ?? "Untitled Document",
        bodyText: contentText,
        receivedAt: new Date(),
        processingStatus: "matched",
      },
    });
    docsMatched++;
  } catch (err) {
    console.warn(`[docs-scan] Failed to process document ${documentId}:`, err instanceof Error ? err.message : err);
  }

  await updateRunProgress(runId, 95, "finalizing");

  const stats = { docsMatched, recordsExtracted: 0 };

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

  await bumpUsageMetric(job.organizationId, "emails_scanned", docsMatched);

  if (docsMatched > 0) {
    await enqueueJob({
      organizationId: job.organizationId,
      type: "DETERMINISTIC_SYNC",
      payload: { sourceId },
    });
  }

  return { mode, stats };
}
