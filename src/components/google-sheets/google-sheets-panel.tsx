"use client";

// GoogleSheetsPanel
// Main entry point for all Google Sheets actions on a dataset.
// Renders as a slide-in sheet (Sheet component) from the dataset detail view.
// Shows either:
//   A) Link wizard (if not linked) + Import wizard
//   B) Sync dashboard + import/export options (if linked)

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileSpreadsheet,
  History,
  Link2,
  Link2Off,
  RefreshCw,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncDashboard } from "@/components/google-sheets/sync-dashboard";
import { SyncHistory } from "@/components/google-sheets/sync-history";
import { LinkSheetWizard } from "@/components/google-sheets/link-sheet-wizard";
import { ImportWizard } from "@/components/google-sheets/import-wizard";
import { ExportWizard } from "@/components/google-sheets/export-wizard";
import type { AppColumn } from "@/components/google-sheets/column-mapping";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dataset {
  id: string;
  name: string;
  recordCount: number;
  sheetMappingId?: string | null;  // null = not linked
  syncStatus?: string | null;
  pendingConflicts?: number;
}

interface GoogleSheetsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: Dataset;
  appColumns: AppColumn[];
  allDatasets: Array<{ id: string; name: string }>;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GoogleSheetsPanel({
  open,
  onOpenChange,
  dataset,
  appColumns,
  allDatasets,
  className,
}: GoogleSheetsPanelProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("sync");
  const [linkedMappingId, setLinkedMappingId] = useState<string | null>(
    dataset.sheetMappingId ?? null
  );

  const isLinked = !!linkedMappingId;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto" side="right">
          <SheetHeader className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5 border border-emerald-500/10">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
            <SheetTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 shadow-inner">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              </div>
              Google Sheets
            </SheetTitle>
            <SheetDescription className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground/80">{dataset.name}</span>
              {isLinked && (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider"
                >
                  Linked
                </Badge>
              )}
            </SheetDescription>
          </SheetHeader>

          <Separator className="my-5 opacity-50" />

          {isLinked ? (
            /* ── Linked state — show tabs ── */
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="sync" className="flex-1 text-xs">
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Sync
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1 text-xs">
                  <History className="mr-1.5 h-3.5 w-3.5" />
                  History
                </TabsTrigger>
                <TabsTrigger value="io" className="flex-1 text-xs">
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Import / Export
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sync" className="mt-4">
                <SyncDashboard
                  sheetMappingId={linkedMappingId!}
                  onUnlinked={() => setLinkedMappingId(null)}
                />
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <SyncHistory sheetMappingId={linkedMappingId!} />
              </TabsContent>

              <TabsContent value="io" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Import or export data independently of the continuous sync.
                </p>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setImportOpen(true)}
                  id="import-btn"
                >
                  <Upload className="mr-2 h-4 w-4 text-blue-400" />
                  Import from Google Sheets
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setExportOpen(true)}
                  id="export-btn"
                >
                  <Download className="mr-2 h-4 w-4 text-emerald-400" />
                  Export to Google Sheets
                </Button>
              </TabsContent>
            </Tabs>
          ) : (
            /* ── Unlinked state — Premium CTA ── */
            <div className="space-y-6 mt-4 pb-8">
              <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-card p-6 shadow-md shadow-emerald-500/5 transition-all hover:shadow-emerald-500/10">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
                <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 shadow-inner">
                    <Link2 className="h-7 w-7 text-emerald-400" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg tracking-tight text-foreground">
                      Connect your dataset
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed px-2">
                      Link this dataset to a Google Sheet for real-time two-way sync. Any changes made in the app or sheet will reflect instantly.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all font-medium"
                    onClick={() => setLinkOpen(true)}
                    id="link-sheet-btn"
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Set up two-way sync
                  </Button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border bg-muted/30 p-5">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Or one-time operations
                  </p>
                  <div className="h-px flex-1 bg-border" />
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="h-auto flex-col py-4 px-3 gap-3 hover:bg-blue-500/5 hover:text-blue-500 hover:border-blue-500/30 transition-all"
                    onClick={() => setImportOpen(true)}
                    id="import-only-btn"
                  >
                    <Upload className="h-5 w-5 text-blue-400 mb-1" />
                    <span className="text-xs font-semibold">Import Data</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto flex-col py-4 px-3 gap-3 hover:bg-emerald-500/5 hover:text-emerald-500 hover:border-emerald-500/30 transition-all"
                    onClick={() => setExportOpen(true)}
                    id="export-only-btn"
                  >
                    <Download className="h-5 w-5 text-emerald-400 mb-1" />
                    <span className="text-xs font-semibold">Export Data</span>
                  </Button>
                </div>
              </div>

              <div className="pt-2">
                <h4 className="mb-3 text-sm font-semibold text-foreground">Import History</h4>
                <SyncHistory datasetId={dataset.id} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Sub-wizards */}
      <LinkSheetWizard
        open={linkOpen}
        onOpenChange={setLinkOpen}
        dataset={{ id: dataset.id, name: dataset.name }}
        appColumns={appColumns}
        onSuccess={(mappingId) => {
          setLinkedMappingId(mappingId);
          setLinkOpen(false);
          setActiveTab("sync");
        }}
      />

      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        datasets={allDatasets}
        onSuccess={() => setImportOpen(false)}
      />

      <ExportWizard
        open={exportOpen}
        onOpenChange={setExportOpen}
        dataset={dataset}
      />
    </>
  );
}
