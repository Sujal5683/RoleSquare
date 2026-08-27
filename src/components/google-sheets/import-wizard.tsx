"use client";

// ImportWizard
// Multi-step wizard for importing data from Google Sheets into a dataset.
// Steps:
//   1. Account — select Sheets account
//   2. Spreadsheet — pick spreadsheet
//   3. Tab + Preview — pick tab, see data
//   4. Destination — existing or new dataset
//   5. Import mode — append / update / replace
//   6. Column mapping — AI-assisted
//   7. Confirm & Start

import { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Stepper } from "@/components/ui/stepper";
import { useAppStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleSheetsAccountSelector } from "@/components/google-sheets/google-sheets-account-selector";
import { SpreadsheetSelector } from "@/components/google-sheets/spreadsheet-selector";
import { TabSelector } from "@/components/google-sheets/tab-selector";
import { SheetPreview } from "@/components/google-sheets/sheet-preview";
import {
  ColumnMapping,
  type ColumnMappingEntry,
  type AppColumn,
} from "@/components/google-sheets/column-mapping";
import { DestructiveChangeConfirmation } from "@/components/google-sheets/destructive-change-confirmation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ImportMode = "append" | "update_existing" | "append_update" | "replace";

interface WizardState {
  sheetsAccountId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  destinationType: "existing" | "new";
  datasetId: string;
  newDatasetName: string;
  importMode: ImportMode;
  matchField: string;
  columnMappings: ColumnMappingEntry[];
}

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasets: Array<{ id: string; name: string; appColumns?: AppColumn[]; accessLevel?: string }>;
  onSuccess?: (jobId: string) => void;
}

const STEPS = [
  "Account",
  "Spreadsheet",
  "Tab",
  "Destination",
  "Import Mode",
  "Columns",
  "Confirm",
];

const MODE_DESCRIPTIONS: Record<ImportMode, { label: string; description: string; destructive: boolean }> = {
  append: {
    label: "Append",
    description: "Add all sheet rows as new records. Existing records are not changed.",
    destructive: false,
  },
  update_existing: {
    label: "Update Existing",
    description: "Match rows by a key field and update matching records only. No new records created.",
    destructive: false,
  },
  append_update: {
    label: "Append & Update",
    description: "Update matches and append unmatched rows as new records.",
    destructive: false,
  },
  replace: {
    label: "Replace All",
    description: "Delete ALL existing records and replace with sheet data. Cannot be undone without rollback.",
    destructive: true,
  },
};

export function ImportWizard({
  open,
  onOpenChange,
  datasets,
  onSuccess,
}: ImportWizardProps) {
  const { selectedOrganizationId } = useAppStore();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [state, setState] = useState<WizardState>({
    sheetsAccountId: "",
    spreadsheetId: "",
    spreadsheetName: "",
    sheetName: "",
    destinationType: "existing",
    datasetId: "",
    newDatasetName: "",
    importMode: "append",
    matchField: "",
    columnMappings: [],
  });

  // Sheet preview for AI mapping
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);

  const isNewDataset = state.destinationType === "new";
  // For new datasets, skip the "Import Mode" step (step 4) — always append
  const effectiveSteps = isNewDataset
    ? STEPS.filter((s) => s !== "Import Mode")
    : STEPS;

  const selectedDataset = datasets.find((d) => d.id === state.datasetId);
  const appColumns: AppColumn[] = selectedDataset?.appColumns ?? [];

  // Poll import job progress while running
  const progressQuery = useQuery<{
    status: string;
    totalRows: number;
    processedRows: number;
    insertedRows: number;
    updatedRows: number;
    errorRows: number;
    progressPercent: number | null;
    errors: Array<{ row: number; message: string }>;
  }>({
    queryKey: ["import-job", importJobId],
    queryFn: () => api.get(`/api/google-sheets/import/${importJobId}`),
    enabled: !!importJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "pending" ? 1500 : false;
    },
  });

  const isDone = progressQuery.data?.status === "success" ||
    progressQuery.data?.status === "failed" ||
    progressQuery.data?.status === "partial";

  const isProgressView = step === effectiveSteps.length;

  const aiQuery = useQuery<{ mappings: Array<{
    sheetHeader: string;
    appColumnId: string | null;
    appColumnName: string | null;
    confidence: number;
    reason: string;
    suggestedDataType: string;
    isAutoSelected: boolean;
  }> }>({
    queryKey: ["ai-import-mapping", state.spreadsheetId, state.sheetName, state.datasetId],
    queryFn: () =>
      api.post<{ mappings: Array<{
        sheetHeader: string;
        appColumnId: string | null;
        appColumnName: string | null;
        confidence: number;
        reason: string;
        suggestedDataType: string;
        isAutoSelected: boolean;
      }> }>("/api/google-sheets/ai-mapping", {
        sheetHeaders,
        sampleRows,
        datasetId: state.datasetId || undefined,
      }),
    // Columns step = effectiveSteps.length - 2 (second to last before Confirm)
    enabled: step === effectiveSteps.length - 2 && sheetHeaders.length > 0,
    retry: false,
  });

  const update = useCallback(
    (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch })),
    []
  );

  const importMutation = useMutation({
    mutationFn: () =>
      api.post<{ importJobId: string; status: string }>("/api/google-sheets/import", {
        sheetsAccountId: state.sheetsAccountId,
        spreadsheetId: state.spreadsheetId,
        spreadsheetName: state.spreadsheetName,
        sheetName: state.sheetName,
        datasetId: state.destinationType === "existing" ? state.datasetId : null,
        newDatasetName:
          state.destinationType === "new" ? state.newDatasetName : null,
        importMode: isNewDataset ? "append" : state.importMode,
        matchField: state.matchField || null,
        columnMappings: state.columnMappings,
      }),
    onSuccess: (data: { importJobId: string }) => {
      toast.success("Import started");
      setImportJobId(data.importJobId);
      setStep(effectiveSteps.length); // advance to progress view
    },
    onError: (err: Error) => toast.error(err.message || "Failed to start import"),
  });

  const handleClose = () => {
    onOpenChange(false);
    setStep(0);
    setImportJobId(null);
    if (isDone) {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      onSuccess?.(importJobId!);
    }
  };

  const handleConfirm = () => {
    if (state.importMode === "replace" && !isNewDataset) {
      setConfirmOpen(true);
    } else {
      importMutation.mutate();
    }
  };

  const canNext = () => {
    // Map wizard step to effective step label
    const stepLabel = effectiveSteps[step];
    switch (stepLabel) {
      case "Account": return !!state.sheetsAccountId;
      case "Spreadsheet": return !!state.spreadsheetId;
      case "Tab": return !!state.sheetName;
      case "Destination":
        return state.destinationType === "new"
          ? !!state.newDatasetName.trim()
          : !!state.datasetId;
      case "Import Mode":
        return (
          state.importMode !== "update_existing" &&
          state.importMode !== "append_update"
        ) || !!state.matchField;
      default: return true;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={isProgressView ? handleClose : onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-400" />
              Import from Google Sheets
            </DialogTitle>
            <DialogDescription>
              {isProgressView
                ? "Import in progress"
                : `Step ${step + 1} of ${effectiveSteps.length} — ${effectiveSteps[step]}`}
            </DialogDescription>
          </DialogHeader>

          {/* Step progress bar — hide in progress view */}
          {!isProgressView && (
            <Stepper
              className="py-2"
              steps={effectiveSteps}
              currentStep={step}
              onChangeStep={setStep}
            />
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-[260px] pr-2 -mr-2">
            {/* Step 0: Account */}
            {!isProgressView && effectiveSteps[step] === "Account" && (
              <GoogleSheetsAccountSelector
                value={state.sheetsAccountId}
                onSelect={(id) => update({ sheetsAccountId: id })}
              />
            )}

            {/* Step 1: Spreadsheet */}
            {!isProgressView && effectiveSteps[step] === "Spreadsheet" && (
              <SpreadsheetSelector
                sheetsAccountId={state.sheetsAccountId}
                value={state.spreadsheetId}
                onSelect={(id, name) =>
                  update({ spreadsheetId: id, spreadsheetName: name, sheetName: "" })
                }
              />
            )}

            {/* Step 2: Tab */}
            {!isProgressView && effectiveSteps[step] === "Tab" && (
              <div className="space-y-3">
                <TabSelector
                  sheetsAccountId={state.sheetsAccountId}
                  spreadsheetId={state.spreadsheetId}
                  value={state.sheetName}
                  onSelect={async (title) => {
                    update({ sheetName: title });
                    try {
                      const preview = await api.get<{ headers: string[]; rows: string[][]; totalRowsEstimate: number }>(
                        `/api/google-sheets/spreadsheets/${state.spreadsheetId}/preview` +
                          `?sheetsAccountId=${state.sheetsAccountId}&tab=${encodeURIComponent(title)}&limit=5`
                      );
                      setSheetHeaders(preview.headers.filter((h: string) => h !== "__row_id__"));
                      setSampleRows(preview.rows);
                    } catch {}
                  }}
                />
                {state.sheetName && (
                  <>
                    <Separator />
                    <SheetPreview
                      sheetsAccountId={state.sheetsAccountId}
                      spreadsheetId={state.spreadsheetId}
                      tabName={state.sheetName}
                      limit={8}
                    />
                  </>
                )}
              </div>
            )}

            {/* Step 3: Destination */}
            {!isProgressView && effectiveSteps[step] === "Destination" && (
              <div className="space-y-4">
                <RadioGroup
                  value={state.destinationType}
                  onValueChange={(v) =>
                    update({ destinationType: v as "existing" | "new" })
                  }
                  className="space-y-2"
                >
                  <label
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors",
                      state.destinationType === "existing"
                        ? "border-primary/40 bg-primary/5"
                        : "hover:border-muted-foreground/40"
                    )}
                  >
                    <RadioGroupItem value="existing" id="dest-existing" />
                    <div>
                      <p className="text-sm font-medium">Import into existing dataset</p>
                      <p className="text-xs text-muted-foreground">
                        Add to or update an existing dataset
                      </p>
                    </div>
                  </label>
                  <label
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors",
                      state.destinationType === "new"
                        ? "border-primary/40 bg-primary/5"
                        : "hover:border-muted-foreground/40"
                    )}
                  >
                    <RadioGroupItem value="new" id="dest-new" />
                    <div>
                      <p className="text-sm font-medium">Create new dataset</p>
                      <p className="text-xs text-muted-foreground">
                        Import into a brand new dataset
                      </p>
                    </div>
                  </label>
                </RadioGroup>

                {state.destinationType === "existing" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="dest-dataset-select">Target dataset</Label>
                    <Select
                      value={state.datasetId}
                      onValueChange={(v) => update({ datasetId: v })}
                    >
                      <SelectTrigger id="dest-dataset-select">
                        <SelectValue placeholder="Select a dataset…" />
                      </SelectTrigger>
                      <SelectContent>
                        {datasets.map((d) => {
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
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="new-dataset-name">New dataset name</Label>
                    <Input
                      id="new-dataset-name"
                      placeholder="e.g. Q3 Customers"
                      value={state.newDatasetName}
                      onChange={(e) => update({ newDatasetName: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 4 (existing only): Import Mode */}
            {!isProgressView && effectiveSteps[step] === "Import Mode" && (
              <div className="space-y-4">
                <RadioGroup
                  value={state.importMode}
                  onValueChange={(v) => update({ importMode: v as ImportMode })}
                  className="space-y-2"
                >
                  {(Object.entries(MODE_DESCRIPTIONS) as [ImportMode, typeof MODE_DESCRIPTIONS[ImportMode]][]).map(
                    ([mode, cfg]) => (
                      <label
                        key={mode}
                        className={cn(
                          "flex items-start gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors",
                          state.importMode === mode
                            ? cfg.destructive
                              ? "border-red-500/40 bg-red-500/5"
                              : "border-primary/40 bg-primary/5"
                            : "hover:border-muted-foreground/40"
                        )}
                      >
                        <RadioGroupItem value={mode} id={`mode-${mode}`} className="mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{cfg.label}</p>
                            {cfg.destructive && (
                              <span className="text-[10px] rounded-full bg-red-500/15 text-red-400 px-1.5 py-0.5 border border-red-500/30">
                                Destructive
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {cfg.description}
                          </p>
                        </div>
                      </label>
                    )
                  )}
                </RadioGroup>

                {(state.importMode === "update_existing" ||
                  state.importMode === "append_update") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="match-field">Match field (key column)</Label>
                    <Select
                      value={state.matchField}
                      onValueChange={(v) => update({ matchField: v })}
                    >
                      <SelectTrigger id="match-field">
                        <SelectValue placeholder="Select key column…" />
                      </SelectTrigger>
                      <SelectContent>
                        {sheetHeaders.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Rows with matching values in this column will be updated.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Columns mapping step */}
            {!isProgressView && effectiveSteps[step] === "Columns" && (
              <ColumnMapping
                sheetHeaders={sheetHeaders}
                appColumns={appColumns}
                aiSuggestions={aiQuery.data?.mappings ?? []}
                isLoadingAI={aiQuery.isLoading}
                value={state.columnMappings}
                onChange={(mappings) => update({ columnMappings: mappings })}
              />
            )}

            {/* Confirm step */}
            {!isProgressView && effectiveSteps[step] === "Confirm" && (
              <div className="space-y-3">
                <div className="rounded-lg border divide-y">
                  <SummaryRow label="Source" value={`${state.spreadsheetName} / ${state.sheetName}`} />
                  <SummaryRow
                    label="Destination"
                    value={
                      state.destinationType === "new"
                        ? `New: "${state.newDatasetName}"`
                        : selectedDataset?.name ?? ""
                    }
                  />
                  <SummaryRow label="Mode" value={isNewDataset ? "Append" : MODE_DESCRIPTIONS[state.importMode].label} />
                  <SummaryRow
                    label="Columns"
                    value={`${state.columnMappings.filter((m) => m.columnId || m.isNewColumn).length} mapped`}
                  />
                </div>
                {!isNewDataset && state.importMode === "replace" && (
                  <div className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    All existing records will be deleted before import. You will be asked to confirm.
                  </div>
                )}
              </div>
            )}

            {/* Progress view — shown after job is started */}
            {isProgressView && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3">
                  {isDone ? (
                    progressQuery.data?.status === "failed" ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                        <Upload className="h-5 w-5 text-emerald-400" />
                      </div>
                    )
                  ) : (
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium text-sm">
                      {isDone
                        ? progressQuery.data?.status === "failed"
                          ? "Import failed"
                          : progressQuery.data?.status === "partial"
                            ? "Import partially complete"
                            : "Import complete!"
                        : "Importing rows…"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {progressQuery.data
                        ? `${progressQuery.data.processedRows ?? 0} / ${progressQuery.data.totalRows ?? "?"} rows processed`
                        : "Starting…"}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                {progressQuery.data && (
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all duration-500",
                        progressQuery.data.status === "failed" ? "bg-red-500" : "bg-blue-500"
                      )}
                      style={{ width: `${progressQuery.data.progressPercent ?? 0}%` }}
                    />
                  </div>
                )}

                {/* Stats */}
                {progressQuery.data && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Inserted", value: progressQuery.data.insertedRows ?? 0, color: "text-emerald-400" },
                      { label: "Updated", value: progressQuery.data.updatedRows ?? 0, color: "text-blue-400" },
                      { label: "Errors", value: progressQuery.data.errorRows ?? 0, color: "text-red-400" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg border bg-muted/30 p-3 text-center">
                        <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error list */}
                {progressQuery.data?.errors && progressQuery.data.errors.length > 0 && (
                  <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 space-y-1 max-h-32 overflow-y-auto">
                    {progressQuery.data.errors.slice(0, 10).map((e, i) => (
                      <p key={i} className="text-xs text-red-400">
                        Row {e.row}: {e.message}
                      </p>
                    ))}
                    {progressQuery.data.errors.length > 10 && (
                      <p className="text-xs text-muted-foreground">
                        +{progressQuery.data.errors.length - 10} more errors…
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {isProgressView ? (
              <Button
                variant={isDone ? "default" : "outline"}
                onClick={handleClose}
                disabled={!isDone && progressQuery.isFetching}
              >
                {isDone ? "Done" : "Running…"}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
                  disabled={importMutation.isPending}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {step === 0 ? "Cancel" : "Back"}
                </Button>
                {step < effectiveSteps.length - 1 ? (
                  <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleConfirm}
                    disabled={importMutation.isPending}
                    className={
                      !isNewDataset && state.importMode === "replace"
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    }
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Start Import
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destructive confirmation for REPLACE mode */}
      <DestructiveChangeConfirmation
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace All Records"
        description="This will permanently delete ALL existing records in the destination dataset and replace them with data from the Google Sheet."
        confirmWord="REPLACE"
        confirmLabel="Delete & Replace"
        affectedItems={[
          { label: "Target dataset", count: selectedDataset ? undefined : undefined },
        ]}
        onConfirm={() => {
          setConfirmOpen(false);
          importMutation.mutate();
        }}
        isLoading={importMutation.isPending}
      />
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
