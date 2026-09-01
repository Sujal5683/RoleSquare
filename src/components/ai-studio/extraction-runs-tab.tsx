"use client";

// ExtractionRunsTab — shows AI_EXTRACTION jobs for the org with:
//   - Job list with status, progress, payload details
//   - AI Outputs panel (real AiOutput rows: model, tokens, cost, raw response)
//   - Payload display with record IDs toggle

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { sanitizeSensitiveIds } from "@/lib/serialize";
import type { AiJobDTO, AiOutputDTO, DatasetDTO, SchemaDTO } from "@/lib/types";
import { LoadingState, EmptyState } from "@/components/ui/page-elements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Hash,
  RefreshCw,
  Zap,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface JobListResponse {
  data: AiJobDTO[];
  total: number;
}

interface OutputListResponse {
  data: AiOutputDTO[];
  total: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case "success": return "bg-emerald-500/15 text-emerald-600 border-emerald-200";
    case "running": return "bg-blue-500/15 text-blue-600 border-blue-200";
    case "failed":  return "bg-red-500/15 text-red-600 border-red-200";
    case "queued":  return "bg-amber-500/15 text-amber-600 border-amber-200";
    case "retry":   return "bg-orange-500/15 text-orange-600 border-orange-200";
    default:        return "bg-muted text-muted-foreground";
  }
}

function formatCost(costUsd: number) {
  if (costUsd === 0) return "$0.00";
  if (costUsd < 0.0001) return `$${costUsd.toExponential(2)}`;
  return `$${costUsd.toFixed(4)}`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Component ────────────────────────────────────────────────────────────────

export function ExtractionRunsTab() {
  const queryClient = useQueryClient();
  const orgId = useAppStore((s) => s.selectedOrganizationId);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showPayloadIds, setShowPayloadIds] = useState(false);
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null);
  const [page] = useState(1);

  const { data: jobsResp, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<JobListResponse>({
    queryKey: ["ai-jobs", orgId, "AI_EXTRACTION", page],
    queryFn: () =>
      api.get<JobListResponse>(`/api/ai-jobs?type=AI_EXTRACTION&page=${page}&pageSize=50`),
    enabled: !!orgId,
    refetchInterval: (query) => {
      const active = query.state.data?.data?.filter((j: any) => j.status === "running" || j.status === "queued") || [];
      return active.length > 0 ? 5000 : false;
    },
  });

  const selectedJob = jobsResp?.data?.find((j) => j.id === selectedJobId);

  const { data: outputsResp, isLoading: outputsLoading } = useQuery<OutputListResponse>({
    queryKey: ["ai-outputs", selectedJobId],
    queryFn: () =>
      api.get<OutputListResponse>(`/api/ai-jobs/${selectedJobId}/outputs`),
    enabled: !!selectedJobId,
    refetchInterval: () => {
      return (selectedJob?.status === "running" || selectedJob?.status === "queued") ? 1500 : false;
    },
  });

  // Scoped to orgId — shares the global cache with AI Studio wizard and other views
  const { data: datasets } = useQuery({
    queryKey: ["datasets", orgId],
    queryFn: () => api.get<DatasetDTO[]>("/api/datasets"),
    enabled: !!orgId,
  });
  
  const { data: schemas } = useQuery({
    queryKey: ["schemas", orgId],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
    enabled: !!orgId,
  });

  // Retry mutation — re-queues job to BullMQ
  const retryMutation = useMutation({
    mutationFn: (jobId: string) => api.post<AiJobDTO>(`/api/ai-jobs/${jobId}/retry`),
    onSuccess: () => {
      toast.success("Extraction retrying — remaining rows will be processed");
      refetchJobs();
      queryClient.invalidateQueries({ queryKey: ["ai-outputs", selectedJobId] });
    },
    onError: (err: any) => toast.error("Retry failed", { description: err.message }),
  });

  const outputs = outputsResp?.data ?? [];

  // Totals from outputs
  const totalTokens = outputs.reduce((s, o) => s + o.tokensUsed, 0);
  const totalCost = outputs.reduce((s, o) => s + (o.costUsd ?? 0), 0);
  const totalOutputs = outputs.length;

  return (
    <div className="flex gap-4 overflow-hidden h-[calc(100vh-280px)] min-h-[500px]">
      {/* Left — job list */}
      <div className="w-72 flex-shrink-0 flex flex-col h-full">
        <div className="flex items-center justify-between pb-2 pt-1 border-b mb-2 shrink-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Extraction Jobs
          </p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetchJobs()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-2 -mr-2 pb-2">
          {jobsLoading ? (
            <LoadingState rows={4} />
          ) : !jobsResp?.data?.length ? (
            <EmptyState
              icon={<Zap className="h-4 w-4" />}
              title="No extraction jobs yet"
              description="Run an extraction from AI Studio to see results here."
            />
          ) : (
          jobsResp.data.map((job) => {
            const payload = job.payload as Record<string, unknown>;
            const isSelected = job.id === selectedJobId;
            const targetDs = datasets?.find(d => d.id === payload?.targetDatasetId);
            const sourceDs = datasets?.find(d => d.id === payload?.sourceDatasetId);
            const targetName = String(payload?.targetDatasetName || targetDs?.name || (payload?.targetDatasetId ? String(payload.targetDatasetId).slice(0, 8) + "…" : "New"));
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedJobId(job.id)}
                className={`text-left rounded-lg border p-3 transition-colors w-full ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold truncate max-w-[140px]" title={`Extraction: ${sourceDs?.name ?? 'Unknown'} → ${targetName}`}>
                    Ext: {sourceDs?.name?.slice(0, 10) ?? 'Src'} → {targetName.slice(0, 10)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusColor(job.status)}`}>
                    {job.status}
                  </span>
                </div>
                {job.status === "running" && (
                  <div className="w-full bg-muted rounded-full h-1 mb-1.5">
                    <div
                      className="bg-primary h-1 rounded-full transition-all"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground truncate" title={sourceDs?.name ? `Source: ${sourceDs.name}` : undefined}>
                  {payload?.targetDatasetId || payload?.targetDatasetName
                    ? `→ ${targetName}`
                    : "One-step extraction"}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {new Date(job.createdAt).toLocaleString()}
                </p>
              </button>
            );
          })
        )}
        </div>
      </div>

      <Separator orientation="vertical" className="h-auto" />

      {/* Right — detail panel */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {!selectedJob ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={<Database className="h-5 w-5" />}
              title="Select a job"
              description="Click a job on the left to view its AI outputs, payload, and run details."
            />
          </div>
        ) : (
          <>
            {/* Job summary */}
            <Card>
              <CardHeader >
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="font-medium text-xs text-foreground">
                    {(() => {
                      const payload = selectedJob.payload as any;
                      const targetDs = datasets?.find(d => d.id === payload?.targetDatasetId);
                      const sourceDs = datasets?.find(d => d.id === payload?.sourceDatasetId);
                      const targetName = String(payload?.targetDatasetName || targetDs?.name || "New Dataset");
                      return `Ext: ${sourceDs?.name?.slice(0, 10) ?? 'Src'} → ${targetName.slice(0, 10)}`;
                    })()}
                  </span>
                  <div className="flex items-center gap-2">
                    {(selectedJob.status === "running" || selectedJob.status === "queued") && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={async () => {
                          try {
                            await api.post(`/api/ai-jobs/${selectedJob.id}/cancel`);
                            toast.success("Job cancellation requested");
                            refetchJobs();
                            queryClient.invalidateQueries({ queryKey: ["ai-jobs"] });
                          } catch (err: any) {
                            toast.error("Failed to cancel job", { description: err.message });
                          }
                        }}
                      >
                        Cancel Job
                      </Button>
                    )}
                    {(selectedJob.status === "failed" || selectedJob.status === "dlq") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                        disabled={retryMutation.isPending}
                        onClick={() => retryMutation.mutate(selectedJob.id)}
                      >
                        {retryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                        Retry
                      </Button>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${statusColor(selectedJob.status)}`}>
                      {selectedJob.status}
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-lg font-bold">{totalOutputs}</p>
                    <p className="text-[10px] text-muted-foreground">AI Calls</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-lg font-bold">{formatTokens(totalTokens)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Tokens</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-lg font-bold">{formatCost(totalCost)}</p>
                    <p className="text-[10px] text-muted-foreground">Est. Cost</p>
                  </div>
                </div>

                {/* Progress bar — show for running AND queued (child jobs may be in flight) */}
                {(selectedJob.status === "running" || selectedJob.status === "queued") && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Progress</span>
                      <span>{selectedJob.progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${selectedJob.progress}%` }}
                      />
                    </div>
                    {selectedJob.status === "queued" && (
                      <p className="text-[10px] text-muted-foreground">Waiting in queue…</p>
                    )}
                  </div>
                )}

                {/* Payload */}
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Payload</p>
                  <div className="text-[11px] bg-muted/40 rounded-lg p-3 space-y-2">
                    {/* Source Dataset */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 font-medium hover:underline [&[data-state=open]>svg]:rotate-90">
                        <ChevronRight className="h-3 w-3 transition-transform" />
                        Source Dataset: {datasets?.find(d => d.id === (selectedJob.payload as any).sourceDatasetId)?.name || "Unknown"}
                      </CollapsibleTrigger>
                      
                    </Collapsible>
                    
                    {/* Target Dataset */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 font-medium hover:underline [&[data-state=open]>svg]:rotate-90">
                        <ChevronRight className="h-3 w-3 transition-transform" />
                        Target Dataset: {(selectedJob.payload as any).targetDatasetName || datasets?.find(d => d.id === (selectedJob.payload as any).targetDatasetId)?.name || "New Dataset"}
                      </CollapsibleTrigger>
                    </Collapsible>

                    {/* Schema */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 font-medium hover:underline [&[data-state=open]>svg]:rotate-90">
                        <ChevronRight className="h-3 w-3 transition-transform" />
                        Schema: {schemas?.find(s => s.id === (selectedJob.payload as any).targetSchemaId)?.name || "Unknown"}
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-4 pt-1 space-y-1">
                        
                        {(() => {
                           const s = schemas?.find(s => s.id === (selectedJob.payload as any).targetSchemaId);
                           if (!s) return null;
                           return (
                             <div className="mt-2 bg-background/50 p-2 rounded border border-border/50">
                               <p className="font-semibold mb-1">Fields ({s.fields.length}):</p>
                               <ul className="list-disc list-inside">
                                 {s.fields.map((f: any) => (
                                   <li key={f.name}>{f.name} <span className="text-muted-foreground">({f.type})</span></li>
                                 ))}
                               </ul>
                             </div>
                           )
                        })()}
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Agents */}
                    <div>
                      <span className="font-medium ml-4">Agents: </span>
                      <span className="text-muted-foreground">{(selectedJob.payload as any).agentKeys?.join(", ")}</span>
                    </div>

                    {/* Instructions */}
                    {(selectedJob.payload as any).instructions && (
                      <div>
                        <span className="font-medium ml-4">Instructions: </span>
                        <span className="text-muted-foreground">{(selectedJob.payload as any).instructions}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Outputs */}
            <Card>
              <CardHeader >
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  AI Outputs
                  {totalOutputs > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{totalOutputs}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {outputsLoading ? (
                  <LoadingState rows={3} />
                ) : outputs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No AI outputs yet — they appear as the job runs.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                    {outputs.map((output) => {
                      const isExpanded = expandedOutputId === output.id;
                      let rawParsed: unknown = null;
                      try { rawParsed = JSON.parse(String(output.rawResponse ?? "null")); } catch { rawParsed = null; }
                      return (
                        <div key={output.id} className="rounded-lg border">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedOutputId(isExpanded ? null : output.id)}
                          >
                            <div className="flex items-center gap-3">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              <div>
                                <p className="text-[11px] font-medium">AI Generation</p>
                                <p className="text-[10px] text-muted-foreground">Extracted Data</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <p className="text-[11px] font-medium">{formatTokens(output.tokensUsed)}</p>
                                <p className="text-[10px] text-muted-foreground">tokens</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-medium text-primary">{formatCost(output.costUsd ?? 0)}</p>
                                <p className="text-[10px] text-muted-foreground">cost</p>
                              </div>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="border-t bg-muted/20 p-3 space-y-2">
                              <div className="grid grid-cols-3 gap-2 text-[10px]">
                                <div>
                                  <p className="text-muted-foreground">Prompt tokens</p>
                                  <p className="font-medium">{formatTokens(output.promptTokens ?? 0)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Completion tokens</p>
                                  <p className="font-medium">{formatTokens(output.completionTokens ?? 0)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Created</p>
                                  <p className="font-medium">{new Date(output.createdAt).toLocaleTimeString()}</p>
                                </div>
                              </div>
                              
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Error message if failed — with retry CTA */}
            {(selectedJob.status === "failed" || selectedJob.status === "dlq") && (
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-red-600 mb-1">Error</p>
                      <pre className="text-[11px] font-mono text-red-700 whitespace-pre-wrap">{selectedJob.errorMessage}</pre>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        ✓ Already-extracted rows are saved. Retry will skip them and continue from where it stopped.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1.5"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate(selectedJob.id)}
                  >
                    {retryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Retry — continue from where it stopped
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
