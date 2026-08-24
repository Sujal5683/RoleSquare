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

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
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
  datasets: Array<{ id: string; name: string; appColumns?: AppColumn[] }>;
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

  const selectedDataset = datasets.find((d) => d.id === state.datasetId);
  const appColumns: AppColumn[] = selectedDataset?.appColumns ?? [];

  // AI suggestions
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
    enabled: step === 5 && sheetHeaders.length > 0,
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
        importMode: state.importMode,
        matchField: state.matchField || null,
        columnMappings: state.columnMappings,
      }),
    onSuccess: (data: { importJobId: string }) => {
      toast.success("Import started — processing in the background");
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      onSuccess?.(data.importJobId);
      onOpenChange(false);
      setStep(0);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to start import"),
  });

  const handleConfirm = () => {
    if (state.importMode === "replace") {
      setConfirmOpen(true);
    } else {
      importMutation.mutate();
    }
  };

  const canNext = () => {
    switch (step) {
      case 0: return !!state.sheetsAccountId;
      case 1: return !!state.spreadsheetId;
      case 2: return !!state.sheetName;
      case 3:
        return state.destinationType === "new"
          ? !!state.newDatasetName.trim()
          : !!state.datasetId;
      case 4:
        return (
          state.importMode !== "update_existing" &&
          state.importMode !== "append_update"
        ) || !!state.matchField;
      default: return true;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-400" />
              Import from Google Sheets
            </DialogTitle>
            <DialogDescription>
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-blue-500" : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* Content */}
          <div className="min-h-[260px]">
            {step === 0 && (
              <GoogleSheetsAccountSelector
                value={state.sheetsAccountId}
                onSelect={(id) => update({ sheetsAccountId: id })}
              />
            )}

            {step === 1 && (
              <SpreadsheetSelector
                sheetsAccountId={state.sheetsAccountId}
                value={state.spreadsheetId}
                onSelect={(id, name) =>
                  update({ spreadsheetId: id, spreadsheetName: name, sheetName: "" })
                }
              />
            )}

            {step === 2 && (
              <div className="space-y-3">
                <TabSelector
                  sheetsAccountId={state.sheetsAccountId}
                  spreadsheetId={state.spreadsheetId}
                  value={state.sheetName}
                  onSelect={async (title) => {
                    update({ sheetName: title });
                    // Pre-fetch headers for AI mapping
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

            {step === 3 && (
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
                        {datasets.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
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

            {step === 4 && (
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

            {step === 5 && (
              <ColumnMapping
                sheetHeaders={sheetHeaders}
                appColumns={appColumns}
                aiSuggestions={aiQuery.data?.mappings ?? []}
                isLoadingAI={aiQuery.isLoading}
                value={state.columnMappings}
                onChange={(mappings) => update({ columnMappings: mappings })}
              />
            )}

            {step === 6 && (
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
                  <SummaryRow label="Mode" value={MODE_DESCRIPTIONS[state.importMode].label} />
                  <SummaryRow
                    label="Columns"
                    value={`${state.columnMappings.filter((m) => m.columnId || m.isNewColumn).length} mapped`}
                  />
                </div>
                {state.importMode === "replace" && (
                  <div className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    All existing records will be deleted before import. You will be asked to confirm.
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
              disabled={importMutation.isPending}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleConfirm}
                disabled={importMutation.isPending}
                className={
                  state.importMode === "replace"
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
