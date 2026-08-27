import { db } from "@/lib/db";
import { updateRunProgress } from "@/lib/job-runner";
import { ensureDefaultDataset } from "@/lib/dataset-provisioner";
import { bumpUsageMetric } from "@/lib/usage";
import { getFormsClient } from "@/lib/google-client";
import { agentInfo } from "@/lib/agent-logger";

export async function processFormsScan(
  job: { id: string; organizationId: string; payload: string },
  payload: { sourceId?: string; runId?: string; mode?: string }
): Promise<Record<string, unknown>> {
  const { sourceId, runId, mode } = payload;
  if (!sourceId || !runId) {
    throw new Error("Missing sourceId or runId in FORMS_SCAN payload");
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

  let formId: string | null = null;
  for (const rule of source.rules) {
    let value: string;
    try { value = JSON.parse(rule.value as string); } catch { value = String(rule.value); }
    if (rule.filterType === "form_id") {
      formId = value;
      break;
    }
  }

  if (!formId) {
    throw new Error("FORMS_SCAN requires a form_id rule.");
  }

  await updateRunProgress(runId, 20, "scanning");

  const forms = await getFormsClient(source.googleConnectionId);
  
  await updateRunProgress(runId, 35, "fetching");
  let responsesMatched = 0;

  try {
    const formResp = await forms.forms.get({
      formId: formId,
    }, { signal: AbortSignal.timeout(30000) });
    const formTitle = formResp.data.info?.title ?? "Untitled Form";

    const responsesResp = await forms.forms.responses.list({
      formId: formId,
    });
    
    const responses = responsesResp.data.responses ?? [];
    await agentInfo(job.id, job.organizationId, "system", `Fetched ${responses.length} responses from form`, { formId, sourceId });

    for (const response of responses) {
      if (!response.responseId) continue;
      
      const submitter = response.respondentEmail ?? "anonymous";
      const submittedAt = response.createTime ? new Date(response.createTime) : new Date();
      const responseData = JSON.stringify(response.answers ?? {});
      
      await db.email.upsert({
        where: { sourceId_googleMessageId: { sourceId, googleMessageId: response.responseId } },
        create: {
          sourceId,
          googleMessageId: response.responseId,
          fromAddress: submitter,
          toAddress: "",
          subject: formTitle,
          snippet: "application/vnd.google-apps.form",
          bodyText: responseData,
          bodyHtml: null,
          receivedAt: submittedAt,
          dedupHash: response.responseId,
          processingStatus: "matched",
        },
        update: {
          subject: formTitle,
          bodyText: responseData,
          receivedAt: submittedAt,
          processingStatus: "matched",
        },
      });
      responsesMatched++;
    }
  } catch (err) {
    console.warn(`[forms-scan] Failed to process form ${formId}:`, err instanceof Error ? err.message : err);
  }

  await updateRunProgress(runId, 95, "finalizing");

  const stats = { responsesMatched, recordsExtracted: 0 };

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

  await bumpUsageMetric(job.organizationId, "emails_scanned", responsesMatched);

  if (responsesMatched > 0) {
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
