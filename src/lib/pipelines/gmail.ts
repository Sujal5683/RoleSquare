import { db } from "@/lib/db";
import { updateRunProgress } from "@/lib/job-runner";
import { ensureDefaultDataset } from "@/lib/dataset-provisioner";
import { bumpUsageMetric } from "@/lib/usage";
import { getGmailClient, extractEmailBody, extractAttachments, extractDriveLinks, getHeader } from "@/lib/google-client";
import { agentInfo } from "@/lib/agent-logger";
import { enqueueJob } from "@/lib/queue";
import crypto from "crypto";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Strips HTML tags from a string so regex link extraction works on href values.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

/**
 * Formats a single message in the thread for inclusion in the combined body.
 * Each message is separated by a clear divider so the AI extractor sees context.
 */
function formatMessageInThread(
  index: number,
  from: string,
  date: string,
  body: string
): string {
  const header = `=== Message ${index + 1} — ${date} | From: ${from} ===`;
  return `${header}\n${body.trim()}`;
}

export async function processGmailScan(
  job: { id: string; organizationId: string; payload: string },
  payload: { sourceId?: string; runId?: string; mode?: string }
): Promise<Record<string, unknown>> {
  const { sourceId, runId, mode } = payload;
  if (!sourceId || !runId) {
    throw new Error("Missing sourceId or runId in GMAIL_SCAN payload");
  }

  // Idempotency check
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

  // ── Build Gmail search query from SourceRules ────────────────────────────────
  const queryParts: string[] = [];
  for (const rule of source.rules) {
    let value: unknown;
    try { value = JSON.parse(rule.value); } catch { value = rule.value; }
    switch (rule.filterType) {
      case "sender": {
        const senders = Array.isArray(value)
          ? value
          : (typeof value === "string" ? value.split(",").map(s => s.trim()).filter(Boolean) : [String(value)]);
        queryParts.push(`(${senders.map(s => `from:${s}`).join(" OR ")})`);
        break;
      }
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
              queryParts.push(`(${exts.map(e => `filename:${e}`).join(" OR ")})`);
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

  // ── Step 1: Fetch matching message IDs then group by threadId ───────────────
  const gmail = await getGmailClient(source.googleConnectionId);
  const listResp = await gmail.users.messages.list({
    userId: "me",
    q: gmailQuery || undefined,
    maxResults: source.maxEmailsPerScan ?? 100,
  }, { signal: AbortSignal.timeout(30000) });
  const messageRefs = listResp.data.messages ?? [];

  // Group message IDs by threadId using a lightweight batch — we only need the
  // threadId from each message, so we fetch metadata format (much faster than full).
  // Then for each unique threadId we fetch the full thread via threads.get().
  const threadIdToMessageIds = new Map<string, string[]>();
  const chunkSize = 10;

  for (let i = 0; i < messageRefs.length; i += chunkSize) {
    const pct = 20 + Math.floor((i / Math.max(messageRefs.length, 1)) * 10);
    await updateRunProgress(runId, pct, "grouping");

    // Sleep between chunks to respect Gmail API rate limits (250 quota units / sec)
    if (i > 0) await new Promise(r => setTimeout(r, 500));

    const chunk = messageRefs.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (ref) => {
      if (!ref.id) return;
      try {
        const meta = await gmail.users.messages.get({
          userId: "me",
          id: ref.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }, { signal: AbortSignal.timeout(15000) });
        const tid = meta.data.threadId ?? ref.id; // fallback to messageId if no threadId
        if (!threadIdToMessageIds.has(tid)) threadIdToMessageIds.set(tid, []);
        threadIdToMessageIds.get(tid)!.push(ref.id);
      } catch (err) {
        console.warn(`[gmail] Failed to get metadata for message ${ref.id}:`, err instanceof Error ? err.message : err);
        throw err; // Do not silently swallow errors, otherwise data is lost!
      }
    }));
  }

  const uniqueThreadIds = [...threadIdToMessageIds.keys()];
  await agentInfo(
    job.id, job.organizationId, "system",
    `Found ${messageRefs.length} messages in ${uniqueThreadIds.length} unique threads`,
    { query: gmailQuery, sourceId, threads: uniqueThreadIds.length }
  );
  await updateRunProgress(runId, 40, "fetching");

  let emailsMatched = 0;
  let attachmentsFound = 0;
  let driveLinksDiscovered = 0;
  const total = uniqueThreadIds.length;

  // ── Step 2: For each unique thread, fetch all messages and combine them ──────
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = uniqueThreadIds.slice(i, i + chunkSize);
    const pct = 40 + Math.floor(((i + 1) / Math.max(total, 1)) * 50);
    await updateRunProgress(runId, pct, "parsing");

    // Sleep between chunks to respect Gmail API rate limits
    if (i > 0) await new Promise(r => setTimeout(r, 1000));

    await Promise.all(chunk.map(async (threadId) => {
      try {
        // Fetch full thread — all messages, already in chronological order
        const threadResp = await gmail.users.threads.get({
          userId: "me",
          id: threadId,
          format: "full",
        }, { signal: AbortSignal.timeout(45000) });

        const messages = threadResp.data.messages ?? [];
        if (messages.length === 0) return;

        // Sort chronologically (oldest first) — threads.get usually returns them
        // in order, but sort defensively by internalDate.
        messages.sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0));

        const firstMsg = messages[0];
        const lastMsg  = messages[messages.length - 1];

        const firstHeaders = firstMsg.payload?.headers ?? [];
        const lastHeaders  = lastMsg.payload?.headers  ?? [];

        // Thread-level fields come from the FIRST message (the original)
        const fromAddress = getHeader(firstHeaders, "from");
        const toAddress   = getHeader(firstHeaders, "to");
        const ccAddresses = getHeader(firstHeaders, "cc") || null;
        const subject     = getHeader(firstHeaders, "subject");

        // Date = LATEST reply (most recent activity in the thread)
        const lastDateStr = getHeader(lastHeaders, "date");
        const receivedAt  = lastDateStr ? new Date(lastDateStr) : new Date();
        const snippet     = lastMsg.snippet ?? firstMsg.snippet ?? "";

        // ── Combine bodies of ALL messages in the thread ──────────────────────
        const combinedTextParts: string[] = [];
        const combinedHtmlParts: string[] = [];
        const allAttachments: { filename: string; mimeType: string; size: number; attachmentId: string; emailInternalId?: string }[] = [];

        for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
          const msg = messages[msgIdx];
          const headers = msg.payload?.headers ?? [];
          const msgFrom = getHeader(headers, "from");
          const msgDate = getHeader(headers, "date");

          const { text: bodyText, html: bodyHtml } = extractEmailBody(msg.payload);

          if (bodyText || bodyHtml) {
            const formatted = formatMessageInThread(msgIdx, msgFrom, msgDate, bodyText || stripHtml(bodyHtml));
            combinedTextParts.push(formatted);
          }
          if (bodyHtml) {
            combinedHtmlParts.push(bodyHtml);
          }

          // Collect attachments from every message in the thread
          const atts = extractAttachments(msg.payload);
          for (const att of atts) {
            allAttachments.push({ ...att, emailInternalId: msg.id ?? undefined });
          }
        }

        const combinedBodyText = combinedTextParts.join("\n\n");
        const combinedBodyHtml = combinedHtmlParts.join("\n");

        // Use the LAST message's ID as the googleMessageId (for incremental scan dedup)
        const lastMessageId = lastMsg.id ?? threadId;
        const dedupHash = crypto.createHash("sha256").update(threadId).digest("hex");

        // ── Upsert a single Email row per thread ──────────────────────────────
        let email = await db.email.findFirst({
          where: {
            sourceId,
            OR: [
              { threadId },
              { googleMessageId: lastMessageId }
            ]
          }
        });

        if (email) {
          email = await db.email.update({
            where: { id: email.id },
            data: {
              googleMessageId: lastMessageId,
              threadId,
              fromAddress,
              toAddress,
              ccAddresses,
              subject,
              snippet,
              bodyText: combinedBodyText || null,
              bodyHtml: combinedBodyHtml || null,
              receivedAt,
              messageCount: messages.length,
              processingStatus: "matched",
            }
          });
        } else {
          email = await db.email.create({
            data: {
              sourceId,
              googleMessageId: lastMessageId,
              threadId,
              fromAddress,
              toAddress,
              ccAddresses,
              subject,
              snippet,
              bodyText: combinedBodyText || null,
              bodyHtml: combinedBodyHtml || null,
              receivedAt,
              messageCount: messages.length,
              dedupHash,
              processingStatus: "matched",
            }
          });
        }
        emailsMatched++;

        // ── Attachments (union across all messages in the thread) ─────────────
        for (const att of allAttachments) {
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

        // ── Drive links (union across all messages in the thread) ─────────────
        // Strip HTML before matching so href="..." values are captured fully
        const strippedHtml = combinedBodyHtml.replace(/<[^>]+>/g, " ");
        const fullText = combinedBodyText + " " + strippedHtml;
        const driveLinks = extractDriveLinks(fullText);

        for (const url of driveLinks) {
          const resourceType = url.includes("docs.google.com/document") ? "docs"
            : url.includes("docs.google.com/spreadsheets") ? "sheets"
            : url.includes("docs.google.com/forms") ? "forms"
            : url.includes("drive.google.com") ? "drive"
            : url.includes("slides.google.com") ? "slides"
            : url.includes("script.google.com") ? "script"
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
        console.warn(`[gmail] Failed to process thread ${threadId}:`, err instanceof Error ? err.message : err);
        throw err; // Fail the job rather than silently swallowing data loss
      }
    }));
  }

  await updateRunProgress(runId, 95, "finalizing");

  const stats = { emailsMatched, attachmentsFound, driveLinksDiscovered, recordsExtracted: emailsMatched, threadsProcessed: uniqueThreadIds.length };

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

  await bumpUsageMetric(job.organizationId, "emails_scanned", emailsMatched);

  if (emailsMatched > 0) {
    await enqueueJob({
      organizationId: job.organizationId,
      type: "DETERMINISTIC_SYNC",
      payload: { sourceId },
    });
  }

  return { mode, stats };
}
