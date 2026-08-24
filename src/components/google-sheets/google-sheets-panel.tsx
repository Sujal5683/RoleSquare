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
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
              Google Sheets
            </SheetTitle>
            <SheetDescription className="text-xs">
              {dataset.name}
              {isLinked && (
                <Badge
                  variant="outline"
                  className="ml-2 text-[10px] py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                >
                  Linked
                </Badge>
              )}
            </SheetDescription>
          </SheetHeader>

          <Separator className="my-4" />

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
            /* ── Unlinked state — CTA ── */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This dataset is not linked to a Google Sheet. Link it to enable
                continuous two-way sync, or import / export data one time.
              </p>

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setLinkOpen(true)}
                id="link-sheet-btn"
              >
                <Link2 className="mr-2 h-4 w-4" />
                Link to Google Sheet
              </Button>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  One-time operations
                </p>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setImportOpen(true)}
                  id="import-only-btn"
                >
                  <Upload className="mr-2 h-4 w-4 text-blue-400" />
                  Import from Google Sheets
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setExportOpen(true)}
                  id="export-only-btn"
                >
                  <Download className="mr-2 h-4 w-4 text-emerald-400" />
                  Export to Google Sheets
                </Button>
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
