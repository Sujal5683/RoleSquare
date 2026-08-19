"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type {
  SchemaDTO,
  SchemaFieldDTO,
  FieldType,
  ExtractionResult,
} from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { FieldTypeBadge, ConfidenceBadge } from "@/components/ui/status-badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  FileJson,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Play,
  RefreshCw,
  Sparkles,
  Wand2,
  AlertCircle,
  ChevronLeft,
  FileText,
  Copy,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Boolean" },
  { value: "enum", label: "Enum" },
  { value: "array", label: "Array" },
  { value: "multiselect", label: "Multiselect" },
];

const OPTIONS_FIELD_TYPES: FieldType[] = ["enum", "multiselect"];

interface FieldDraft {
  id?: string;
  name: string;
  type: FieldType;
  description: string;
  instructions: string;
  required: boolean;
  options: string[];
  confidenceThreshold: number;
}

const EMPTY_FIELD: FieldDraft = {
  name: "",
  type: "text",
  description: "",
  instructions: "",
  required: false,
  options: [],
  confidenceThreshold: 0.7,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function buildPrompt(schema: SchemaDTO | null | undefined): string {
  if (!schema) return "";
  const lines: string[] = [];
  lines.push(
    "Extract the following fields from the source content. For each field, provide value, confidence (0-1), and evidence quoting the source text."
  );
  if (schema.promptTemplate) {
    lines.push("");
    lines.push(`Custom instructions: ${schema.promptTemplate}`);
  }
  lines.push("");
  lines.push("Fields:");
  if (schema.fields.length === 0) {
    lines.push("  (no fields defined)");
  } else {
    schema.fields.forEach((f, i) => {
      lines.push(
        `  ${i + 1}. ${f.name} (${f.type})${f.required ? " [required]" : ""}`
      );
      if (f.description) lines.push(`     description: ${f.description}`);
      if (f.instructions) lines.push(`     instructions: ${f.instructions}`);
      if (f.options && f.options.length > 0) {
        lines.push(`     allowed values: ${f.options.join(", ")}`);
      }
    });
  }
  lines.push("");
  lines.push(
    "Return strict JSON: { fields: [{ name, value, confidence, evidence }] }"
  );
  return lines.join("\n");
}

// ── Component ────────────────────────────────────────────────────────────

export function SchemaBuilderView() {
  const queryClient = useQueryClient();
  const selectedSchemaId = useAppStore((s) => s.selectedSchemaId);
  const openSchema = useAppStore((s) => s.openSchema);
  const setView = useAppStore((s) => s.setView);

  const [activeSchemaId, setActiveSchemaId] = useState<string | null>(
    selectedSchemaId
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [fieldDialog, setFieldDialog] = useState<{
    open: boolean;
    field: FieldDraft | null;
  }>({ open: false, field: null });
  const [fieldDialogNonce, setFieldDialogNonce] = useState(0);
  const [deleteFieldTarget, setDeleteFieldTarget] =
    useState<SchemaFieldDTO | null>(null);
  const [sampleText, setSampleText] = useState(
    "From: recruiter@techcorp.com\nSubject: Software Engineer Internship - Summer 2025\n\nHi,\n\nTechCorp is hiring Software Engineer interns for Summer 2025. Location: San Francisco (remote-friendly). CTC: 25 LPA. Eligibility: CS/IT students with 7.5+ CGPA. Apply by March 15, 2025."
  );
  const [testResult, setTestResult] = useState<ExtractionResult | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: schemas, isLoading: listLoading } = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
  });

  const { data: activeSchema, isLoading: schemaLoading } = useQuery({
    queryKey: ["schema", activeSchemaId],
    queryFn: () => api.get<SchemaDTO>(`/api/schemas/${activeSchemaId}`),
    enabled: !!activeSchemaId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const createSchemaMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      api.post<SchemaDTO>("/api/schemas", payload),
    onSuccess: (schema) => {
      toast.success("Schema created", {
        description: schema.name,
      });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      // Navigate to the new schema via the store so other views stay in sync.
      openSchema(schema.id);
      setActiveSchemaId(schema.id);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to create schema";
      toast.error("Create failed", { description: msg });
    },
  });

  const updateSchemaMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.patch<SchemaDTO>(`/api/schemas/${activeSchemaId}`, payload),
    onSuccess: () => {
      toast.success("Schema updated");
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update schema";
      toast.error("Update failed", { description: msg });
    },
  });

  const createFieldMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.post<SchemaFieldDTO>(`/api/schemas/${activeSchemaId}/fields`, payload),
    onSuccess: () => {
      toast.success("Field added");
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setFieldDialog({ open: false, field: null });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to add field";
      toast.error("Add field failed", { description: msg });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({
      fieldId,
      payload,
    }: {
      fieldId: string;
      payload: unknown;
    }) =>
      api.patch<SchemaFieldDTO>(
        `/api/schemas/${activeSchemaId}/fields/${fieldId}`,
        payload
      ),
    onSuccess: () => {
      toast.success("Field updated");
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setFieldDialog({ open: false, field: null });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update field";
      toast.error("Update field failed", { description: msg });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) =>
      api.delete(`/api/schemas/${activeSchemaId}/fields/${fieldId}`),
    onSuccess: () => {
      toast.success("Field deleted");
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setDeleteFieldTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to delete field";
      toast.error("Delete field failed", { description: msg });
    },
  });

  const testExtractionMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<ExtractionResult>(
        `/api/schemas/${activeSchemaId}/test-extraction`,
        { sampleText: text }
      ),
    onSuccess: (result) => {
      setTestResult(result);
      toast.success("Extraction complete", {
        description: `${result.fields.length} fields · ${Math.round(
          result.overallConfidence * 100
        )}% avg confidence · ${result.tokensUsed} tokens`,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      toast.error("Extraction failed", { description: msg });
    },
  });

  // If no active schema and we have schemas available, default to the first one
  // (React-recommended render-time state adjustment — avoids setState-in-effect).
  if (activeSchemaId === null && schemas && schemas.length > 0) {
    setActiveSchemaId(schemas[0].id);
  }

  // Clear test result when switching schemas (render-time adjustment).
  const [prevSchemaId, setPrevSchemaId] = useState<string | null | undefined>(
    activeSchemaId
  );
  if (activeSchemaId !== prevSchemaId) {
    setPrevSchemaId(activeSchemaId);
    setTestResult(null);
  }

  const prompt = useMemo(() => buildPrompt(activeSchema), [activeSchema]);

  const handleOpenFieldEditor = (field?: SchemaFieldDTO) => {
    setFieldDialogNonce((n) => n + 1);
    if (field) {
      setFieldDialog({
        open: true,
        field: {
          id: field.id,
          name: field.name,
          type: field.type,
          description: field.description ?? "",
          instructions: field.instructions ?? "",
          required: field.required,
          options: field.options ?? [],
          confidenceThreshold: field.confidenceThreshold ?? 0.7,
        },
      });
    } else {
      setFieldDialog({ open: true, field: { ...EMPTY_FIELD } });
    }
  };

  const handleSaveField = (field: FieldDraft) => {
    if (!field.name.trim()) {
      toast.error("Field name is required");
      return;
    }
    const payload: Record<string, unknown> = {
      name: field.name.trim(),
      type: field.type,
      description: field.description || null,
      instructions: field.instructions || null,
      required: field.required,
      options:
        OPTIONS_FIELD_TYPES.includes(field.type) && field.options.length > 0
          ? field.options
          : null,
      confidenceThreshold: field.confidenceThreshold,
    };
    if (field.id) {
      updateFieldMutation.mutate({ fieldId: field.id, payload });
    } else {
      createFieldMutation.mutate(payload);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Schema Builder"
        description="Define the structured fields the AI will extract from each source. Every extraction is evidence-backed."
        icon={<FileJson className="h-5 w-5" />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openSchema(null);
              setView("sources");
            }}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Button>
        }
      />

      {/* Top schema selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Label className="text-xs whitespace-nowrap">Active schema</Label>
              <Select
                value={activeSchemaId ?? "none"}
                onValueChange={(v) =>
                  setActiveSchemaId(v === "none" ? null : v)
                }
              >
                <SelectTrigger className="flex-1 sm:max-w-md">
                  <SelectValue placeholder="Select a schema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {(schemas ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · v{s.version} ({s.fields.length} fields)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New schema
            </Button>
            {activeSchemaId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const name = prompt(
                    "Cloned schema name:",
                    `${activeSchema?.name ?? "Schema"} (copy)`
                  );
                  if (name && activeSchemaId) {
                    fetch(`/api/schemas/${activeSchemaId}/clone`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name }),
                    })
                      .then((r) => r.json())
                      .then((cloned) => {
                        toast.success("Schema cloned", {
                          description: `"${name}" created with ${cloned.fields?.length ?? 0} fields.`,
                        });
                        queryClient.invalidateQueries({ queryKey: ["schemas"] });
                        setActiveSchemaId(cloned.id);
                      })
                      .catch(() => toast.error("Clone failed"));
                  }
                }}
                title="Clone this schema with all its fields"
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Clone
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {listLoading ? (
        <LoadingState rows={3} />
      ) : !activeSchemaId ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<FileJson className="h-5 w-5" />}
              title="No schema selected"
              description="Choose an existing schema from the dropdown above, or create a new one to start defining extraction fields."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Create schema
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : schemaLoading ? (
        <LoadingState rows={4} />
      ) : !activeSchema ? (
        <ErrorState message="Schema not found" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: schema metadata + fields */}
          <div className="lg:col-span-2 space-y-6">
            {/* Metadata */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Schema metadata
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="schema-name">Name</Label>
                    <Input
                      id="schema-name"
                      value={activeSchema.name}
                      onChange={(e) =>
                        updateSchemaMutation.mutate({ name: e.target.value })
                      }
                      placeholder="Schema name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Version</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm font-mono">
                      v{activeSchema.version}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schema-desc">Description</Label>
                  <Input
                    id="schema-desc"
                    value={activeSchema.description ?? ""}
                    onChange={(e) =>
                      updateSchemaMutation.mutate({
                        description: e.target.value,
                      })
                    }
                    placeholder="What this schema extracts"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schema-prompt">Prompt template (override)</Label>
                  <Textarea
                    id="schema-prompt"
                    rows={3}
                    value={activeSchema.promptTemplate ?? ""}
                    onChange={(e) =>
                      updateSchemaMutation.mutate({
                        promptTemplate: e.target.value,
                      })
                    }
                    placeholder="Optional system-prompt override sent to the LLM."
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Saved on blur via PATCH (bumps version).
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Fields list */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Fields
                  <span className="text-xs font-normal text-muted-foreground">
                    ({activeSchema.fields.length})
                  </span>
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenFieldEditor()}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add field
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {activeSchema.fields.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={<Sparkles className="h-5 w-5" />}
                      title="No fields yet"
                      description="Add your first extraction field to define what the AI should pull from each source."
                      action={
                        <Button
                          size="sm"
                          onClick={() => handleOpenFieldEditor()}
                        >
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Add field
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <div className="max-h-[480px] overflow-y-auto divide-y">
                    {activeSchema.fields.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40"
                      >
                        <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {f.name}
                            </span>
                            <FieldTypeBadge type={f.type} />
                            {f.required && (
                              <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                required
                              </span>
                            )}
                            {f.options && f.options.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {f.options.length} options
                              </span>
                            )}
                          </div>
                          {f.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">
                              {f.description}
                            </p>
                          )}
                          {f.instructions && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground/80 italic truncate">
                              {f.instructions}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOpenFieldEditor(f)}
                            aria-label="Edit field"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteFieldTarget(f)}
                            aria-label="Delete field"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: prompt preview + test extraction */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wand2 className="h-4 w-4" />
                  Prompt preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-[11px] font-mono leading-relaxed text-muted-foreground">
                  {prompt || "—"}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Test extraction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="sample-text">Sample source text</Label>
                  <Textarea
                    id="sample-text"
                    rows={6}
                    value={sampleText}
                    onChange={(e) => setSampleText(e.target.value)}
                    placeholder="Paste an email body, document excerpt, etc."
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => testExtractionMutation.mutate(sampleText)}
                  disabled={
                    !sampleText.trim() ||
                    testExtractionMutation.isPending ||
                    activeSchema.fields.length === 0
                  }
                >
                  {testExtractionMutation.isPending ? (
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                  )}
                  Run extraction
                </Button>
                {activeSchema.fields.length === 0 && (
                  <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <AlertCircle className="h-3 w-3" />
                    Add at least one field before testing.
                  </p>
                )}

                {/* Test result */}
                {testResult && (
                  <>
                    <Separator />
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Result</span>
                        <span className="text-muted-foreground tabular-nums">
                          {testResult.tokensUsed} tok ·{" "}
                          {Math.round(testResult.overallConfidence * 100)}% avg
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        model: {testResult.modelUsed} · prompt:{" "}
                        {testResult.promptVersion}
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto space-y-2">
                      {testResult.fields.map((f, i) => (
                        <div
                          key={`${f.fieldName}-${i}`}
                          className="rounded-lg border p-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">
                                {f.fieldName}
                              </p>
                              <p className="text-sm break-words">
                                {f.value === null || f.value === undefined
                                  ? "—"
                                  : Array.isArray(f.value)
                                  ? f.value.join(", ")
                                  : String(f.value)}
                              </p>
                            </div>
                            <ConfidenceBadge value={f.confidence} />
                          </div>
                          {f.evidence && (
                            <p className="mt-1.5 text-[10px] text-muted-foreground italic border-l-2 pl-2">
                              "{f.evidence}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Create schema dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new schema</DialogTitle>
            <DialogDescription>
              Give your schema a name and description. You'll add fields next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-schema-name">Name *</Label>
              <Input
                id="new-schema-name"
                placeholder="e.g. Placement Records"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-schema-desc">Description</Label>
              <Textarea
                id="new-schema-desc"
                rows={3}
                placeholder="What this schema extracts"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createSchemaMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createSchemaMutation.mutate({
                  name: newName,
                  description: newDescription || undefined,
                })
              }
              disabled={!newName.trim() || createSchemaMutation.isPending}
            >
              {createSchemaMutation.isPending ? (
                <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-2 h-3.5 w-3.5" />
              )}
              Create schema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Field editor dialog */}
      <FieldEditorDialog
        key={fieldDialogNonce}
        open={fieldDialog.open}
        field={fieldDialog.field}
        onClose={() => setFieldDialog({ open: false, field: null })}
        onSave={handleSaveField}
        saving={
          createFieldMutation.isPending || updateFieldMutation.isPending
        }
      />

      {/* Delete field confirmation */}
      <AlertDialog
        open={!!deleteFieldTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteFieldTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete field?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteFieldTarget?.name}
              </span>{" "}
              from this schema. Existing dataset values for this field will be
              orphaned but not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFieldMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteFieldMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteFieldTarget) {
                  deleteFieldMutation.mutate(deleteFieldTarget.id);
                }
              }}
            >
              {deleteFieldMutation.isPending ? "Deleting…" : "Delete field"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Field editor dialog (separate component for clarity) ─────────────────

function FieldEditorDialog({
  open,
  field,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  field: FieldDraft | null;
  onClose: () => void;
  onSave: (field: FieldDraft) => void;
  saving: boolean;
}) {
  // Initialize draft from the field prop on mount (this component is keyed
  // by a nonce in the parent so it remounts with a fresh draft each open).
  const [draft, setDraft] = useState<FieldDraft>(field ?? EMPTY_FIELD);

  const isOptionsType = OPTIONS_FIELD_TYPES.includes(draft.type);

  const handleOptionsChange = (raw: string) => {
    const opts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setDraft((d) => ({ ...d, options: opts }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "Edit field" : "Add field"}
          </DialogTitle>
          <DialogDescription>
            Define how the AI should extract this field from source content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="field-name">Name *</Label>
              <Input
                id="field-name"
                placeholder="e.g. company, amount"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={draft.type}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, type: v as FieldType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-desc">Description</Label>
            <Input
              id="field-desc"
              placeholder="What this field represents"
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-instr">Instructions</Label>
            <Textarea
              id="field-instr"
              rows={2}
              placeholder="Optional extraction hints for the LLM"
              value={draft.instructions}
              onChange={(e) =>
                setDraft((d) => ({ ...d, instructions: e.target.value }))
              }
            />
          </div>

          {isOptionsType && (
            <div className="space-y-2">
              <Label htmlFor="field-options">
                Allowed values (comma-separated)
              </Label>
              <Input
                id="field-options"
                placeholder="low, medium, high"
                value={draft.options.join(", ")}
                onChange={(e) => handleOptionsChange(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="field-required" className="cursor-pointer">
                Required field
              </Label>
              <p className="text-[10px] text-muted-foreground">
                The LLM will treat missing required values as low confidence.
              </p>
            </div>
            <Switch
              id="field-required"
              checked={draft.required}
              onCheckedChange={(v) =>
                setDraft((d) => ({ ...d, required: v }))
              }
            />
          </div>

          {/* Confidence threshold */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="cursor-pointer">
                  Confidence threshold
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Fields below this confidence are routed to human review.
                </p>
              </div>
              <Badge
                variant={
                  draft.confidenceThreshold >= 0.85
                    ? "default"
                    : draft.confidenceThreshold >= 0.6
                    ? "secondary"
                    : "outline"
                }
                className="tabular-nums"
              >
                {Math.round(draft.confidenceThreshold * 100)}%
              </Badge>
            </div>
            <Slider
              value={[draft.confidenceThreshold]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) =>
                setDraft((d) => ({ ...d, confidenceThreshold: v }))
              }
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>0% (always review)</span>
              <span>50%</span>
              <span>70% (default)</span>
              <span>100% (never review)</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(draft)}
            disabled={!draft.name.trim() || saving}
          >
            {saving ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-2 h-3.5 w-3.5" />
            )}
            {draft.id ? "Save changes" : "Add field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
