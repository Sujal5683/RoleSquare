"use client";

import { useMemo, useState } from "react";
import { Stepper } from "@/components/ui/stepper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type {
  SourceDTO,
  SourceRuleDTO,
  GoogleConnectionDTO,
  SchemaDTO,
  DatasetDTO,
  SourceType,
} from "@/lib/types";
import { PageHeader, EmptyState, LoadingState, ErrorState } from "@/components/ui/page-elements";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DateRuleEditor } from "@/components/source/date-rule-editor";
import { AttachmentRuleEditor } from "@/components/source/attachment-rule-editor";
import { DriveLinkRuleEditor } from "@/components/source/drive-link-rule-editor";
import { CronEditor } from "@/components/source/cron-editor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {

  Mail,
  HardDrive,
  FileText,
  Table as TableIcon,
  FormInput,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  Link2,
  Database,
  FileJson,
  Calendar,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

interface RuleDraft {
  id: string; // local only
  filterType: string;
  operator: string;
  value: string; // raw text — comma-separated for arrays
  metadata?: Record<string, unknown>; // for date presets, etc.
}

interface SourceFormState {
  name: string;
  description: string;
  sourceType: SourceType;
  googleConnectionId: string;
  rules: RuleDraft[];
  ruleOperator: "AND" | "OR";
  scheduleMode: string;
  scheduleExpr: string;
  maxEmailsPerScan: number;
  schemaId: string;
  datasetId: string;
}

const SOURCE_TYPES: { value: SourceType; label: string; icon: React.ReactNode }[] = [
  { value: "gmail", label: "Gmail", icon: <Mail className="h-4 w-4" /> },
  { value: "drive", label: "Drive", icon: <HardDrive className="h-4 w-4" /> },
  { value: "docs", label: "Docs", icon: <FileText className="h-4 w-4" /> },
  { value: "sheets", label: "Sheets", icon: <TableIcon className="h-4 w-4" /> },
  { value: "forms", label: "Forms", icon: <FormInput className="h-4 w-4" /> },
];

const FILTER_TYPES = [
  { value: "sender", label: "Sender" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body" },
  { value: "date", label: "Date" },
  { value: "attachment", label: "Attachment" },
  { value: "link", label: "Link" },
  { value: "drive_link", label: "Google Drive link" },
];

const OPERATORS = [
  { value: "eq", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "excludes", label: "Excludes" },
  { value: "regex", label: "Regex" },
  { value: "domain", label: "Domain match" },
  { value: "required", label: "Required (boolean)" },
];

const STEPS = [
  { id: 0, label: "Identity", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 1, label: "Google account", icon: <Mail className="h-3.5 w-3.5" /> },
  { id: 2, label: "Rules", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: 3, label: "Schedule & schema", icon: <Calendar className="h-3.5 w-3.5" /> },
  { id: 4, label: "Review", icon: <Check className="h-3.5 w-3.5" /> },
];

const EMPTY_FORM: SourceFormState = {
  name: "",
  description: "",
  sourceType: "gmail",
  googleConnectionId: "",
  rules: [],
  ruleOperator: "AND",
  scheduleMode: "interval",
  scheduleExpr: "6h",
  maxEmailsPerScan: 100,
  schemaId: "",
  datasetId: "",
};

// ── Helpers ──────────────────────────────────────────────────────────────

function makeLocalId() {
  return `local-${Math.random().toString(36).slice(2, 10)}`;
}

function ruleValueToString(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function ruleValueFromString(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  // Comma-separated → array
  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return trimmed;
}

function ruleToText(r: RuleDraft): string {
  const ft = FILTER_TYPES.find((f) => f.value === r.filterType)?.label ?? r.filterType;
  
  if (r.filterType === "attachment") {
    if (r.value === "true") {
      const ext = (r.metadata as any)?.allowedExtensions;
      return ext ? `Must have attachment (${ext})` : "Must have attachment";
    }
    return "Must NOT have attachment";
  }
  if (r.filterType === "drive_link") {
    return r.value === "true" ? "Must contain Google Drive link" : "Must NOT contain Google Drive link";
  }
  if (r.filterType === "date") {
    const md = r.metadata as { preset?: string; startDate?: string; endDate?: string } | undefined;
    if (r.operator === "between" && md?.startDate && md?.endDate) {
      return `Date between ${md.startDate} and ${md.endDate}`;
    }
    if (r.operator === "gt" && md?.startDate) {
      const presetLabel = PRESETS_LABEL_MAP[md.preset as keyof typeof PRESETS_LABEL_MAP] || md.preset;
      return presetLabel ? `Date: ${presetLabel}` : `Date after ${md.startDate}`;
    }
    if (r.operator === "lt" && r.value) {
      return `Date before ${r.value}`;
    }
  }

  const op = OPERATORS.find((o) => o.value === r.operator)?.label ?? r.operator;
  return `${ft} ${op.toLowerCase()} "${r.value || "—"}"`;
}

const PRESETS_LABEL_MAP = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_3_months: "Last 3 months",
  last_year: "Last year",
};

// ── Component ────────────────────────────────────────────────────────────

export function SourceBuilderView() {
  const queryClient = useQueryClient();
  const selectedSourceId = useAppStore((s) => s.selectedSourceId);
  const openSource = useAppStore((s) => s.openSource);
  const openSchema = useAppStore((s) => s.openSchema);
  const setView = useAppStore((s) => s.setView);

  const isEdit = !!selectedSourceId;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SourceFormState>(EMPTY_FORM);
  const [prefilledSourceId, setPrefilledSourceId] = useState<string | null>(
    null
  );

  // ── Data queries ───────────────────────────────────────────────────────
  const { data: connections } = useQuery({
    queryKey: ["google-connections"],
    queryFn: () => api.get<GoogleConnectionDTO[]>("/api/google-connections"),
  });

  const { data: schemas } = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
  });

  const { data: datasets } = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api.get<DatasetDTO[]>("/api/datasets"),
  });

  const { data: existingSource, isLoading: sourceLoading } = useQuery({
    queryKey: ["source", selectedSourceId],
    queryFn: () => api.get<SourceDTO>(`/api/sources/${selectedSourceId}`),
    enabled: !!selectedSourceId,
  });

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // Prefill form when editing — render-time state adjustment (React
  // recommended pattern, avoids setState-in-effect). Re-prefills whenever the
  // loaded source id changes (e.g. user opens a different source to edit).
  if (isEdit && existingSource && existingSource.id !== prefilledSourceId) {
    const rules: RuleDraft[] = (existingSource.rules ?? []).map(
      (r: SourceRuleDTO) => ({
        id: r.id ?? makeLocalId(),
        filterType: r.filterType,
        operator: r.operator,
        value: ruleValueToString(r.value),
        metadata: r.metadata ?? undefined,
      })
    );
    let ruleOperator: "AND" | "OR" = "AND";
    if (existingSource.config) {
      try {
        const config = JSON.parse(existingSource.config);
        if (config.ruleOperator === "OR") ruleOperator = "OR";
      } catch (e) { /* ignore */ }
    }

    setForm({
      name: existingSource.name,
      description: existingSource.description ?? "",
      sourceType: existingSource.sourceType,
      googleConnectionId: existingSource.googleConnectionId,
      rules,
      ruleOperator,
      scheduleMode: existingSource.scheduleMode,
      scheduleExpr: existingSource.scheduleExpr,
      maxEmailsPerScan: existingSource.maxEmailsPerScan ?? 100,
      schemaId: existingSource.schemaId ?? "",
      datasetId: existingSource.datasetId ?? "",
    });
    setPrefilledSourceId(existingSource.id);
  }

  const handleTestSimulation = async () => {
    if (!form.googleConnectionId) return;
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const res = await api.post("/api/sources/test-scan", {
        googleConnectionId: form.googleConnectionId,
        rules: form.rules,
        ruleOperator: form.ruleOperator,
      });
      setSimulationResult(res);
    } catch (err: any) {
      toast.error("Simulation failed", { description: err.message });
    } finally {
      setIsSimulating(false);
    }
  };

  // ── Mutations ──────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.post<SourceDTO>("/api/sources", payload),
    onSuccess: () => {
      toast.success("Source created", {
        description: "Your new source is now active.",
      });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      openSource(null);
      setView("sources");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to create source";
      toast.error("Create failed", { description: msg });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.patch<SourceDTO>(`/api/sources/${selectedSourceId}`, payload),
    onSuccess: () => {
      toast.success("Source updated");
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["source", selectedSourceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      openSource(null);
      setView("sources");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update source";
      toast.error("Update failed", { description: msg });
    },
  });

  const [connectingAccount, setConnectingAccount] = useState(false);

  async function handleConnectAccount() {
    setConnectingAccount(true);
    try {
      const result = await api.post<{ authorizeUrl: string }>("/api/google-connections");
      if (result.authorizeUrl) {
        window.location.href = result.authorizeUrl;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start authorization";
      toast.error("Authorization failed", { description: msg });
      setConnectingAccount(false);
    }
  }

  const replaceRulesMutation = useMutation({
    mutationFn: ({ id, rules }: { id: string; rules: unknown[] }) =>
      api.put(`/api/sources/${id}/rules`, { rules }),
    // We don't navigate from here; the parent flow handles UX.
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to sync rules";
      toast.error("Rules sync failed", { description: msg });
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────
  const selectedConnection = connections?.find(
    (c) => c.id === form.googleConnectionId
  );
  const selectedSchema = schemas?.find((s) => s.id === form.schemaId);
  const selectedDataset = datasets?.find((d) => d.id === form.datasetId);

  // ── Step validation ───────────────────────────────────────────────────
  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return form.name.trim().length > 0;
      case 1:
        return !!form.googleConnectionId;
      case 2:
        return true; // rules optional
      case 3:
        return form.scheduleExpr.trim().length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, form]);

  const canSubmit = form.name.trim() && form.googleConnectionId;

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleNext = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  const addRule = () =>
    setForm((f) => ({
      ...f,
      rules: [
        ...f.rules,
        {
          id: makeLocalId(),
          filterType: "sender",
          operator: "contains",
          value: "",
        },
      ],
    }));

  const updateRule = (id: string, patch: Partial<RuleDraft>) =>
    setForm((f) => ({
      ...f,
      rules: f.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const removeRule = (id: string) =>
    setForm((f) => ({ ...f, rules: f.rules.filter((r) => r.id !== id) }));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const rulesPayload = form.rules.map((r, i) => ({
      filterType: r.filterType,
      operator: r.operator,
      value: ruleValueFromString(r.value),
      metadata: r.metadata ?? null,
      position: i,
    }));

    const configPayload = JSON.stringify({
      ruleOperator: form.ruleOperator
    });

    if (isEdit && selectedSourceId) {
      // PATCH source fields, then PUT rules
      updateMutation.mutate({
        name: form.name,
        description: form.description || null,
        sourceType: form.sourceType,
        scheduleMode: form.scheduleMode,
        scheduleExpr: form.scheduleExpr,
        maxEmailsPerScan: form.maxEmailsPerScan,
        schemaId: form.schemaId || null,
        datasetId: form.datasetId || null,
        config: configPayload,
      });
      // Best-effort rules sync (the API replaces all rules).
      if (form.rules.length > 0 || true) {
        try {
          await replaceRulesMutation.mutateAsync({
            id: selectedSourceId,
            rules: rulesPayload,
          });
        } catch {
          // surfaced via mutation onError
        }
      }
    } else {
      createMutation.mutate({
        name: form.name,
        description: form.description || null,
        sourceType: form.sourceType,
        googleConnectionId: form.googleConnectionId,
        schemaId: form.schemaId || null,
        datasetId: form.datasetId || null,
        scheduleMode: form.scheduleMode,
        scheduleExpr: form.scheduleExpr,
        maxEmailsPerScan: form.maxEmailsPerScan,
        rules: rulesPayload,
        config: configPayload,
      });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader
        title={isEdit ? "Edit source" : "New source"}
        description={
          isEdit
            ? `Editing "${existingSource?.name ?? "…"}"`
            : "Configure a Google Workspace source, ingestion rules, schedule, and target schema."
        }
        icon={<Sparkles className="h-5 w-5" />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openSource(null);
              setView("sources");
            }}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Back to sources
          </Button>
        }
      />

      {/* Step indicator */}
      <Card>
        <CardContent className="p-4 flex justify-center">
          <Stepper
            steps={STEPS.map(s => s.label)}
            currentStep={step}
            onChangeStep={setStep}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main step content */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader >
              <CardTitle className="text-base flex items-center gap-2">
                {STEPS[step].icon}
                Step {step + 1}: {STEPS[step].label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 0 — identity */}
              {step === 0 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="src-name">Name *</Label>
                    <Input
                      id="src-name"
                      placeholder="e.g. Placement Cell Gmail"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="src-desc">Description</Label>
                    <Textarea
                      id="src-desc"
                      placeholder="What does this source monitor and why?"
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Source type</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {SOURCE_TYPES.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, sourceType: t.value }))
                          }
                          className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors ${
                            form.sourceType === t.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          {t.icon}
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Step 1 — Google account */}
              {step === 1 && (
                <>
                  {sourceLoading ? (
                    <LoadingState rows={2} />
                  ) : !connections || connections.length === 0 ? (
                    <EmptyState
                      icon={<Mail className="h-5 w-5" />}
                      title="No Google accounts connected"
                      description="Connect a Google account to start ingesting Workspace content via Google OAuth."
                      action={
                        <Button
                          size="sm"
                          onClick={handleConnectAccount}
                          disabled={connectingAccount}
                        >
                          {connectingAccount ? (
                            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="mr-2 h-3.5 w-3.5" />
                          )}
                          Connect with Google
                        </Button>
                      }
                    />
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Select Google account *</Label>
                        <Select
                          value={form.googleConnectionId}
                          onValueChange={(v) =>
                            setForm((f) => ({ ...f, googleConnectionId: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a connected account" />
                          </SelectTrigger>
                          <SelectContent>
                            {connections.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span>{c.googleEmail}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    ({c.status})
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedConnection && (
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">
                                {selectedConnection.googleEmail}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Connected ·{" "}
                                {selectedConnection.lastSyncAt
                                  ? `synced ${new Date(
                                      selectedConnection.lastSyncAt
                                    ).toLocaleDateString()}`
                                  : "never synced"}
                              </p>
                            </div>
                            <StatusBadge status={selectedConnection.status} />
                          </div>
                          <Separator />
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                              Scopes
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {selectedConnection.scopes.length === 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  None
                                </span>
                              ) : (
                                selectedConnection.scopes.map((scope) => (
                                  <span
                                    key={scope}
                                    className="inline-flex items-center rounded bg-background px-1.5 py-0.5 text-[10px] font-mono border"
                                  >
                                    {scope}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleConnectAccount}
                        disabled={connectingAccount}
                      >
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Connect another account
                      </Button>
                    </>
                  )}
                </>
              )}

              {/* Step 2 — rules */}
              {step === 2 && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Ingestion rules</p>
                      <p className="text-xs text-muted-foreground">
                        Match emails or documents that meet these criteria.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={form.ruleOperator}
                        onValueChange={(v: "AND" | "OR") => setForm(f => ({ ...f, ruleOperator: v }))}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">Match ALL</SelectItem>
                          <SelectItem value="OR">Match ANY</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={addRule}>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Add rule
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  {form.rules.length === 0 ? (
                    <EmptyState
                      icon={<ShieldCheck className="h-5 w-5" />}
                      title="No rules yet"
                      description="Without rules, the source ingests everything matched by your connection's scopes."
                      action={
                        <Button size="sm" onClick={addRule}>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Add rule
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-2">
                      {form.rules.map((r, i) => (
                        <div
                          key={r.id}
                          className="rounded-lg border p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Rule {i + 1}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeRule(r.id)}
                              aria-label="Remove rule"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          {/* Filter type selector — always shown */}
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="space-y-1">
                              <Label className="text-[10px]">Filter</Label>
                              <Select
                                value={r.filterType}
                                onValueChange={(v) =>
                                  updateRule(r.id, { filterType: v, value: "", operator: "contains", metadata: undefined })
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FILTER_TYPES.map((f) => (
                                    <SelectItem key={f.value} value={f.value}>
                                      {f.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* For date/attachment/drive_link: show specialized editors instead of operator+value */}
                            {r.filterType === "date" ? (
                              <div className="sm:col-span-2">
                                <DateRuleEditor
                                  onChange={(v) =>
                                    updateRule(r.id, {
                                      operator: v.operator,
                                      value: v.value,
                                      metadata: v.metadata as Record<string, unknown>,
                                    })
                                  }
                                />
                              </div>
                            ) : r.filterType === "attachment" ? (
                              <div className="sm:col-span-2">
                                <AttachmentRuleEditor
                                  value={r.value === "true"}
                                  metadata={r.metadata}
                                  onChange={(v) =>
                                    updateRule(r.id, {
                                      operator: v.operator,
                                      value: String(v.value),
                                      metadata: v.metadata as Record<string, unknown>,
                                    })
                                  }
                                />
                              </div>
                            ) : r.filterType === "drive_link" ? (
                              <div className="sm:col-span-2">
                                <DriveLinkRuleEditor
                                  value={r.value !== "false"}
                                  onChange={(v) =>
                                    updateRule(r.id, {
                                      operator: v.operator,
                                      value: String(v.value),
                                    })
                                  }
                                />
                              </div>
                            ) : (
                              <>
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Operator</Label>
                                  <Select
                                    value={r.operator}
                                    onValueChange={(v) =>
                                      updateRule(r.id, { operator: v })
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {OPERATORS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                          {o.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Value</Label>
                                  <Input
                                    className="h-8 text-xs"
                                    placeholder="comma-separated for arrays"
                                    value={r.value}
                                    onChange={(e) =>
                                      updateRule(r.id, { value: e.target.value })
                                    }
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Rule preview (mobile/desktop inline) */}
                  {form.rules.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3 sm:hidden">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                        Preview
                      </p>
                      <ul className="space-y-1 text-xs">
                        {form.rules.map((r) => (
                          <li key={r.id} className="font-mono">
                            • {ruleToText(r)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Test Run Simulator */}
                  <div className="pt-2 border-t mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Simulation preview</p>
                      <p className="text-[10px] text-muted-foreground">Test these rules against your inbox to ensure they work.</p>
                    </div>
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => handleTestSimulation()}
                      disabled={isSimulating || !form.googleConnectionId}
                    >
                      {isSimulating ? (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Test rules
                    </Button>
                  </div>
                  {simulationResult && (
                    <div className="rounded-md border p-3 mt-2 bg-muted/10 space-y-2">
                      <p className="text-xs font-mono text-muted-foreground">
                        Gmail Query: {simulationResult.query || "(matches all emails)"}
                      </p>
                      <p className="text-xs font-medium">Found ~{simulationResult.count} matches. Previewing top 5:</p>
                      <div className="space-y-1.5 divide-y max-h-60 overflow-y-auto pr-2">
                        {simulationResult.previews.map((p: any) => (
                          <div key={p.id} className="pt-1.5 text-xs">
                            <p className="font-medium truncate">{p.subject}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{p.from}</p>
                            <p className="text-[10px] text-muted-foreground truncate italic">{p.snippet}</p>
                          </div>
                        ))}
                        {simulationResult.previews.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2 text-center">No emails matched these rules.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Step 3 — schedule + schema + dataset */}
              {step === 3 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Schedule mode</Label>
                      <Select
                        value={form.scheduleMode}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, scheduleMode: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="interval">Interval</SelectItem>
                          <SelectItem value="cron">Cron</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sched-expr">Schedule expression</Label>
                      {form.scheduleMode === "cron" ? (
                        <CronEditor
                          value={form.scheduleExpr}
                          onChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              scheduleExpr: v,
                            }))
                          }
                        />
                      ) : (
                        <>
                          <Input
                            id="sched-expr"
                            placeholder={
                              form.scheduleMode === "manual"
                                ? "(manual)"
                                : "6h"
                            }
                            value={form.scheduleExpr}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                scheduleExpr: e.target.value,
                              }))
                            }
                          />
                          <p className="text-[10px] text-muted-foreground">
                            {form.scheduleMode === "interval"
                              ? "Use '6h', '15m', '1d' etc."
                              : "Manual sources only run when triggered."}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* maxEmailsPerScan slider */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="max-emails">Max emails per scan</Label>
                        <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[280px]">
                          Limits the Gmail API list call to this many messages per scan run. Lower values are faster.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min={1}
                          max={10000}
                          value={form.maxEmailsPerScan}
                          onChange={(e) => {
                            let val = parseInt(e.target.value, 10);
                            if (isNaN(val)) val = 1;
                            setForm((f) => ({ ...f, maxEmailsPerScan: Math.min(10000, Math.max(1, val)) }));
                          }}
                          className="w-24 tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <input
                        type="range"
                        min={1}
                        max={2000}
                        step={1}
                        value={Math.min(form.maxEmailsPerScan, 2000)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            maxEmailsPerScan: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>1</span>
                        <span>2,000</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5">
                        <FileJson className="h-3.5 w-3.5" />
                        Extraction schema
                      </Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => openSchema(null)}
                      >
                        Create new schema
                      </button>
                    </div>
                    <Select
                      value={form.schemaId || "none"}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          schemaId: v === "none" ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a schema (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— No schema —</SelectItem>
                        {(schemas ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} · v{s.version} ({s.fields.length} fields)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5" />
                        Target dataset
                      </Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setView("datasets")}
                      >
                        Create new dataset
                      </button>
                    </div>
                    <Select
                      value={form.datasetId || "none"}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          datasetId: v === "none" ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a dataset (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— No dataset —</SelectItem>
                        {(datasets ?? []).map((d) => {
                          const isReadOnly = d.accessLevel === "read" || d.accessLevel === "comment";
                          return (
                            <TooltipProvider key={d.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <SelectItem value={d.id} disabled={isReadOnly}>
                                      <div className="flex items-center gap-2">
                                        <span>{d.name} ({d.recordCount} records)</span>
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
                  </div>
                </>
              )}

              {/* Step 4 — review */}
              {step === 4 && (
                <div className="space-y-3">
                  <ReviewRow label="Name" value={form.name || "—"} />
                  <ReviewRow
                    label="Description"
                    value={form.description || "—"}
                  />
                  <ReviewRow
                    label="Source type"
                    value={
                      SOURCE_TYPES.find((t) => t.value === form.sourceType)
                        ?.label ?? form.sourceType
                    }
                  />
                  <ReviewRow
                    label="Google account"
                    value={selectedConnection?.googleEmail ?? "—"}
                  />
                  <ReviewRow
                    label="Rules"
                    value={
                      form.rules.length === 0
                        ? "No rules (ingest everything)"
                        : `${form.rules.length} rule(s)`
                    }
                  />
                  {form.rules.length > 0 && (
                    <ul className="ml-4 space-y-1 text-xs text-muted-foreground">
                      {form.rules.map((r) => (
                        <li key={r.id} className="font-mono">
                          • {ruleToText(r)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <ReviewRow
                    label="Schedule"
                    value={`${form.scheduleMode} · ${form.scheduleExpr}`}
                  />
                  <ReviewRow
                    label="Schema"
                    value={selectedSchema?.name ?? "—"}
                  />
                  <ReviewRow
                    label="Dataset"
                    value={selectedDataset?.name ?? "—"}
                  />
                  {!canSubmit && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      Name and Google account are required.
                    </div>
                  )}
                </div>
              )}

              {/* Footer nav */}
              <Separator />
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  disabled={step === 0 || isSubmitting}
                >
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button
                    size="sm"
                    onClick={handleNext}
                    disabled={!stepValid}
                  >
                    Next
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!canSubmit || isSubmitting}
                  >
                    {isSubmitting ? (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isEdit ? "Update source" : "Create source"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sticky summary */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-20 space-y-4">
            <Card>
              <CardHeader >
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <SummaryRow
                  label="Name"
                  value={form.name || "Untitled source"}
                />
                <SummaryRow
                  label="Type"
                  value={form.sourceType}
                />
                <SummaryRow
                  label="Account"
                  value={selectedConnection?.googleEmail ?? "Not selected"}
                />
                <SummaryRow
                  label="Rules"
                  value={`${form.rules.length} configured`}
                />
                <SummaryRow
                  label="Schedule"
                  value={`${form.scheduleMode} · ${form.scheduleExpr || "—"}`}
                />
                <SummaryRow
                  label="Schema"
                  value={selectedSchema?.name ?? "—"}
                />
                <SummaryRow
                  label="Dataset"
                  value={selectedDataset?.name ?? "—"}
                />
              </CardContent>
            </Card>

            {form.rules.length > 0 && (
              <Card>
                <CardHeader >
                  <CardTitle className="text-sm">Rule preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-xs">
                    {form.rules.map((r) => (
                      <li key={r.id} className="font-mono text-muted-foreground">
                        • {ruleToText(r)}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small subcomponents ──────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right truncate max-w-[160px]">
        {value}
      </span>
    </div>
  );
}
