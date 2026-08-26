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
  SheetBody,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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

          <SheetBody>
            <Separator className="my-5 opacity-50" />

            <Accordion type="single" collapsible defaultValue="sync" className="w-full mt-4 space-y-4">
              {/* ── Section 1: Two-Way Sync ── */}
              <AccordionItem value="sync" className="border rounded-xl bg-card overflow-hidden">
              <AccordionTrigger className="px-5 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 text-left">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <RefreshCw className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Two-Way Sync</h3>
                    <p className="text-xs text-muted-foreground font-normal">Real-time bi-directional synchronization</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5 pt-2">
                {isLinked ? (
                  <SyncDashboard
                    sheetMappingId={linkedMappingId!}
                    onUnlinked={() => setLinkedMappingId(null)}
                  />
                ) : (
                  <div className="space-y-4 pt-2">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                      <Link2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground mb-4">
                        Connect this dataset to a Google Sheet. Any changes made in either place will reflect instantly.
                      </p>
                      <Button
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        onClick={() => setLinkOpen(true)}
                        id="link-sheet-btn"
                      >
                        <Link2 className="mr-2 h-3.5 w-3.5" /> Set up connection
                      </Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ── Section 2: Import / Export ── */}
            <AccordionItem value="io" className="border rounded-xl bg-card overflow-hidden">
              <AccordionTrigger className="px-5 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 text-left">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">One-Time Import & Export</h3>
                    <p className="text-xs text-muted-foreground font-normal">Manual data transfers without linking</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5 pt-2 space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 group hover:bg-blue-500/5 hover:border-blue-500/30 transition-all"
                  onClick={() => setImportOpen(true)}
                  id="import-btn"
                >
                  <Upload className="mr-3 h-4 w-4 text-blue-400 group-hover:text-blue-500 transition-colors" />
                  <div className="text-left">
                    <div className="text-sm font-medium">Import from Google Sheets</div>
                    <div className="text-xs text-muted-foreground">Pull data in one go</div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 group hover:bg-emerald-500/5 hover:border-emerald-500/30 transition-all"
                  onClick={() => setExportOpen(true)}
                  id="export-btn"
                >
                  <Download className="mr-3 h-4 w-4 text-emerald-400 group-hover:text-emerald-500 transition-colors" />
                  <div className="text-left">
                    <div className="text-sm font-medium">Export to Google Sheets</div>
                    <div className="text-xs text-muted-foreground">Push data out one time</div>
                  </div>
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* ── Section 3: History ── */}
            <AccordionItem value="history" className="border rounded-xl bg-card overflow-hidden">
              <AccordionTrigger className="px-5 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 text-left">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                    <History className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Activity History</h3>
                    <p className="text-xs text-muted-foreground font-normal">Past syncs and imports</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5 pt-2">
                {isLinked ? (
                  <SyncHistory sheetMappingId={linkedMappingId!} />
                ) : (
                  <SyncHistory datasetId={dataset.id} />
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          </SheetBody>
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
