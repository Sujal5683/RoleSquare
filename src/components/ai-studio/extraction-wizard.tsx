"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { api } from "@/lib/api-client";
import type { DatasetDTO, SchemaDTO, AiJobDTO, AgentLogDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/page-elements";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArrowRight, CheckCircle2, Database, FileJson, Sparkles, Workflow, Layers, Loader2, Play } from "lucide-react";
import { useAppStore } from "@/lib/store";

const ALL_AGENTS = [
  { key: "extractor", label: "Extractor", desc: "Extract raw fields from source text" },
  { key: "analyst", label: "Analyst", desc: "Cross-reference with schema rules" },
  { key: "validator", label: "Validator", desc: "Confidence scoring and checks" },
  { key: "transformer", label: "Transformer", desc: "Normalise dates, units, formats" },
  { key: "researcher", label: "Researcher", desc: "Enrich with external lookups (if low confidence)" },
];

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
    });
  };

  const handleFinish = () => {
    if (targetDatasetId) {
      openDataset(targetDatasetId);
      setView("dataset-detail");
    }
  };

  if (datasetsLoading || schemasLoading) return <LoadingState rows={4} />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Wizard Header Progress */}
      {step < 5 && (
        <div className="relative mb-8 px-4">
          <div className="absolute left-0 top-1/2 -z-10 h-0.5 w-full -translate-y-1/2 bg-border"></div>
          <div className="absolute left-0 top-1/2 -z-10 h-0.5 -translate-y-1/2 bg-primary transition-all duration-300" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: "Source" },
              { num: 2, label: "Schema" },
              { num: 3, label: "Configure" },
              { num: 4, label: "Review" },
            ].map((s) => (
              <div key={s.num} className="flex flex-col items-center gap-2 bg-background px-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${
                    step === s.num
                      ? "border-primary bg-primary text-primary-foreground"
                      : step > s.num
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-muted bg-background text-muted-foreground"
                  }`}
                >
                  {step > s.num ? <CheckCircle2 className="h-5 w-5" /> : s.num}
                </div>
                <span className={`text-xs font-medium ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Source */}
      {step === 1 && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CardHeader>
            <CardTitle>Select Source Dataset</CardTitle>
            <CardDescription>Choose the raw dataset containing the text or emails you want to extract structured data from.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {datasets?.map((d) => (
                <div
                  key={d.id}
                  onClick={() => setSourceDatasetId(d.id)}
                  className={`cursor-pointer rounded-lg border p-4 transition-all hover:border-primary/50 hover:bg-muted/30 ${
                    sourceDatasetId === d.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.recordCount} records</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!sourceDatasetId}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
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
            <div className="grid gap-3 sm:grid-cols-2">
              {schemas?.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSchemaId(s.id)}
                  className={`cursor-pointer rounded-lg border p-4 transition-all hover:border-primary/50 hover:bg-muted/30 ${
                    schemaId === s.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileJson className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.fields.length} fields</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!schemaId}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
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
                    {datasets?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-3 pt-4 border-t">
              <Label className="text-base">AI Agents</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ALL_AGENTS.map((agent) => (
                  <div key={agent.key} className="flex items-start space-x-3 rounded-md border p-3">
                    <Checkbox
                      id={`agent-${agent.key}`}
                      checked={agentKeys.includes(agent.key)}
                      onCheckedChange={(c) => {
                        if (c) setAgentKeys([...agentKeys, agent.key]);
                        else setAgentKeys(agentKeys.filter(k => k !== agent.key));
                      }}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor={`agent-${agent.key}`} className="font-semibold cursor-pointer">{agent.label}</Label>
                      <p className="text-xs text-muted-foreground">{agent.desc}</p>
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

            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)}>
                Review <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
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
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
              <Button 
                onClick={handleStart} 
                disabled={startMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {startMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                {startMutation.isPending ? "Starting..." : "Start Extraction"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Live Run */}
      {step === 5 && (
        <Card className="border-indigo-200 shadow-sm animate-in zoom-in-95 duration-500">
          <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
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
