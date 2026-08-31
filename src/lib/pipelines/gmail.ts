import { db } from "@/lib/db";
import { updateRunProgress } from "@/lib/job-runner";
import { ensureDefaultDataset } from "@/lib/dataset-provisioner";
import { bumpUsageMetric } from "@/lib/usage";
import { getGmailClient, extractEmailBody, extractAttachments, extractDriveLinks, getHeader } from "@/lib/google-client";
import { agentInfo } from "@/lib/agent-logger";
import { enqueueJob } from "@/lib/queue";
import crypto from "crypto";

export async function processGmailScan(
  job: { id: string; organizationId: string; payload: string },
  payload: { sourceId?: string; runId?: string; mode?: string }
): Promise<Record<string, unknown>> {
  const { sourceId, runId, mode } = payload;
  if (!sourceId || !runId) {
    throw new Error("Missing sourceId or runId in GMAIL_SCAN payload");
  }

  // Check if the run is already completed (idempotency)
  const existingRun = await db.sourceRun.findUnique({ where: { id: runId } });
  if (!existingRun) throw new Error(`Source run ${runId} not found`);
  if (existingRun.status === "success") {
    return { skipped: true, reason: "Run already completed" };
  }

  // Load the source with its rules and connection
  const source = await db.source.findUnique({
    where: { id: sourceId },
    include: { rules: { orderBy: { position: "asc" } } },
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  // FIX 1: Ensure default dataset exists immediately at scan start (idempotent).
  // This means the source has a dataset from the very first scan, not after DETERMINISTIC_SYNC.
  await ensureDefaultDataset(sourceId);

  await updateRunProgress(runId, 10, "connecting");

  // Build Gmail search query from SourceRules
  const queryParts: string[] = [];
  for (const rule of source.rules) {
    let value: unknown;
    try { value = JSON.parse(rule.value); } catch { value = rule.value; }
    switch (rule.filterType) {
      case "sender":
        queryParts.push(`from:${Array.isArray(value) ? value.join(" OR from:") : value}`);
        break;
      case "subject":
        queryParts.push(rule.operator === "contains" ? `subject:${value}` : `-subject:${value}`);
        break;
      case "date": {
        if (rule.operator === "gt") queryParts.push(`after:${value}`);
        if (rule.operator === "lt") queryParts.push(`before:${value}`);
        if (rule.operator === "between") {
          let metadata;
          try { metadata = rule.metadata ? JSON.parse(rule.metadata as string) : null; } catch { /* ignore */ }
          if (metadata?.startDate && metadata?.endDate) {
            queryParts.push(`after:${metadata.startDate} before:${metadata.endDate}`);
          }
        }
        break;
      }
      case "attachment": {
        if (value === true || value === "true" || value === "required") {
          queryParts.push("has:attachment");
          let metadata;
          try { metadata = rule.metadata ? JSON.parse(rule.metadata as string) : null; } catch { /* ignore */ }
          if (metadata?.allowedExtensions) {
            const exts = (metadata.allowedExtensions as string)
              .split(",")
              .map(e => e.trim().replace(/^\./, ""))
              .filter(Boolean);
            if (exts.length > 0) {
              const filenameQuery = exts.map(e => `filename:${e}`).join(" OR ");
              queryParts.push(`(${filenameQuery})`);
            }
          }
        }
        break;
      }
      case "drive_link":
        if (value === true || value === "true" || value === "required") queryParts.push("drive.google.com");
        break;
    }
  }
  let ruleOperator = "AND";
  if (source.config) {
    try {
      const config = JSON.parse(source.config as string);
      if (config.ruleOperator === "OR") ruleOperator = "OR";
    } catch { /* ignore */ }
  }
  const operatorStr = ruleOperator === "OR" ? " OR " : " ";
  const gmailQuery = queryParts.length > 0 ? queryParts.join(operatorStr) : "";

  await updateRunProgress(runId, 20, "scanning");

  // Fetch matching message IDs from Gmail
  const gmail = await getGmailClient(source.googleConnectionId);
  const listResp = await gmail.users.messages.list({
    userId: "me",
    q: gmailQuery || undefined,
    maxResults: source.maxEmailsPerScan ?? 100,
  }, { signal: AbortSignal.timeout(30000) });
  const messageRefs = listResp.data.messages ?? [];

  await agentInfo(job.id, job.organizationId, "system", `Fetching ${messageRefs.length} messages (limit: ${source.maxEmailsPerScan ?? 100})`, { query: gmailQuery, sourceId });

  await updateRunProgress(runId, 35, "fetching");

  let emailsMatched = 0;
  let attachmentsFound = 0;
  let driveLinksDiscovered = 0;
  const total = messageRefs.length;

  // Process messages in chunks of 10 to avoid sequential blocking and speed up scanning
  const chunkSize = 10;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = messageRefs.slice(i, i + chunkSize);
    
    // Update progress
    const pct = 35 + Math.floor(((i + 1) / Math.max(total, 1)) * 45);
    await updateRunProgress(runId, pct, "parsing");

    await Promise.all(chunk.map(async (ref) => {
      if (!ref.id) return;
      try {
        // Fetch full message
        const msgResp = await gmail.users.messages.get({
          userId: "me",
          id: ref.id,
          format: "full",
        }, { signal: AbortSignal.timeout(30000) });
        const msg = msgResp.data;
        const headers = msg.payload?.headers ?? [];

        const fromAddress = getHeader(headers, "from");
        const toAddress = getHeader(headers, "to");
        const ccAddresses = getHeader(headers, "cc") || null;
        const subject = getHeader(headers, "subject");
        const dateStr = getHeader(headers, "date");
        const receivedAt = dateStr ? new Date(dateStr) : new Date();
        const snippet = msg.snippet ?? "";

        const { text: bodyText, html: bodyHtml } = extractEmailBody(msg.payload);

        // Dedup hash: sha256 of messageId
        const dedupHash = crypto.createHash("sha256").update(ref.id).digest("hex");

        const email = await db.email.upsert({
          where: { sourceId_googleMessageId: { sourceId, googleMessageId: ref.id } },
          create: {
            sourceId,
            googleMessageId: ref.id,
            threadId: msg.threadId ?? null,
            fromAddress,
            toAddress,
            ccAddresses,
            subject,
            snippet,
            bodyText: bodyText || null,
            bodyHtml: bodyHtml || null,
            receivedAt,
            dedupHash,
            processingStatus: "matched",
          },
          update: {
            fromAddress,
            toAddress,
            subject,
            snippet,
            bodyText: bodyText || null,
            bodyHtml: bodyHtml || null,
            receivedAt,
            processingStatus: "matched",
          },
        });
        emailsMatched++;

        // Discover attachments
        const attachments = extractAttachments(msg.payload);
        for (const att of attachments) {
          await db.emailAttachment.upsert({
            where: { id: `${email.id}-${att.attachmentId}` },
            create: {
              id: `${email.id}-${att.attachmentId}`,
              emailId: email.id,
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              status: "discovered",
            },
            update: { filename: att.filename, mimeType: att.mimeType, size: att.size },
          });
          attachmentsFound++;
        }

        // Discover Drive links
        const fullText = bodyText + " " + bodyHtml;
        const driveLinks = extractDriveLinks(fullText);
        for (const url of driveLinks) {
          const resourceType = url.includes("docs.google.com/document") ? "docs"
            : url.includes("docs.google.com/spreadsheets") ? "sheets"
            : url.includes("docs.google.com/forms") ? "forms"
            : url.includes("drive.google.com") ? "drive"
            : "external";
          const existingLink = await db.emailLink.findFirst({
            where: { emailId: email.id, url },
          });
          if (!existingLink) {
            await db.emailLink.create({
              data: { emailId: email.id, url, resourceType },
            });
            driveLinksDiscovered++;
          }
        }
      } catch (err) {
        console.warn(`[job-runner] Failed to process email ${ref.id}:`, err instanceof Error ? err.message : err);
      }
    }));
  }

  await updateRunProgress(runId, 95, "finalizing");

  const stats = { emailsMatched, attachmentsFound, driveLinksDiscovered, recordsExtracted: 0 };

  // Complete the run
  await db.sourceRun.update({
    where: { id: runId },
    data: {
      status: "success",
      progress: 100,
      finishedAt: new Date(),
      stats: JSON.stringify(stats),
    },
  });

  // Reset source state
  await db.source.update({
    where: { id: sourceId },
    data: { runState: "idle", lastRunAt: new Date() },
  });

  // Bump usage metrics
  await bumpUsageMetric(job.organizationId, "emails_scanned", emailsMatched);

  // Always queue a DETERMINISTIC_SYNC job to populate the Default Dataset.
  // This runs even if emailsMatched is 0 (clears stale state safely).
  if (emailsMatched > 0) {
    await enqueueJob({
      organizationId: job.organizationId,
      type: "DETERMINISTIC_SYNC",
      payload: { sourceId },
    });
  }

  return { mode, stats };
}
