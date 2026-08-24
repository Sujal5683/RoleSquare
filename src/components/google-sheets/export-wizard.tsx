"use client";

// ExportWizard — simplified 3-step wizard to export a dataset to Google Sheets.
// Steps: Account → Mode → Confirm

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ExternalLink, ChevronLeft, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleSheetsAccountSelector } from "@/components/google-sheets/google-sheets-account-selector";

type ExportMode = "new_sheet" | "new_tab" | "replace_tab" | "append_tab";

interface ExportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: { id: string; name: string; recordCount?: number };
}

const MODES: { value: ExportMode; label: string; description: string }[] = [
  {
    value: "new_sheet",
    label: "Create new spreadsheet",
    description: "Export to a brand-new Google Spreadsheet in your Drive.",
  },
  {
    value: "new_tab",
    label: "Add tab to existing spreadsheet",
    description: "Add a new tab to a spreadsheet you already have.",
  },
  {
    value: "replace_tab",
    label: "Replace tab content",
    description: "Overwrite the data in an existing tab. Headers are rewritten.",
  },
  {
    value: "append_tab",
    label: "Append to existing tab",
    description: "Add rows below existing data in a tab. No headers written.",
  },
];

const STEPS = ["Account", "Mode", "Confirm"];

export function ExportWizard({
  open,
  onOpenChange,
  dataset,
}: ExportWizardProps) {
  const [step, setStep] = useState(0);
  const [sheetsAccountId, setSheetsAccountId] = useState("");
  const [mode, setMode] = useState<ExportMode>("new_sheet");
  const [newSheetTitle, setNewSheetTitle] = useState(`${dataset.name} Export`);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [tabName, setTabName] = useState("");
  const [result, setResult] = useState<{
    spreadsheetUrl: string;
    rowsExported: number;
  } | null>(null);

  const exportMutation = useMutation({
    mutationFn: () =>
      api.post<{ spreadsheetUrl: string; rowsExported: number; spreadsheetId: string }>("/api/google-sheets/export", {
        datasetId: dataset.id,
        sheetsAccountId,
        mode,
        spreadsheetId: mode !== "new_sheet" ? spreadsheetId : undefined,
        tabName: mode !== "new_sheet" ? tabName : undefined,
        newSheetTitle: mode === "new_sheet" ? newSheetTitle : undefined,
      }),
    onSuccess: (data) => {
      setResult({ spreadsheetUrl: data.spreadsheetUrl, rowsExported: data.rowsExported });
      toast.success(`${data.rowsExported} rows exported to Google Sheets`);
    },
    onError: (err: Error) => toast.error(err.message || "Export failed"),
  });

  const canNext = () => {
    if (step === 0) return !!sheetsAccountId;
    if (step === 1) {
      if (mode === "new_sheet") return !!newSheetTitle.trim();
      if (mode === "new_tab") return !!spreadsheetId && !!tabName.trim();
      if (mode === "replace_tab" || mode === "append_tab")
        return !!spreadsheetId && !!tabName.trim();
    }
    return true;
  };

  if (result) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-400">Export Complete</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">
              {result.rowsExported.toLocaleString()} rows exported successfully.
            </p>
            <a
              href={result.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-emerald-400 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Google Sheets
            </a>
          </div>
          <DialogFooter>
            <Button onClick={() => { setResult(null); onOpenChange(false); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-emerald-400" />
            Export to Google Sheets
          </DialogTitle>
          <DialogDescription>
            {dataset.name} · Step {step + 1} of {STEPS.length}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-emerald-500" : "bg-muted"
              )}
            />
          ))}
        </div>

        <div className="min-h-[220px]">
          {step === 0 && (
            <GoogleSheetsAccountSelector
              value={sheetsAccountId}
              onSelect={setSheetsAccountId}
            />
          )}

          {step === 1 && (
            <div className="space-y-3">
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as ExportMode)}
                className="space-y-2"
              >
                {MODES.map((m) => (
                  <label
                    key={m.value}
                    className={cn(
                      "flex items-start gap-3 rounded-md border px-4 py-3 cursor-pointer transition-colors",
                      mode === m.value
                        ? "border-primary/40 bg-primary/5"
                        : "hover:border-muted-foreground/40"
                    )}
                  >
                    <RadioGroupItem value={m.value} id={`export-mode-${m.value}`} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.description}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>

              {mode === "new_sheet" && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-sheet-title">Spreadsheet title</Label>
                  <Input
                    id="new-sheet-title"
                    value={newSheetTitle}
                    onChange={(e) => setNewSheetTitle(e.target.value)}
                  />
                </div>
              )}

              {mode !== "new_sheet" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="export-spreadsheet-id">Spreadsheet ID</Label>
                    <Input
                      id="export-spreadsheet-id"
                      value={spreadsheetId}
                      onChange={(e) => setSpreadsheetId(e.target.value)}
                      placeholder="Paste spreadsheet ID from URL"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="export-tab-name">Tab name</Label>
                    <Input
                      id="export-tab-name"
                      value={tabName}
                      onChange={(e) => setTabName(e.target.value)}
                      placeholder="e.g. Sheet1"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-lg border divide-y">
                <SummaryRow label="Dataset" value={dataset.name} />
                <SummaryRow
                  label="Records"
                  value={(dataset.recordCount ?? 0).toLocaleString()}
                />
                <SummaryRow
                  label="Mode"
                  value={MODES.find((m) => m.value === mode)?.label ?? mode}
                />
                {mode === "new_sheet" && (
                  <SummaryRow label="Title" value={newSheetTitle} />
                )}
                {mode !== "new_sheet" && (
                  <SummaryRow label="Tab" value={tabName} />
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
            disabled={exportMutation.isPending}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Next
            </Button>
          ) : (
            <Button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {exportMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
