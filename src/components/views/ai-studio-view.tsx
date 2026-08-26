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
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { ExtractionRunsTab } from "@/components/ai-studio/extraction-runs-tab";
import { AgentLogsTab } from "@/components/ai-studio/agent-logs-tab";
import { ModelCostTab } from "@/components/ai-studio/model-cost-tab";
import { ExtractionWizard } from "@/components/ai-studio/extraction-wizard";

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

// ── Component ────────────────────────────────────────────────────────────

export function AiStudioView() {
  const [tab, setTab] = useState("wizard");

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Studio"
        description="Monitor extraction runs, test prompts against real text, audit agent activity, and track model usage and costs."
        icon={<Brain className="h-5 w-5" />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="wizard">
            <Workflow className="mr-1.5 h-3.5 w-3.5" />
            Extract Data
          </TabsTrigger>
          <TabsTrigger value="sandbox">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Test Sandbox
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            Insights &amp; Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wizard" className="mt-4">
          <ExtractionWizard />
        </TabsContent>
        <TabsContent value="sandbox" className="mt-4">
          <TestSandboxTab />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <InsightsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Insights & Logs combined tab ─────────────────────────────────────────

function InsightsTab() {
  const [insightTab, setInsightTab] = useState("runs");
  return (
    <div className="space-y-4">
      <Tabs value={insightTab} onValueChange={setInsightTab}>
        <TabsList>
          <TabsTrigger value="runs">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            Extraction Runs
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

// ── Test Sandbox tab ─────────────────────────────────────────────────────

function TestSandboxTab() {
  const [schemaId, setSchemaId] = useState<string>("");
  const [sourceText, setSourceText] = useState<string>(SAMPLE_TEXT);
  const [hoveredEvidence, setHoveredEvidence] = useState<string | null>(null);

  // Schemas list
  const { data: schemas } = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
  });

  // Default to the first schema when none selected.
  useEffect(() => {
    if (schemaId === "" && schemas && schemas.length > 0) {
      setSchemaId(schemas[0].id);
    }
  }, [schemaId, schemas]);

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
            {hoveredEvidence ? (
              <div className="relative">
                <div className="whitespace-pre-wrap rounded-md border border-transparent px-3 py-2 text-xs font-mono max-h-[280px] overflow-y-auto overflow-x-hidden bg-muted/20">
                  {sourceText.split(hoveredEvidence).map((part, i, arr) => (
                    <span key={i}>
                      {part}
                      {i < arr.length - 1 && (
                        <mark className="bg-primary/30 text-primary-foreground font-bold px-0.5 rounded-sm">
                          {hoveredEvidence}
                        </mark>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <Textarea
                id="source-text"
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={12}
                className="font-mono text-xs max-h-[280px]"
                placeholder="Paste an email body, document excerpt, or any unstructured text…"
              />
            )}
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
                  className={`rounded-lg border p-3 ${result.fieldsNeedingReview && result.fieldsNeedingReview > 0
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
                        onHover={(isHovering) => setHoveredEvidence(isHovering ? (f.evidence ?? null) : null)}
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
  onHover,
}: {
  field: ExtractionFieldResult;
  reviewFlag?: FieldReviewFlag;
  onHover?: (isHovering: boolean) => void;
}) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  return (
    <div
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 ${reviewFlag?.needsReview
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
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${feedback === "up" ? "text-emerald-500 bg-emerald-500/10" : "text-muted-foreground"}`}
            onClick={() => setFeedback(f => f === "up" ? null : "up")}
            title="Good extraction"
          >
            <ThumbsUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${feedback === "down" ? "text-red-500 bg-red-500/10" : "text-muted-foreground"}`}
            onClick={() => setFeedback(f => f === "down" ? null : "down")}
            title="Poor extraction"
          >
            <ThumbsDown className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
