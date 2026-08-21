"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/api-client";
import type {
  AiJobDTO,
  AiOutputDTO,
  AuditLogDTO,
  ExtractionResult,
  ExtractionFieldResult,
  FieldReviewFlag,
  JobType,
  SchemaDTO,
  UsageMetricDTO,
} from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
  StatCard,
} from "@/components/ui/page-elements";
import {
  StatusBadge,
  JobTypeBadge,
  FieldTypeBadge,
  ConfidenceBadge,
} from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Brain,
  Sparkles,
  Microscope,
  ShieldCheck,
  Workflow,
  BookOpen,
  Bot,
  Play,
  RotateCcw,
  RefreshCw,
  Activity,
  Cpu,
  DollarSign,
  Zap,
  TrendingUp,
  Eye,
  Clock,
  FileText,
  Hash,
  AlertCircle,
  ArrowRight,
  Layers,
  Gauge,
  CheckCircle2,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy HH:mm");
  } catch {
    return "—";
  }
}

const SAMPLE_TEXT =
  "TechCorp is hiring Software Engineer Interns for Summer 2025.\n" +
  "Location: Bangalore (Remote-friendly)\n" +
  "CTC: 28 LPA\n" +
  "Eligibility: B.Tech CS/IT/EE, CGPA 7.5+\n" +
  "Deadline: 15 Oct 2025";

// ── Agent definitions ────────────────────────────────────────────────────

interface AgentDef {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  jobType: JobType;
}

const AGENTS: AgentDef[] = [
  {
    key: "extractor",
    name: "Extractor",
    description: "Parses sources and pulls raw field values with evidence snippets.",
    icon: <Sparkles className="h-4 w-4" />,
    jobType: "AI_EXTRACTION",
  },
  {
    key: "analyst",
    name: "Analyst",
    description: "Cross-references values with the schema and source context.",
    icon: <Microscope className="h-4 w-4" />,
    jobType: "AI_EXTRACTION",
  },
  {
    key: "validator",
    name: "Validator",
    description: "Confidence scoring, type checks, and policy enforcement.",
    icon: <ShieldCheck className="h-4 w-4" />,
    jobType: "AI_VALIDATION",
  },
  {
    key: "transformer",
    name: "Transformer",
    description: "Normalises values (dates, units, enums) into the schema shape.",
    icon: <Workflow className="h-4 w-4" />,
    jobType: "AI_VALIDATION",
  },
  {
    key: "researcher",
    name: "Researcher",
    description: "Enriches records with secondary lookups when confidence is low.",
    icon: <BookOpen className="h-4 w-4" />,
    jobType: "AI_EXTRACTION",
  },
  {
    key: "assistant",
    name: "Assistant",
    description: "Surfaces review queue and drafts human-in-the-loop prompts.",
    icon: <Bot className="h-4 w-4" />,
    jobType: "AI_VALIDATION",
  },
];

// MODEL_CHAIN is now driven by /api/ai/model-status — see ModelCostTab.
// This constant is intentionally removed; do not add hardcoded model lists here.

const COST_PER_1K = 0.001;

// ── Component ────────────────────────────────────────────────────────────

export function AiStudioView() {
  const [tab, setTab] = useState("runs");

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Studio"
        description="Monitor extraction runs, test prompts against real text, audit agent activity, and track model usage and costs."
        icon={<Brain className="h-5 w-5" />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="runs">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            Extraction Runs
          </TabsTrigger>
          <TabsTrigger value="sandbox">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Test Sandbox
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            Agent Logs
          </TabsTrigger>
          <TabsTrigger value="cost">
            <DollarSign className="mr-1.5 h-3.5 w-3.5" />
            Model &amp; Cost
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="mt-4">
          <ExtractionRunsTab />
        </TabsContent>
        <TabsContent value="sandbox" className="mt-4">
          <TestSandboxTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <AgentLogsTab />
        </TabsContent>
        <TabsContent value="cost" className="mt-4">
          <ModelCostTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Extraction Runs tab ──────────────────────────────────────────────────

function ExtractionRunsTab() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data: extractionList, isLoading: loadingExtr, isError: errExtr, refetch: refetchExtr } = useQuery({
    queryKey: ["ai-jobs", "AI_EXTRACTION", "studio"],
    queryFn: () =>
      api.get<{ data: AiJobDTO[]; total: number; page: number; pageSize: number }>(
        "/api/ai-jobs?type=AI_EXTRACTION&pageSize=50"
      ),
  });
  const { data: validationList, isLoading: loadingVal, isError: errVal, refetch: refetchVal } = useQuery({
    queryKey: ["ai-jobs", "AI_VALIDATION", "studio"],
    queryFn: () =>
      api.get<{ data: AiJobDTO[]; total: number; page: number; pageSize: number }>(
        "/api/ai-jobs?type=AI_VALIDATION&pageSize=50"
      ),
  });

  const jobs = useMemo(() => {
    const a = extractionList?.data ?? [];
    const b = validationList?.data ?? [];
    return [...a, ...b].sort(
      (x, y) =>
        new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
    );
  }, [extractionList, validationList]);

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.post<AiJobDTO>(`/api/ai-jobs/${id}/retry`),
    onSuccess: () => {
      toast.success("Job re-queued", { description: "Status reset to queued." });
      queryClient.invalidateQueries({ queryKey: ["ai-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to retry";
      toast.error("Retry failed", { description: msg });
    },
  });

  const isLoading = loadingExtr || loadingVal;
  const isError = errExtr || errVal;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Extraction &amp; Validation Runs
          <span className="text-xs font-normal text-muted-foreground">
            ({jobs.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <LoadingState rows={4} />
          </div>
        ) : isError ? (
          <div className="p-4">
            <ErrorState
              message="Failed to load AI jobs"
              onRetry={() => {
                refetchExtr();
                refetchVal();
              }}
            />
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Activity className="h-5 w-5" />}
              title="No AI runs yet"
              description="Extraction and validation jobs will appear here once your sources start ingesting or you run an extraction in the Test Sandbox."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[160px]">Progress</TableHead>
                  <TableHead className="text-center">Attempts</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow
                    key={j.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelectedJobId(j.id)}
                  >
                    <TableCell>
                      <JobTypeBadge type={j.type} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={j.progress}
                          className="h-1.5 w-24"
                        />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {j.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {j.attempts}
                    </TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground"
                      title={formatDateTime(j.startedAt)}
                    >
                      {relativeTime(j.startedAt)}
                    </TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground"
                      title={formatDateTime(j.finishedAt)}
                    >
                      {relativeTime(j.finishedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedJobId(j.id);
                          }}
                        >
                          <Eye className="mr-1.5 h-3 w-3" />
                          Details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            retryMutation.mutate(j.id);
                          }}
                        >
                          <RotateCcw className="mr-1.5 h-3 w-3" />
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <JobDetailDialog
        jobId={selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />
    </Card>
  );
}

function JobDetailDialog({
  jobId,
  onClose,
}: {
  jobId: string | null;
  onClose: () => void;
}) {
  const { data: job, isLoading } = useQuery({
    queryKey: ["ai-job", jobId],
    queryFn: () =>
      api.get<AiJobDTO & { outputs: AiOutputDTO[] }>(`/api/ai-jobs/${jobId}`),
    enabled: !!jobId,
  });

  const totalTokens = useMemo(
    () => (job?.outputs ?? []).reduce((s, o) => s + o.tokensUsed, 0),
    [job]
  );

  return (
    <Dialog
      open={!!jobId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Job detail
          </DialogTitle>
          <DialogDescription>
            {job ? (
              <span className="flex items-center gap-2">
                <JobTypeBadge type={job.type} />
                <StatusBadge status={job.status} />
                <span className="font-mono text-xs">{job.id.slice(0, 8)}</span>
              </span>
            ) : (
              "Loading job details…"
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState rows={3} />
        ) : !job ? (
          <EmptyState
            icon={<AlertCircle className="h-5 w-5" />}
            title="Job not found"
          />
        ) : (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Progress
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {job.progress}%
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Attempts
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {job.attempts}
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tokens used
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {totalTokens.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Timing */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Started</p>
                <p className="font-medium">{formatDateTime(job.startedAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Finished</p>
                <p className="font-medium">{formatDateTime(job.finishedAt)}</p>
              </div>
            </div>

            {/* Error */}
            {job.errorMessage && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive">Error</p>
                <p className="mt-1 text-xs text-destructive/90 font-mono break-words">
                  {job.errorMessage}
                </p>
              </div>
            )}

            {/* Payload */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payload
              </p>
              <pre className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
            </div>

            {/* Outputs */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                AI Outputs ({job.outputs.length})
              </p>
              {job.outputs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No model outputs recorded for this job yet.
                </p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {job.outputs.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between rounded-md border p-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono">{o.modelUsed}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          prompt:{" "}
                          <span className="font-mono">{o.promptHash.slice(0, 8)}</span>
                        </span>
                        <Badge variant="secondary" className="tabular-nums">
                          {o.tokensUsed.toLocaleString()} tok
                        </Badge>
                        <span
                          className="text-muted-foreground"
                          title={formatDateTime(o.createdAt)}
                        >
                          {relativeTime(o.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Test Sandbox tab ─────────────────────────────────────────────────────

function TestSandboxTab() {
  const [schemaId, setSchemaId] = useState<string>("");
  const [sourceText, setSourceText] = useState<string>(SAMPLE_TEXT);

  // Schemas list
  const { data: schemas } = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
  });

  // Default to the first schema when none selected (render-time adjustment).
  if (schemaId === "" && schemas && schemas.length > 0) {
    setSchemaId(schemas[0].id);
  }

  const runMutation = useMutation({
    mutationFn: (payload: { schemaId: string; sourceText: string }) =>
      api.post<ExtractionResult>("/api/extraction", payload),
    onSuccess: (res) => {
      toast.success("Extraction complete", {
        description: `${res.fields.length} field(s) extracted at ${Math.round(res.overallConfidence * 100)}% confidence.`,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      toast.error("Extraction failed", { description: msg });
    },
  });

  const handleRun = () => {
    if (!schemaId) {
      toast.error("Select a schema first");
      return;
    }
    if (!sourceText.trim()) {
      toast.error("Source text is empty");
      return;
    }
    runMutation.mutate({ schemaId, sourceText });
  };

  const result = runMutation.data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Left: input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Input
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Schema</Label>
            <Select value={schemaId} onValueChange={setSchemaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a schema" />
              </SelectTrigger>
              <SelectContent>
                {schemas && schemas.length > 0 ? (
                  schemas.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.fields.length} field(s) · v{s.version}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5" />
                    No schemas yet.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source-text">Source text</Label>
            <Textarea
              id="source-text"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={12}
              className="font-mono text-xs"
              placeholder="Paste an email body, document excerpt, or any unstructured text…"
            />
            <p className="text-xs text-muted-foreground">
              The extractor treats this content as untrusted — every output
              field is returned with a quoted evidence snippet and confidence
              score.
            </p>
          </div>

          <Button
            onClick={handleRun}
            disabled={
              runMutation.isPending || !schemaId || !sourceText.trim()
            }
            className="w-full"
          >
            {runMutation.isPending ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-2 h-3.5 w-3.5" />
            )}
            {runMutation.isPending ? "Extracting…" : "Run extraction"}
          </Button>
        </CardContent>
      </Card>

      {/* Right: results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runMutation.isPending ? (
            <LoadingState rows={4} />
          ) : runMutation.isError ? (
            <ErrorState
              message={
                runMutation.error instanceof Error
                  ? runMutation.error.message
                  : "Extraction failed"
              }
            />
          ) : !result ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No results yet"
              description="Run an extraction to see fields, confidence, and evidence snippets here."
            />
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Fields
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {result.fields.length}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Tokens
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {result.tokensUsed.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Confidence
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {Math.round(result.overallConfidence * 100)}%
                  </p>
                </div>
              </div>

              {/* Review flags summary */}
              {result.reviewFlags && result.reviewFlags.length > 0 && (
                <div
                  className={`rounded-lg border p-3 ${
                    result.fieldsNeedingReview && result.fieldsNeedingReview > 0
                      ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50"
                      : "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.fieldsNeedingReview && result.fieldsNeedingReview > 0 ? (
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    )}
                    <p className="text-sm font-medium">
                      {result.fieldsNeedingReview && result.fieldsNeedingReview > 0
                        ? `${result.fieldsNeedingReview} field(s) need human review`
                        : "All fields meet confidence thresholds"}
                    </p>
                  </div>
                  {result.fieldsNeedingReview && result.fieldsNeedingReview > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.reviewFlags
                        .filter((f) => f.needsReview)
                        .map((f, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-[10px] gap-1 bg-amber-100/50 dark:bg-amber-950/30"
                          >
                            {f.fieldName}
                            <span className="text-muted-foreground">
                              {Math.round(f.confidence * 100)}% / {Math.round(f.threshold * 100)}%
                            </span>
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Cpu className="h-3 w-3" />
                <span className="font-mono">{result.modelUsed}</span>
                <Separator orientation="vertical" className="h-3" />
                <FileText className="h-3 w-3" />
                <span className="font-mono">prompt {result.promptVersion}</span>
              </div>

              <Separator />

              {/* Fields */}
              <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
                {result.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No fields were extracted. The LLM may have refused or the
                    schema field names didn&apos;t match.
                  </p>
                ) : (
                  result.fields.map((f, i) => {
                    const flag = result.reviewFlags?.find((rf) => rf.fieldName === f.fieldName);
                    return (
                      <SandboxFieldCard
                        key={`${f.fieldName}-${i}`}
                        field={f}
                        reviewFlag={flag}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SandboxFieldCard({
  field,
  reviewFlag,
}: {
  field: ExtractionFieldResult;
  reviewFlag?: FieldReviewFlag;
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-3 ${
        reviewFlag?.needsReview
          ? "border-amber-300 dark:border-amber-800"
          : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{field.fieldName}</span>
          {reviewFlag?.needsReview && (
            <Badge
              variant="outline"
              className="text-[9px] gap-0.5 bg-amber-100/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            >
              <AlertCircle className="h-2.5 w-2.5" />
              Needs review
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {reviewFlag && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              threshold: {Math.round(reviewFlag.threshold * 100)}%
            </span>
          )}
          <ConfidenceBadge value={field.confidence} />
        </div>
      </div>
      <p className="mt-2 break-words text-base font-medium">
        {field.value == null || field.value === "" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          String(field.value)
        )}
      </p>
      {field.evidence && (
        <blockquote className="mt-2 border-l-2 border-primary/40 bg-muted/30 py-1.5 pl-3 pr-2">
          <p className="font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            “{field.evidence}”
          </p>
        </blockquote>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {field.sourceFile && (
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span className="font-mono truncate max-w-[120px]">
              {field.sourceFile}
            </span>
          </span>
        )}
        {field.pageNumber != null && (
          <span className="inline-flex items-center gap-1">
            <Hash className="h-3 w-3" />
            <span className="tabular-nums">p.{field.pageNumber}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Agent Logs tab ───────────────────────────────────────────────────────

function AgentLogsTab() {
  const [dialogAgent, setDialogAgent] = useState<AgentDef | null>(null);

  // Fetch AI jobs (all types) for the agent summary.
  const { data: allJobs, isLoading } = useQuery({
    queryKey: ["ai-jobs", "all", "studio-agents"],
    queryFn: () =>
      api.get<{ data: AiJobDTO[]; total: number; page: number; pageSize: number }>(
        "/api/ai-jobs?pageSize=100"
      ),
  });

  // Audit log timeline (extraction events)
  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ["audit", "extract-timeline"],
    queryFn: () =>
      api.get<{ data: AuditLogDTO[]; total: number; page: number; pageSize: number }>(
        "/api/audit?entity=record&action=extract&limit=20"
      ),
  });

  // Aggregate tokens per agent — sum across all jobs of that agent's job type.
  // Note: tokens live in ai_outputs, which aren't returned by the list
  // endpoint, so we display job counts here. The "tokens used" per agent
  // is fetched on demand when the user opens the View Logs dialog.
  const agentStats = useMemo(() => {
    const map: Record<string, { count: number; lastStatus: string | null }> = {};
    for (const a of AGENTS) map[a.key] = { count: 0, lastStatus: null };
    const sorted = [...(allJobs?.data ?? [])].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    for (const a of AGENTS) {
      const jobsForAgent = sorted.filter((j) => j.type === a.jobType);
      map[a.key].count = jobsForAgent.length;
      map[a.key].lastStatus = jobsForAgent[0]?.status ?? null;
    }
    return map;
  }, [allJobs]);

  return (
    <div className="space-y-4">
      {/* Agent cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((a) => (
          <Card key={a.key} className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {a.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{a.name}</h3>
                  {(() => {
                    const lastStatus = agentStats[a.key]?.lastStatus;
                    return lastStatus ? (
                      <StatusBadge status={lastStatus} />
                    ) : null;
                  })()}
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {a.description}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">{a.jobType}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDialogAgent(a)}
                  >
                    <Eye className="mr-1.5 h-3 w-3" />
                    View logs
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Audit timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Extraction Audit Timeline
            <span className="text-xs font-normal text-muted-foreground">
              ({auditLogs?.data?.length ?? 0})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <LoadingState rows={3} />
          ) : !auditLogs || auditLogs.data.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-5 w-5" />}
              title="No extraction events yet"
              description="Audit log entries from AI extraction runs will appear here."
            />
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
              {auditLogs.data.map((log) => {
                const after = log.after ?? {};
                const tokens = typeof after.tokensUsed === "number"
                  ? after.tokensUsed as number
                  : null;
                const conf = typeof after.overallConfidence === "number"
                  ? after.overallConfidence as number
                  : null;
                const fieldsExtracted = typeof after.fieldsExtracted === "number"
                  ? after.fieldsExtracted as number
                  : null;
                return (
                  <div
                    key={log.id}
                    className="relative border-l-2 border-primary/40 pl-4 pb-3"
                  >
                    <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono capitalize">
                        {log.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        on{" "}
                        <span className="font-mono">{log.entity}</span>
                        {log.entityId && (
                          <span className="font-mono">
                            {" "}
                            · {log.entityId.slice(0, 8)}…
                          </span>
                        )}
                      </span>
                      <span
                        className="ml-auto text-xs text-muted-foreground"
                        title={formatDateTime(log.createdAt)}
                      >
                        {relativeTime(log.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        by{" "}
                        <span className="font-medium text-foreground">
                          {log.actorName ?? log.actorId ?? "system"}
                        </span>
                      </span>
                      {fieldsExtracted != null && (
                        <Badge variant="secondary" className="tabular-nums">
                          {fieldsExtracted} fields
                        </Badge>
                      )}
                      {tokens != null && (
                        <Badge variant="secondary" className="tabular-nums">
                          {tokens.toLocaleString()} tok
                        </Badge>
                      )}
                      {conf != null && (
                        <ConfidenceBadge value={conf} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && <LoadingState rows={2} />}

      <AgentLogsDialog
        agent={dialogAgent}
        onClose={() => setDialogAgent(null)}
      />
    </div>
  );
}

function AgentLogsDialog({
  agent,
  onClose,
}: {
  agent: AgentDef | null;
  onClose: () => void;
}) {
  const { data: jobs, isLoading } = useQuery({
    queryKey: ["ai-jobs", agent?.jobType, "agent-dialog", agent?.key],
    queryFn: () =>
      api.get<{ data: AiJobDTO[]; total: number; page: number; pageSize: number }>(
        `/api/ai-jobs?type=${agent!.jobType}&pageSize=20`
      ),
    enabled: !!agent,
  });

  // Fetch detailed outputs for the first 10 jobs (to compute tokens used).
  const { data: detailedJobs, isLoading: detailedLoading } = useQuery({
    queryKey: ["ai-jobs-detailed", agent?.jobType],
    queryFn: async () => {
      const list = await api.get<{ data: AiJobDTO[]; total: number }>(
        `/api/ai-jobs?type=${agent!.jobType}&pageSize=10`
      );
      return Promise.all(
        list.data.map((j) =>
          api.get<AiJobDTO & { outputs: AiOutputDTO[] }>(`/api/ai-jobs/${j.id}`)
        )
      );
    },
    enabled: !!agent,
  });

  const totalTokens = useMemo(
    () =>
      (detailedJobs ?? []).reduce(
        (sum, j) => sum + (j.outputs ?? []).reduce((s, o) => s + o.tokensUsed, 0),
        0
      ),
    [detailedJobs]
  );

  return (
    <Dialog
      open={!!agent}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {agent?.icon}
            {agent?.name} agent — recent runs
          </DialogTitle>
          <DialogDescription>
            {agent ? (
              <span>
                Type <span className="font-mono">{agent.jobType}</span> ·{" "}
                {agent.description}
              </span>
            ) : (
              ""
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Jobs (last 10)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {detailedLoading ? "…" : (detailedJobs ?? []).length}
            </p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tokens used (sum)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {detailedLoading ? "…" : totalTokens.toLocaleString()}
            </p>
          </div>
        </div>

        {isLoading ? (
          <LoadingState rows={3} />
        ) : !jobs || jobs.data.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="No jobs for this agent yet"
            description={`No ${agent?.jobType} jobs have been recorded.`}
          />
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {jobs.data.map((j) => (
              <div
                key={j.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-xs"
              >
                <JobTypeBadge type={j.type} />
                <StatusBadge status={j.status} />
                <span className="text-muted-foreground">
                  attempts:{" "}
                  <span className="font-mono tabular-nums">{j.attempts}</span>
                </span>
                <span
                  className="ml-auto text-muted-foreground"
                  title={formatDateTime(j.createdAt)}
                >
                  {relativeTime(j.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Model & Cost tab ─────────────────────────────────────────────────────

interface ModelStatusResponse {
  models: {
    modelId: string;
    displayName: string;
    role: string;
    status: "active" | "rate_limited";
    cooldownUntil: string | null;
    cooldownRemainingSeconds: number;
    rateLimitHits: number;
    successCount: number;
    lastUsedAt: string | null;
  }[];
  updatedAt: string;
}

function ModelCostTab() {
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["usage"],
    queryFn: () => api.get<UsageMetricDTO[]>("/api/usage"),
  });

  const { data: jobsByType, isLoading: jobsLoading } = useQuery({
    queryKey: ["ai-jobs", "all", "by-type"],
    queryFn: () =>
      api.get<{ data: AiJobDTO[]; total: number; page: number; pageSize: number }>(
        "/api/ai-jobs?pageSize=200"
      ),
  });

  // Live model chain status — poll every 10s so cooldown countdowns stay fresh
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);
  const [modelStatusLoading, setModelStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        setModelStatusLoading(true);
        const data = await api.get<ModelStatusResponse>("/api/ai/model-status");
        if (!cancelled) setModelStatus(data);
      } catch {
        // ignore — server may not be ready yet
      } finally {
        if (!cancelled) setModelStatusLoading(false);
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const aiTokens = useMemo(() => {
    const m = (usage ?? []).find((u) => u.metricType === "ai_tokens");
    return m?.value ?? 0;
  }, [usage]);

  const cost = (aiTokens / 1000) * COST_PER_1K;

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const j of jobsByType?.data ?? []) {
      counts[j.type] = (counts[j.type] ?? 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => ({
      type,
      count,
    }));
  }, [jobsByType]);

  return (
    <div className="space-y-4">
      {/* Top stat row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tokens this month"
          value={usageLoading ? "…" : aiTokens.toLocaleString()}
          icon={<Zap className="h-4 w-4" />}
          hint="Across all AI jobs"
        />
        <StatCard
          label="Estimated cost"
          value={usageLoading ? "…" : `$${cost.toFixed(4)}`}
          icon={<DollarSign className="h-4 w-4" />}
          hint={`@ $${COST_PER_1K.toFixed(3)} / 1K tokens`}
        />
        <StatCard
          label="AI jobs (total)"
          value={jobsLoading ? "…" : (jobsByType?.total ?? 0)}
          icon={<Activity className="h-4 w-4" />}
          hint="All types"
        />
        <StatCard
          label="Cost / 1K records"
          value="—"
          icon={<TrendingUp className="h-4 w-4" />}
          hint="Projected"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Live model chain card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" />
              Gemini Model Chain
              {modelStatusLoading && (
                <RefreshCw className="ml-1 h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {modelStatusLoading ? (
              <LoadingState rows={5} />
            ) : !modelStatus || modelStatus.models.length === 0 ? (
              <EmptyState
                icon={<Cpu className="h-5 w-5" />}
                title="No model status available"
                description="Model status is only available when the server is running."
              />
            ) : (
              <>
                <div className="space-y-2">
                  {modelStatus.models.map((m, i) => (
                    <div
                      key={m.modelId}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                        m.status === "active"
                          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30"
                          : "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30"
                      }`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{m.displayName}</p>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {m.role} · <span className="font-mono">{m.modelId}</span>
                        </p>
                        {m.status === "rate_limited" && m.cooldownRemainingSeconds > 0 && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            cooldown: {m.cooldownRemainingSeconds}s remaining
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {m.status === "active" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]">
                            <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px]">
                            <Clock className="mr-1 h-2.5 w-2.5" />
                            Rate limited
                          </Badge>
                        )}
                        {m.successCount > 0 && (
                          <span className="text-[9px] text-muted-foreground tabular-nums">
                            {m.successCount} calls
                          </span>
                        )}
                        {m.rateLimitHits > 0 && (
                          <span className="text-[9px] text-amber-600 dark:text-amber-400 tabular-nums">
                            {m.rateLimitHits} 429s
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Live fallback — when a model returns 429, the next in chain is
                  used automatically. Status resets after cooldown.
                  {modelStatus.updatedAt && (
                    <> Updated {relativeTime(modelStatus.updatedAt)}.</>
                  )}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Job-type chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              Jobs by type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <LoadingState rows={4} />
            ) : chartData.length === 0 ? (
              <EmptyState
                icon={<Layers className="h-5 w-5" />}
                title="No jobs yet"
              />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 8, right: 16, bottom: 24, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="type"
                      tick={{ fontSize: 10 }}
                      angle={-25}
                      textAnchor="end"
                      height={50}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid hsl(var(--border))",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Cost calculation breakdown */}
            <Separator className="my-4" />
            <div className="space-y-1.5 text-xs">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cost calculation
              </p>
              <div className="flex items-center justify-between font-mono">
                <span className="text-muted-foreground">tokens_used</span>
                <span className="tabular-nums">{aiTokens.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-muted-foreground">rate</span>
                <span className="tabular-nums">
                  ${COST_PER_1K.toFixed(3)} / 1K
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-muted-foreground">tokens ÷ 1000 × rate</span>
                <span className="tabular-nums">
                  {(aiTokens / 1000).toFixed(2)} × ${COST_PER_1K.toFixed(3)}
                </span>
              </div>
              <Separator className="my-1" />
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Estimated cost</span>
                <span className="tabular-nums">${cost.toFixed(4)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
