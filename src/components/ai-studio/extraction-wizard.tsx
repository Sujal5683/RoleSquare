"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { api } from "@/lib/api-client";
import type { DatasetDTO, SchemaDTO, AiJobDTO, AgentLogDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/page-elements";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowRight, CheckCircle2, Database, FileJson, Sparkles, Workflow, Layers, Loader2, Play, Link2, Info, Bot } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AiStudioSkeleton } from "@/components/ui/skeletons/ai-studio-skeleton";
const ALL_AGENTS = [
  { key: "extractor", label: "Extractor", desc: "Extract raw fields from source text" },
  { key: "analyst", label: "Analyst", desc: "Cross-reference with schema rules" },
  { key: "validator", label: "Validator", desc: "Confidence scoring and checks" },
  { key: "transformer", label: "Transformer", desc: "Normalise dates, units, formats" },
  { key: "researcher", label: "Researcher", desc: "Enrich with external lookups (if low confidence)" },
];

import { Stepper } from "@/components/ui/stepper";

export function ExtractionWizard() {
  const queryClient = useQueryClient();
  const setView = useAppStore((s) => s.setView);
  const openDataset = useAppStore((s) => s.openDataset);

  const [step, setStep] = useState<number>(1);
  const [sourceDatasetId, setSourceDatasetId] = useState("");
  const [schemaId, setSchemaId] = useState("");
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [targetDatasetId, setTargetDatasetId] = useState("");
  const [targetDatasetName, setTargetDatasetName] = useState("");
  const [agentKeys, setAgentKeys] = useState<string[]>(["extractor", "analyst", "validator", "transformer"]);
  const [instructions, setInstructions] = useState("");
  const [exploreDriveLinks, setExploreDriveLinks] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);

  // Queries
  const { data: datasets, isLoading: datasetsLoading } = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api.get<DatasetDTO[]>("/api/datasets"),
  });
  
  const { data: schemas, isLoading: schemasLoading } = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
  });

  const { data: jobStatus } = useQuery({
    queryKey: ["ai-job", jobId],
    queryFn: () => api.get<AiJobDTO>(`/api/ai-jobs/${jobId}`),
    enabled: !!jobId && step === 5,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === "success" || status === "failed") ? false : 3000;
    },
  });

  // Start Extraction Mutation
  const startMutation = useMutation({
    mutationFn: (payload: any) => api.post<{ jobId: string; targetDatasetId: string }>("/api/ai/extract-wizard", payload),
    onSuccess: (res) => {
      setJobId(res.jobId);
      setTargetDatasetId(res.targetDatasetId);
      setStep(5);
      toast.success("Extraction started");
      queryClient.invalidateQueries({ queryKey: ["ai-jobs"] });
    },
    onError: (err: any) => {
      toast.error("Failed to start extraction", { description: err.message });
    }
  });

  const handleStart = () => {
    if (!sourceDatasetId || !schemaId) return;
    if (targetMode === "new" && !targetDatasetName) return;
    if (targetMode === "existing" && !targetDatasetId) return;

    startMutation.mutate({
      sourceDatasetId,
      schemaId,
      targetDatasetId: targetMode === "existing" ? targetDatasetId : undefined,
      targetDatasetName: targetMode === "new" ? targetDatasetName : undefined,
      agentKeys,
      instructions: instructions || undefined,
      exploreDriveLinks,
    });
  };

  const handleFinish = () => {
    if (targetDatasetId) {
      openDataset(targetDatasetId);
      setView("dataset-detail");
    }
  };

  if (datasetsLoading || schemasLoading) return <AiStudioSkeleton />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Compact Wizard Header Progress */}
      {step < 5 && (
        <Stepper
          className="mb-6"
          steps={["Source", "Schema", "Configure", "Review"]}
          currentStep={step - 1}
          onChangeStep={(newStep) => setStep(newStep + 1)}
        />
      )}

      {/* Step 1: Source */}
      {step === 1 && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CardHeader>
            <CardTitle>Select Source Dataset</CardTitle>
            <CardDescription>Choose the raw dataset containing the text or emails you want to extract structured data from.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 max-h-[40vh] overflow-y-auto pr-2">
              {datasets?.map((d) => {
                const isReadOnly = d.accessLevel === "read" || d.accessLevel === "comment";
                return (
                  <TooltipProvider key={d.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => !isReadOnly && setSourceDatasetId(d.id)}
                          className={`rounded-md border p-2.5 transition-all ${
                            isReadOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50 hover:bg-muted/30"
                          } ${sourceDatasetId === d.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{d.name}</p>
                                {isReadOnly && <span className="text-[10px] text-muted-foreground">(View only)</span>}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{d.recordCount} records</p>
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      {isReadOnly && (
                        <TooltipContent>
                          <p>View only - you must be an editor to select this dataset as a source.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t pt-4">
            <Button onClick={() => setStep(2)} disabled={!sourceDatasetId}>
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 2: Schema */}
      {step === 2 && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CardHeader>
            <CardTitle>Select Target Schema</CardTitle>
            <CardDescription>Choose the structure you want the AI to extract into.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-2 sm:grid-cols-2 max-h-[40vh] overflow-y-auto pr-2">
              {schemas?.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSchemaId(s.id)}
                  className={`cursor-pointer rounded-md border p-2.5 transition-all hover:border-primary/50 hover:bg-muted/30 ${
                    schemaId === s.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileJson className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">{s.fields.length} fields</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)} disabled={!schemaId}>
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Configure */}
      {step === 3 && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CardHeader>
            <CardTitle>Configure Extraction</CardTitle>
            <CardDescription>Set the output destination and select the AI agents to run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label className="text-base">Target Destination</Label>
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <input type="radio" id="tgt-new" checked={targetMode === "new"} onChange={() => setTargetMode("new")} className="cursor-pointer" />
                  <Label htmlFor="tgt-new" className="cursor-pointer">Create new dataset</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="radio" id="tgt-exist" checked={targetMode === "existing"} onChange={() => setTargetMode("existing")} className="cursor-pointer" />
                  <Label htmlFor="tgt-exist" className="cursor-pointer">Append to existing</Label>
                </div>
              </div>

              {targetMode === "new" ? (
                <Input placeholder="E.g. Cleaned Invoices Q3" value={targetDatasetName} onChange={(e) => setTargetDatasetName(e.target.value)} />
              ) : (
                <Select value={targetDatasetId} onValueChange={setTargetDatasetId}>
                  <SelectTrigger><SelectValue placeholder="Select existing dataset..." /></SelectTrigger>
                  <SelectContent>
                    {datasets?.map(d => {
                      const isReadOnly = d.accessLevel === "read" || d.accessLevel === "comment";
                      return (
                        <TooltipProvider key={d.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <SelectItem value={d.id} disabled={isReadOnly}>
                                  <div className="flex items-center gap-2">
                                    <span>{d.name}</span>
                                    {isReadOnly && <span className="text-muted-foreground text-xs">(View only)</span>}
                                  </div>
                                </SelectItem>
                              </div>
                            </TooltipTrigger>
                            {isReadOnly && (
                              <TooltipContent>
                                <p>View only - you must be an editor to select this dataset</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* ── Document Exploration (Drive Link Feature) ── */}
            <div className={`rounded-lg border-2 p-4 transition-colors ${exploreDriveLinks ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${exploreDriveLinks ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Link2 className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label htmlFor="explore-drive" className="text-sm font-semibold cursor-pointer">
                        Explore Linked Documents
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Recommended — enabled by default
                      </p>
                    </div>
                    <Checkbox
                      id="explore-drive"
                      checked={exploreDriveLinks}
                      onCheckedChange={(c) => setExploreDriveLinks(!!c)}
                      className="mt-0.5 h-5 w-5"
                    />
                  </div>

                  {/* Always-visible info text */}
                  <div className="flex gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                    <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
                    <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                      When enabled, the AI will <strong>open every Google Drive link</strong> found in your dataset,
                      list all files inside those folders, and read their full content — including{" "}
                      <strong>PDFs, Word documents, Google Docs, Sheets, Slides, and images</strong>.
                      All file content is combined and given to the AI to extract the requested fields,
                      instead of only reading the link text. This is the recommended mode for datasets
                      that contain Drive folder links.
                    </p>
                  </div>

                  {!exploreDriveLinks && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ Drive exploration is off — the AI will only read the text in your dataset cells, not the linked files.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base">AI Agents</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ALL_AGENTS.map((agent) => (
                  <div key={agent.key} className="flex items-start space-x-2.5 rounded-md border p-2.5">
                    <Checkbox
                      id={`agent-${agent.key}`}
                      checked={agentKeys.includes(agent.key)}
                      onCheckedChange={(c) => {
                        if (c) setAgentKeys([...agentKeys, agent.key]);
                        else setAgentKeys(agentKeys.filter(k => k !== agent.key));
                      }}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-none">
                      <Label htmlFor={`agent-${agent.key}`} className="font-medium text-sm cursor-pointer">{agent.label}</Label>
                      <p className="text-[11px] text-muted-foreground">{agent.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label>Additional Prompt Instructions (Optional)</Label>
              <Textarea 
                placeholder="E.g. Always format currency as USD. Ignore entries without a valid date..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="h-20"
              />
            </div>

          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={() => setStep(4)}>
              Review <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CardHeader>
            <CardTitle>Review & Start</CardTitle>
            <CardDescription>Confirm your settings before kicking off the AI extraction pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Source Dataset</p>
                  <p className="font-medium">{datasets?.find(d => d.id === sourceDatasetId)?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Target Schema</p>
                  <p className="font-medium">{schemas?.find(s => s.id === schemaId)?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Destination</p>
                  <p className="font-medium">
                    {targetMode === "new" ? `New: ${targetDatasetName}` : `Existing: ${datasets?.find(d => d.id === targetDatasetId)?.name}`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Agents Selected</p>
                  <div className="flex flex-wrap gap-1">
                    {agentKeys.map(k => <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>)}
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Document Exploration</p>
                  <div className="flex items-center gap-1.5">
                    <Link2 className={`h-3.5 w-3.5 ${exploreDriveLinks ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${exploreDriveLinks ? "text-primary" : "text-muted-foreground"}`}>
                      {exploreDriveLinks ? "Enabled — will read linked Drive files" : "Disabled — text only"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
            <Button 
              onClick={handleStart} 
              disabled={startMutation.isPending}
              className="gap-1.5 bg-transparent hover:bg-transparent bg-gradient-to-r from-cyan-600/15 to-blue-600/15 border border-blue-500/20 text-blue-700 dark:text-blue-300 backdrop-blur-xl hover:from-cyan-600/25 hover:to-blue-600/25 shadow-sm"
            >
              {startMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              {startMutation.isPending ? "Starting..." : "Start Extraction"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 5: Live Run */}
      {step === 5 && (
        <Card className="border-indigo-200 shadow-sm animate-in zoom-in-95 duration-500">
          <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="h-5 w-5 text-indigo-500" />
                  Live Extraction Run
                </CardTitle>
                <CardDescription className="mt-1">
                  Job ID: <span className="font-mono text-xs">{jobId?.slice(0, 8)}</span>
                </CardDescription>
              </div>
              {jobStatus?.status && <StatusBadge status={jobStatus.status} />}
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span>Overall Progress</span>
                <span className="tabular-nums">{jobStatus?.progress ?? 0}%</span>
              </div>
              <Progress value={jobStatus?.progress ?? 0} className="h-2" />
              {jobStatus?.status === "running" && (
                <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Agents are analyzing records...
                </p>
              )}
            </div>

            <div className="rounded-md border bg-muted text-foreground font-mono text-[11px] p-3 h-48 overflow-y-auto">
              <LiveLogs jobId={jobId} />
            </div>

            {(jobStatus?.status === "success" || jobStatus?.status === "failed") && (
              <div className="flex justify-end pt-4">
                <Button onClick={handleFinish}>
                  View Output Dataset <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LiveLogs({ jobId }: { jobId: string | null }) {
  const { data } = useQuery({
    queryKey: ["agent-logs", jobId],
    queryFn: () => api.get<{ data: AgentLogDTO[] }>(`/api/agent-logs?jobId=${jobId}&pageSize=50`),
    enabled: !!jobId,
    refetchInterval: 3000,
  });

  if (!data?.data?.length) return <span className="text-muted-foreground/50">Waiting for logs...</span>;

  return (
    <div className="space-y-1">
      {data.data.map((log) => (
        <div key={log.id} className="flex gap-2">
          <span className="text-muted-foreground shrink-0">[{format(new Date(log.createdAt), "HH:mm:ss")}]</span>
          <span className="text-primary shrink-0">[{log.agentKey}]</span>
          <span className={log.level === "error" ? "text-destructive font-medium" : log.level === "warn" ? "text-yellow-600 dark:text-yellow-400" : ""}>
            {log.message}
          </span>
        </div>
      ))}
    </div>
  );
}
