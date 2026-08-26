"use client";

// OrgSheetsWizard
// Connects an entire organization to a single Google Spreadsheet.
// Each selected dataset is exported to its own tab in the spreadsheet.
//
// Steps:
//   1. Account  — select/connect a Google Sheets account
//   2. Spreadsheet — create a new or pick an existing spreadsheet
//   3. Datasets — choose which datasets to include (all checked by default)
//   4. Confirm — preview the mapping + start export

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleSheetsAccountSelector } from "@/components/google-sheets/google-sheets-account-selector";
import { SpreadsheetSelector } from "@/components/google-sheets/spreadsheet-selector";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DatasetItem {
  id: string;
  name: string;
  recordCount: number;
  accessLevel?: string;
}

interface OrgSheetsWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasets: DatasetItem[];
  organizationId: string;
}

const STEPS = ["Account", "Spreadsheet", "Datasets", "Settings", "Confirm"];

// ── Component ─────────────────────────────────────────────────────────────────

export function OrgSheetsWizard({
  open,
  onOpenChange,
  datasets,
  organizationId,
}: OrgSheetsWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Wizard state
  const [sheetsAccountId, setSheetsAccountId] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [spreadsheetName, setSpreadsheetName] = useState("");
  const [createNew, setCreateNew] = useState(true);
  const [newSpreadsheetName, setNewSpreadsheetName] = useState(
    "Organization Datasets Export"
  );
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(
    new Set(datasets.map((d) => d.id))
  );
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Sync settings
  const [direction, setDirection] = useState<"bidirectional" | "to_sheet" | "from_sheet">("bidirectional");
  const [conflictStrategy, setConflictStrategy] = useState<"flag" | "app_wins" | "sheet_wins">("flag");
  const [scheduleExpr, setScheduleExpr] = useState("5m");

  const reset = useCallback(() => {
    setStep(0);
    setSheetsAccountId("");
    setSpreadsheetId("");
    setSpreadsheetName("");
    setCreateNew(true);
    setNewSpreadsheetName("Organization Datasets Export");
    setSelectedDatasets(new Set(datasets.map((d) => d.id)));
    setResultUrl(null);
    setDirection("bidirectional");
    setConflictStrategy("flag");
    setScheduleExpr("5m");
  }, [datasets]);

  const exportMutation = useMutation<
    { spreadsheetUrl: string; tabsCreated: number },
    Error,
    void
  >({
    mutationFn: () =>
      api.post<{ spreadsheetUrl: string; tabsCreated: number }>("/api/google-sheets/org-export", {
        sheetsAccountId,
        spreadsheetId: createNew ? null : spreadsheetId,
        spreadsheetName: createNew ? newSpreadsheetName : spreadsheetName,
        createNew,
        datasetIds: Array.from(selectedDatasets),
        organizationId,
        direction,
        conflictStrategy,
        scheduleExpr,
      }),
    onSuccess: (data: { spreadsheetUrl: string; tabsCreated: number }) => {
      setResultUrl(data.spreadsheetUrl);
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
    onError: () => toast.error("Export failed — check your permissions and try again"),
  });

  function toggleDataset(id: string) {
    setSelectedDatasets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedItems = datasets.filter((d) => selectedDatasets.has(d.id));
  const canProceed = [
    !!sheetsAccountId,
    createNew ? !!newSpreadsheetName.trim() : !!spreadsheetId,
    selectedDatasets.size > 0,
    true, // Settings
    true, // Confirm
  ][step];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="w-[90vw] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            Connect Organization to Google Sheets
          </DialogTitle>
          <DialogDescription>
            Export all your datasets to a single Google Spreadsheet — each
            dataset in its own tab.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                  i < step
                    ? "bg-emerald-500 text-white"
                    : i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "ml-1.5 text-xs hidden sm:inline",
                  i === step ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="mx-1 sm:mx-2 h-px w-2 sm:w-6 bg-border hidden sm:block" />
              )}
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex-1 overflow-y-auto min-h-[260px] pr-2 -mr-2">
          {/* ── Step 0: Account ─────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Select the Google account to use for the export. The spreadsheet
              will be created in that account's Google Drive.
            </p>
            <GoogleSheetsAccountSelector
              value={sheetsAccountId}
              onSelect={setSheetsAccountId}
            />
          </div>
        )}

        {/* ── Step 1: Spreadsheet ──────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 py-1">
            <div className="flex gap-3">
              <Button
                size="sm"
                variant={createNew ? "default" : "outline"}
                onClick={() => setCreateNew(true)}
              >
                Create new spreadsheet
              </Button>
              <Button
                size="sm"
                variant={!createNew ? "default" : "outline"}
                onClick={() => setCreateNew(false)}
              >
                Use existing spreadsheet
              </Button>
            </div>

            {createNew ? (
              <div className="space-y-1.5">
                <Label htmlFor="ss-name">Spreadsheet name</Label>
                <Input
                  id="ss-name"
                  value={newSpreadsheetName}
                  onChange={(e) => setNewSpreadsheetName(e.target.value)}
                  placeholder="e.g. My Org Datasets"
                />
              </div>
            ) : (
              <SpreadsheetSelector
                sheetsAccountId={sheetsAccountId}
                value={spreadsheetId}
                onSelect={(id, name) => {
                  setSpreadsheetId(id);
                  setSpreadsheetName(name);
                }}
              />
            )}
          </div>
        )}

        {/* ── Step 2: Datasets ──────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedDatasets.size} of {datasets.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    const editableIds = datasets
                      .filter(d => d.accessLevel !== "read" && d.accessLevel !== "comment")
                      .map(d => d.id);
                    setSelectedDatasets(new Set(editableIds));
                  }}
                >
                  Select all
                </button>
                <button
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => setSelectedDatasets(new Set())}
                >
                  Clear all
                </button>
              </div>
            </div>
            <ScrollArea className="max-h-64">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                {datasets.map((d) => {
                  const isReadOnly = d.accessLevel === "read" || d.accessLevel === "comment";
                  return (
                  <label
                    key={d.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border bg-card/50 px-3 py-2",
                      isReadOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/40"
                    )}
                  >
                    <Checkbox
                      checked={selectedDatasets.has(d.id)}
                      onCheckedChange={() => !isReadOnly && toggleDataset(d.id)}
                      disabled={isReadOnly}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{d.name}</p>
                        {isReadOnly && <span className="text-xs text-muted-foreground">(View only)</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.recordCount} record{d.recordCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 truncate max-w-[100px]" title={d.name}>
                      Tab: {d.name.slice(0, 15)}
                    </Badge>
                  </label>
                )})}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ── Step 3: Settings ──────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6 py-2">
            <div className="space-y-2">
              <Label>Sync direction</Label>
              <Select
                value={direction}
                onValueChange={(v: any) => setDirection(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bidirectional">Two-way sync (Recommended)</SelectItem>
                  <SelectItem value="to_sheet">One-way — App → Sheet</SelectItem>
                  <SelectItem value="from_sheet">One-way — Sheet → App</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Two-way sync keeps both in sync. One-way sync is safer for read-only scenarios.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Conflict strategy</Label>
              <Select
                value={conflictStrategy}
                onValueChange={(v: any) => setConflictStrategy(v)}
              >
                <SelectTrigger>
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
                value={scheduleExpr}
                onValueChange={(v) => setScheduleExpr(v)}
              >
                <SelectTrigger>
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
                How frequently the background worker should sync changes for these datasets.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirm ──────────────────────────────────────────── */}
        {step === 4 && !resultUrl && (
          <div className="space-y-3 py-1">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="font-medium">
                  {createNew ? newSpreadsheetName : spreadsheetName}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {createNew ? "New" : "Existing"}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-start gap-2">
                <Layers className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {selectedItems.length} tab{selectedItems.length !== 1 ? "s" : ""} will be created and kept in sync:
                  </p>
                  {selectedItems.map((d) => (
                    <p key={d.id} className="text-xs font-mono truncate text-foreground/80">
                      • {d.name} ({d.recordCount} records)
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A SheetMapping and SyncState will be created for each dataset to keep them in sync with Google Sheets.
            </p>
          </div>
        )}

        {/* ── Success state ─────────────────────────────────────────────── */}
        {resultUrl && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold">Export complete!</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedDatasets.size} dataset{selectedDatasets.size !== 1 ? "s" : ""} exported successfully.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(resultUrl, "_blank", "noopener")}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open in Google Sheets
            </Button>
          </div>
        )}
        </div>

        <DialogFooter>
          {!resultUrl && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))}
                disabled={exportMutation.isPending}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                {step === 0 ? "Cancel" : "Back"}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canProceed}
                >
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending || selectedDatasets.size === 0}
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                  )}
                  {exportMutation.isPending ? "Exporting…" : "Export to Sheets"}
                </Button>
              )}
            </>
          )}
          {resultUrl && (
            <Button
              size="sm"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
