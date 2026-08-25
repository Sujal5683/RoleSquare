"use client";

// LinkSheetWizard
// Multi-step wizard to link an existing dataset to a Google Sheet tab.
// Steps:
//   1. Account — select/connect a Google Sheets account
//   2. Spreadsheet — pick a spreadsheet from Drive
//   3. Tab — pick a tab, preview its data
//   4. Mapping — map columns (with AI suggestions)
//   5. Settings — sync direction, conflict strategy
//   6. Confirm — review and link

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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Link2,
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface WizardState {
  sheetsAccountId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetId: number;
  sheetName: string;
  columnMappings: ColumnMappingEntry[];
  direction: "bidirectional" | "to_sheet" | "from_sheet";
  conflictStrategy: "flag" | "app_wins" | "sheet_wins";
  scheduleExpr: string;
  doPush: boolean;
}

interface Dataset {
  id: string;
  name: string;
}

interface AISuggestion {
  sheetHeader: string;
  appColumnId: string | null;
  appColumnName: string | null;
  confidence: number;
  reason: string;
  suggestedDataType: string;
  isAutoSelected: boolean;
}

const STEPS = ["Account", "Spreadsheet", "Tab", "Columns", "Settings", "Confirm"];

// ── Component ─────────────────────────────────────────────────────────────────

interface LinkSheetWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: Dataset;
  appColumns: AppColumn[];
  onSuccess?: (mappingId: string) => void;
}

export function LinkSheetWizard({
  open,
  onOpenChange,
  dataset,
  appColumns,
  onSuccess,
}: LinkSheetWizardProps) {
  const { selectedOrganizationId } = useAppStore();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    sheetsAccountId: "",
    spreadsheetId: "",
    spreadsheetName: "",
    sheetId: 0,
    sheetName: "",
    columnMappings: [],
    direction: "bidirectional",
    conflictStrategy: "flag",
    scheduleExpr: "5m",
    doPush: true,
  });

  // Fetch AI column mapping suggestions when tab is selected
  const aiQuery = useQuery<{ mappings: AISuggestion[] }>({
    queryKey: [
      "ai-mapping",
      state.spreadsheetId,
      state.sheetName,
      dataset.id,
    ],
    queryFn: async () => {
      // Get sheet headers first via preview
      const preview = await api.get<{ headers: string[]; rows: string[][]; totalRowsEstimate: number }>(
        `/api/google-sheets/spreadsheets/${state.spreadsheetId}/preview` +
          `?sheetsAccountId=${state.sheetsAccountId}&tab=${encodeURIComponent(state.sheetName)}&limit=5`
      );
      return api.post<{ mappings: AISuggestion[] }>("/api/google-sheets/ai-mapping", {
        sheetHeaders: preview.headers.filter((h: string) => h !== "__row_id__"),
        sampleRows: preview.rows,
        datasetId: dataset.id,
      });
    },
    enabled: step === 3 && !!state.sheetName && !!state.spreadsheetId,
    retry: false,
  });

  const update = useCallback(
    (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch })),
    []
  );

  const linkMutation = useMutation({
    mutationFn: () =>
      api.post<{ sheetMappingId: string }>("/api/google-sheets/link", {
        datasetId: dataset.id,
        sheetsAccountId: state.sheetsAccountId,
        spreadsheetId: state.spreadsheetId,
        spreadsheetName: state.spreadsheetName,
        sheetId: state.sheetId,
        sheetName: state.sheetName,
        direction: state.direction,
        columnMappings: state.columnMappings,
        conflictStrategy: state.conflictStrategy,
        doPush: state.doPush,
      }),
    onSuccess: (data: { sheetMappingId: string }) => {
      toast.success(`"${dataset.name}" linked to Google Sheets`);
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      queryClient.invalidateQueries({ queryKey: ["sheet-mappings"] });
      onSuccess?.(data.sheetMappingId);
      onOpenChange(false);
      setStep(0);
      setState({
        sheetsAccountId: "",
        spreadsheetId: "",
        spreadsheetName: "",
        sheetId: 0,
        sheetName: "",
        columnMappings: [],
        direction: "bidirectional",
        conflictStrategy: "flag",
        scheduleExpr: "5m",
        doPush: true,
      });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to link"),
  });

  const canNext = () => {
    switch (step) {
      case 0: return !!state.sheetsAccountId;
      case 1: return !!state.spreadsheetId;
      case 2: return !!state.sheetName;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-emerald-400" />
            Link to Google Sheets
          </DialogTitle>
          <DialogDescription>
            Syncing <strong>{dataset.name}</strong> ·{" "}
            <span className="text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Step progress bar */}
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-emerald-500" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step label */}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {STEPS[step]}
        </p>

        {/* Step content */}
        <div className="min-h-[260px] overflow-y-auto overflow-x-hidden pr-2 flex-1">
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
                update({ spreadsheetId: id, spreadsheetName: name, sheetName: "", sheetId: 0 })
              }
            />
          )}

          {step === 2 && (
            <div className="space-y-3">
              <TabSelector
                sheetsAccountId={state.sheetsAccountId}
                spreadsheetId={state.spreadsheetId}
                value={state.sheetName}
                onSelect={(title, sheetId) =>
                  update({ sheetName: title, sheetId })
                }
              />
              {state.sheetName && (
                <>
                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground">Preview</p>
                  <SheetPreview
                    sheetsAccountId={state.sheetsAccountId}
                    spreadsheetId={state.spreadsheetId}
                    tabName={state.sheetName}
                    limit={6}
                  />
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <ColumnMapping
              sheetHeaders={
                aiQuery.data?.mappings.map((m) => m.sheetHeader) ??
                state.columnMappings.map((e) => e.sheetHeader)
              }
              appColumns={appColumns}
              aiSuggestions={aiQuery.data?.mappings ?? []}
              isLoadingAI={aiQuery.isLoading}
              value={state.columnMappings}
              onChange={(mappings) => update({ columnMappings: mappings })}
            />
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Sync direction</Label>
                <Select
                  value={state.direction}
                  onValueChange={(v) => update({ direction: v as WizardState["direction"] })}
                >
                  <SelectTrigger id="direction-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bidirectional">Two-way — App ↔ Sheet</SelectItem>
                    <SelectItem value="to_sheet">One-way — App → Sheet</SelectItem>
                    <SelectItem value="from_sheet">One-way — Sheet → App</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Two-way sync keeps both in sync. One-way sync is safer for read-only
                  scenarios.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Conflict strategy</Label>
                <Select
                  value={state.conflictStrategy}
                  onValueChange={(v) => update({ conflictStrategy: v as WizardState["conflictStrategy"] })}
                >
                  <SelectTrigger id="conflict-strategy-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flag">Flag for review (recommended)</SelectItem>
                    <SelectItem value="app_wins">App always wins</SelectItem>
                    <SelectItem value="sheet_wins">Sheet always wins</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  When both sides change the same value simultaneously, this determines the winner.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Sync interval</Label>
                <Select
                  value={state.scheduleExpr}
                  onValueChange={(v) => update({ scheduleExpr: v })}
                >
                  <SelectTrigger id="sync-interval-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual only</SelectItem>
                    <SelectItem value="1m">Every 1 minute</SelectItem>
                    <SelectItem value="5m">Every 5 minutes</SelectItem>
                    <SelectItem value="1h">Every 1 hour</SelectItem>
                    <SelectItem value="1d">Every 1 day</SelectItem>
                    <SelectItem value="1w">Every 1 week</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How frequently the background worker should sync changes.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-md border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Push existing records</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Immediately write all {dataset.name} records to the sheet
                  </p>
                </div>
                <Switch
                  id="do-push-switch"
                  checked={state.doPush}
                  onCheckedChange={(v) => update({ doPush: v })}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <SummaryRow label="Dataset" value={dataset.name} />
              <SummaryRow label="Spreadsheet" value={state.spreadsheetName} />
              <SummaryRow label="Tab" value={state.sheetName} />
              <SummaryRow
                label="Direction"
                value={
                  state.direction === "bidirectional"
                    ? "Two-way sync"
                    : state.direction === "to_sheet"
                    ? "App → Sheet only"
                    : "Sheet → App only"
                }
              />
              <SummaryRow
                label="Conflicts"
                value={
                  state.conflictStrategy === "flag"
                    ? "Flag for review"
                    : state.conflictStrategy === "app_wins"
                    ? "App wins"
                    : "Sheet wins"
                }
              />
              <SummaryRow
                label="Columns mapped"
                value={`${state.columnMappings.filter((m) => m.columnId !== null || m.isNewColumn).length} of ${state.columnMappings.length}`}
              />
              <SummaryRow
                label="Sync interval"
                value={
                  state.scheduleExpr === "manual" ? "Manual only" :
                  state.scheduleExpr === "1m" ? "Every 1 minute" :
                  state.scheduleExpr === "5m" ? "Every 5 minutes" :
                  state.scheduleExpr === "1h" ? "Every 1 hour" :
                  state.scheduleExpr === "1d" ? "Every 1 day" :
                  "Every 1 week"
                }
              />
              <SummaryRow
                label="Initial push"
                value={state.doPush ? "Yes — push existing records to sheet" : "No"}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
            disabled={linkMutation.isPending}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => linkMutation.mutate()}
              disabled={linkMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {linkMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Link Dataset
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
