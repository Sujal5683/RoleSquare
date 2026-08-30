"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { DatasetDTO, SchemaDTO } from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-elements";
import { DatasetsSkeleton } from "@/components/ui/skeletons/datasets-skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Database,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  FileDown,
  FileJson,
  Share2,
  ExternalLink,
  RefreshCw,
  ChevronRight,
  Calendar,
  Hash,
  AlertCircle,
  Filter,
  FileSpreadsheet,
  FileCode2,
  LayoutGrid,
  LayoutList,
  Columns3,
} from "lucide-react";
import { SyncStatusBadge } from "@/components/google-sheets/sync-status-badge";
import { GoogleSheetsPanel } from "@/components/google-sheets/google-sheets-panel";
import { OrgSheetsWizard } from "@/components/google-sheets/org-sheets-wizard";
import { AssignSchemaDialog } from "@/components/datasets/assign-schema-dialog";

// ── Helpers ──────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

import { useActiveOrg } from "@/hooks/use-active-org";
import { NewShareRequestDialog } from "@/components/sharing/new-share-request-dialog";

// ── Component ────────────────────────────────────────────────────────────

export function DatasetsView() {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();
  const openDataset = useAppStore((s) => s.openDataset);
  const setView = useAppStore((s) => s.setView);

  const [search, setSearch] = useState("");
  const [datasetFilter, setDatasetFilter] = useState<"all" | "mine" | "shared">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DatasetDTO | null>(null);
  const [shareTarget, setShareTarget] = useState<DatasetDTO | null>(null);
  const [sheetsPanelDataset, setSheetsPanelDataset] = useState<DatasetDTO | null>(null);
  const [assignSchemaTarget, setAssignSchemaTarget] = useState<DatasetDTO | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [dataSourceFilter, setDataSourceFilter] = useState("all");
  const [createdByFilter, setCreatedByFilter] = useState("all");
  const [modifiedFilter, setModifiedFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "columns">("grid");

  // ── Queries ────────────────────────────────────────────────────────────
  const {
    data: datasets,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["datasets", activeOrgId],
    queryFn: () =>
      api.get<DatasetDTO[]>(`/api/datasets?organizationId=${activeOrgId}`),
    enabled: !!activeOrgId,
  });

  const { data: schemas } = useQuery({
    queryKey: ["schemas", activeOrgId],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
    enabled: !!activeOrgId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const exportMutation = useMutation({
    mutationFn: ({ id, format }: { id: string; format: "csv" | "json" }) =>
      api.post<{ jobId: string; downloadUrl?: string; recordCount: number }>(
        `/api/datasets/${id}/export`,
        { format }
      ),
    onSuccess: (res, vars) => {
      if (res.downloadUrl) {
        // For CSV we get a data URL the browser can open directly.
        window.open(res.downloadUrl, "_blank");
        toast.success("Export ready", {
          description: `${vars.format.toUpperCase()} export of ${res.recordCount} record(s) opened in a new tab.`,
        });
      } else {
        toast.success("Export queued", {
          description: `Export job ${res.jobId} created. You'll be notified when it finishes.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["ai-jobs"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to export";
      toast.error("Export failed", { description: msg });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/datasets/${id}`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["datasets", activeOrgId] });
      const previousDatasets = queryClient.getQueryData(["datasets", activeOrgId]);
      queryClient.setQueryData(["datasets", activeOrgId], (old: any) =>
        (old || []).filter((d: any) => d.id !== id)
      );
      setDeleteTarget(null);
      return { previousDatasets };
    },
    onSuccess: () => {
      toast.success("Dataset deleted");
    },
    onError: (err: unknown, variables, context: any) => {
      queryClient.setQueryData(["datasets", activeOrgId], context?.previousDatasets);
      const msg = err instanceof Error ? err.message : "Failed to delete dataset";
      toast.error("Delete failed", { description: msg });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets", activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!datasets) return [];
    const q = search.trim().toLowerCase();
    let base = datasets;
    if (datasetFilter === "mine") base = base.filter((d) => !d.isShared);
    if (datasetFilter === "shared") base = base.filter((d) => d.isShared);
    
    return base.filter((d) => {
      if (q && !(
        d.name.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q) ||
        (d.schema?.name ?? "").toLowerCase().includes(q) ||
        (d.ownerOrgName ?? "").toLowerCase().includes(q)
      )) return false;

      // Basic quick filter checks (mocked since real data source/creator fields might be missing from DTO)
      if (dataSourceFilter !== "all" && d.schema?.name !== dataSourceFilter) return false;
      
      return true;
    });
  }, [datasets, search, datasetFilter, dataSourceFilter, createdByFilter, modifiedFilter]);

  const sharedCount = useMemo(() => (datasets ?? []).filter((d) => d.isShared).length, [datasets]);

  const handleShare = (d: DatasetDTO) => {
    setShareTarget(d);
  };

  const [orgSheetsOpen, setOrgSheetsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Datasets"
        description="Structured, evidence-backed datasets extracted from your sources. Open a dataset to explore records, review evidence, and approve corrections."
        icon={<Database className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Tooltip><TooltipTrigger asChild><Button
                              variant="outline"
                              size="sm"
                              onClick={() => setOrgSheetsOpen(true)}
                              disabled={!activeOrgId}
                            >
                              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                              Connect to Sheets
                            </Button></TooltipTrigger><TooltipContent>Export all datasets to a Google Sheet (each in its own tab)</TooltipContent></Tooltip>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={!activeOrgId || isFetching}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!activeOrgId}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New dataset
            </Button>
          </div>
        }
      />

      {/* Search + filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search datasets by name, description or schema…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-[60%]"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border p-1">
                  {(["all", "mine", "shared"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setDatasetFilter(f)}
                      className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                        datasetFilter === f
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f === "all" ? "All" : f === "mine" ? "Mine" : `Shared${sharedCount > 0 ? ` (${sharedCount})` : ""}`}
                    </button>
                  ))}
                </div>
                <Tooltip><TooltipTrigger asChild><Button
                                                variant={showFilters ? "secondary" : "outline"}
                                                size="icon"
                                                onClick={() => setShowFilters(!showFilters)}
                                              >
                                                <Filter className="h-4 w-4" />
                                              </Button></TooltipTrigger><TooltipContent>Toggle advanced filters</TooltipContent></Tooltip>
                {/* View mode toggle */}
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="shrink-0">
                  <TabsList className="h-8 p-1">
                    <TabsTrigger value="grid" className="h-6 w-6 p-0" >
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="flex h-full w-full items-center justify-center">
        <LayoutGrid className="h-3.5 w-3.5" />
      </span>
    </TooltipTrigger>
    <TooltipContent>Grid view</TooltipContent>
  </Tooltip>
</TabsTrigger>
                    <TabsTrigger value="columns" className="h-6 w-6 p-0" >
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="flex h-full w-full items-center justify-center">
        <Columns3 className="h-3.5 w-3.5" />
      </span>
    </TooltipTrigger>
    <TooltipContent>Columns view (2 columns)</TooltipContent>
  </Tooltip>
</TabsTrigger>
                    <TabsTrigger value="list" className="h-6 w-6 p-0" >
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="flex h-full w-full items-center justify-center">
        <LayoutList className="h-3.5 w-3.5" />
      </span>
    </TooltipTrigger>
    <TooltipContent>List view</TooltipContent>
  </Tooltip>
</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Quick Filter Bar */}
            {showFilters && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Data Sources</span>
                  <Select value={dataSourceFilter} onValueChange={setDataSourceFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Any source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any source</SelectItem>
                      {Array.from(new Set(datasets?.map(d => d.schema?.name).filter(Boolean))).map(name => (
                        <SelectItem key={name!} value={name!}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Created By</span>
                  <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Anyone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Anyone</SelectItem>
                      <SelectItem value="me">Me</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Modified</span>
                  <Select value={modifiedFilter} onValueChange={setModifiedFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any time</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grid of dataset cards */}
      {isLoading ? (
        <DatasetsSkeleton />
      ) : isError ? (
        <ErrorState
          message="Failed to load datasets"
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Database className="h-5 w-5" />}
          title={
            datasets && datasets.length > 0
              ? "No datasets match your search"
              : "No datasets yet"
          }
          description={
            datasets && datasets.length > 0
              ? "Try adjusting your search query."
              : "Create your first dataset to start collecting structured, evidence-backed records from your sources."
          }
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!activeOrgId}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New dataset
            </Button>
          }
        />
      ) : (
        <div className={
          viewMode === "list"
            ? "flex flex-col gap-3"
            : viewMode === "columns"
            ? "grid gap-4 sm:grid-cols-2"
            : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        }>
          {filtered.map((d) => {
            const isTemp = d.id.startsWith("temp-");
            return (
            <Card
              key={d.id}
              className={`flex p-4 transition-shadow hover:shadow-md ${viewMode === "list" ? "flex-row gap-4" : "flex-col gap-3"}`}
            >
              <div className="flex flex-col flex-1 min-w-0 gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Database className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 w-full">
                        <button
                          onClick={isTemp ? undefined : () => openDataset(d.id, d.name)}
                          disabled={isTemp}
                          className={`block w-full text-left text-base font-semibold leading-tight truncate ${isTemp ? "text-muted-foreground" : "hover:underline"}`}
                          title={d.name}
                        >
                          {d.name}
                        </button>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {d.schema ? (
                            <Badge variant="secondary" className="font-normal truncate max-w-full block text-left" title={d.schema.name}>
                              {d.schema.name}
                              {d.schema.fields?.length
                                ? ` · ${d.schema.fields.length} fields`
                                : ""}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="font-normal text-muted-foreground shrink-0 block text-left">
                              No schema
                            </Badge>
                          )}
                          {d.isShared && d.ownerOrgName && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 truncate w-full mt-1">
                              <ChevronRight className="h-3 w-3 shrink-0" />
                              <span className="truncate">From: {d.ownerOrgName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* In non-list modes, render actions on the right in the header */}
                      {viewMode !== "list" && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {d.accessLevel === "read" || d.accessLevel === "comment" ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50" disabled aria-label="Share dataset">
                                    <Share2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>You must be an editor to share this dataset.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Share dataset" onClick={() => handleShare(d)} disabled={isTemp}>
                            <Share2 className="h-4 w-4" />
                          </Button>
                        )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Dataset actions" disabled={isTemp}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {d.accessLevel !== "read" && d.accessLevel !== "comment" && (
                                <>
                                  <DropdownMenuItem onClick={() => setAssignSchemaTarget(d)}>
                                    <FileCode2 className="mr-2 h-4 w-4" />
                                    {d.schema ? "Change Schema" : "Assign Schema"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setSheetsPanelDataset(d)}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
                                    Google Sheets
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => exportMutation.mutate({ id: d.id, format: "csv" })} disabled={exportMutation.isPending}>
                                <FileDown className="mr-2 h-4 w-4" />
                                Export CSV
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportMutation.mutate({ id: d.id, format: "json" })} disabled={exportMutation.isPending}>
                                <FileJson className="mr-2 h-4 w-4" />
                                Export JSON
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {d.accessLevel !== "read" && d.accessLevel !== "comment" && (
                                <>
                                  <DropdownMenuItem onClick={() => handleShare(d)}>
                                    <Share2 className="mr-2 h-4 w-4" />
                                    Share
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(d)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col flex-1 min-w-0 space-y-2">
                  {/* Description */}
                  <p className={`text-sm text-muted-foreground ${viewMode === "list" ? "line-clamp-1" : "line-clamp-2 min-h-[2.5rem]"}`}>
                    {d.description || "No description provided."}
                  </p>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      <span className="tabular-nums font-medium text-foreground">
                        {d.recordCount}
                      </span>{" "}
                      records
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title={formatDate(d.createdAt)}
                    >
                      <Calendar className="h-3 w-3" />
                      {relativeTime(d.createdAt)}
                    </span>
                  </div>

                  {/* Footer content embedded inline for list view, separate row for grid */}
                  <div className={`flex items-center justify-between ${viewMode === "list" ? "pt-1" : "border-t pt-3 mt-auto"}`}>
                    <div className="flex items-center gap-2">
                      {d.isShared && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-violet-500/15 text-violet-600 border-violet-500/30 dark:text-violet-400 shrink-0">
                            Shared
                          </span>
                          {d.accessLevel && (
                            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-400 capitalize shrink-0">
                              {d.accessLevel} access
                            </span>
                          )}
                        </div>
                      )}
                      {(d as any).syncStatus && (d as any).syncStatus !== "unlinked" && (
                        <button
                          onClick={() => setSheetsPanelDataset(d)}
                          className="flex items-center hover:opacity-80 transition-opacity"
                          id={`sheets-badge-footer-${d.id}`}
                        >
                          <SyncStatusBadge
                            status={(d as any).syncStatus as any}
                            lastSyncAt={(d as any).lastSyncAt}
                            conflictCount={(d as any).pendingConflicts}
                          />
                        </button>
                      )}
                      {!d.isShared && !(d as any).syncStatus && (
                        <span className="text-xs text-muted-foreground">
                          {d.schema ? "Active" : "Needs schema"}
                        </span>
                      )}
                    </div>
                    {viewMode !== "list" && (
                      <Button variant="outline" size="sm" onClick={() => openDataset(d.id, d.name)} disabled={isTemp}>
                        Open
                        <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar actions specifically for list view */}
              {viewMode === "list" && (
                <div className="flex flex-col items-end justify-between shrink-0 pl-4 border-l">
                  <div className="flex items-center gap-1">
                    {d.accessLevel === "read" || d.accessLevel === "comment" ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50" disabled aria-label="Share dataset">
                                <Share2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>You must be an editor to share this dataset.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Share dataset"
                        onClick={() => handleShare(d)}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Dataset actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {d.accessLevel !== "read" && d.accessLevel !== "comment" && (
                          <>
                            <DropdownMenuItem onClick={() => setAssignSchemaTarget(d)}>
                              <FileCode2 className="mr-2 h-4 w-4" />
                              {d.schema ? "Change Schema" : "Assign Schema"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSheetsPanelDataset(d)}>
                              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
                              Google Sheets
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => exportMutation.mutate({ id: d.id, format: "csv" })} disabled={exportMutation.isPending}>
                          <FileDown className="mr-2 h-4 w-4" />
                          Export CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportMutation.mutate({ id: d.id, format: "json" })} disabled={exportMutation.isPending}>
                          <FileJson className="mr-2 h-4 w-4" />
                          Export JSON
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {d.accessLevel !== "read" && d.accessLevel !== "comment" && (
                          <>
                            <DropdownMenuItem onClick={() => handleShare(d)}>
                              <Share2 className="mr-2 h-4 w-4" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(d)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openDataset(d.id, d.name)} className="mt-4">
                    Open
                    <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {/* Create dataset dialog */}
      <CreateDatasetDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        schemas={schemas ?? []}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              along with{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.recordCount ?? 0}
              </span>{" "}
              record(s) and all of their extracted values. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete dataset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <NewShareRequestDialog
        open={!!shareTarget}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
        dataset={shareTarget}
      />

      {/* Google Sheets Panel */}
      {sheetsPanelDataset && (
        <GoogleSheetsPanel
          open={!!sheetsPanelDataset}
          onOpenChange={(open) => { if (!open) setSheetsPanelDataset(null); }}
          dataset={{
            id: sheetsPanelDataset.id,
            name: sheetsPanelDataset.name,
            recordCount: sheetsPanelDataset.recordCount,
            sheetMappingId: (sheetsPanelDataset as any).sheetMappingId ?? null,
            syncStatus: (sheetsPanelDataset as any).syncStatus ?? null,
          }}
          appColumns={
            (sheetsPanelDataset.schema?.fields ?? []).map((f, i) => ({
              columnId: f.id,
              name: f.name,
              dataType: f.type,
              required: f.required,
            }))
          }
          allDatasets={(datasets ?? []).map((d) => ({ id: d.id, name: d.name }))}
        />
      )}

      {/* Org-to-Sheets export wizard */}
      <OrgSheetsWizard
        open={orgSheetsOpen}
        onOpenChange={setOrgSheetsOpen}
        datasets={(datasets ?? []).map((d) => ({ id: d.id, name: d.name, recordCount: d.recordCount }))}
        organizationId={activeOrgId ?? ""}
      />

      {/* Assign / Change Schema dialog */}
      <AssignSchemaDialog
        dataset={assignSchemaTarget}
        open={!!assignSchemaTarget}
        onOpenChange={(open) => { if (!open) setAssignSchemaTarget(null); }}
      />
    </div>
  );
}


// ── Create dataset dialog (separate component for clarity) ───────────────

function CreateDatasetDialog({
  open,
  onClose,
  schemas,
}: {
  open: boolean;
  onClose: () => void;
  schemas: SchemaDTO[];
}) {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schemaId, setSchemaId] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string;
      schemaId?: string;
    }) => api.post<DatasetDTO>("/api/datasets", payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["datasets", activeOrgId] });
      const previousDatasets = queryClient.getQueryData(["datasets", activeOrgId]);
      queryClient.setQueryData(["datasets", activeOrgId], (old: any) => {
        const newDataset = { id: "temp-" + Date.now(), ...payload, isShared: false, recordCount: 0, createdAt: new Date().toISOString() };
        return [newDataset, ...(old || [])];
      });
      setName("");
      setDescription("");
      setSchemaId("");
      onClose();
      return { previousDatasets };
    },
    onSuccess: (d) => {
      toast.success("Dataset created", { description: d.name });
    },
    onError: (err: unknown, variables, context: any) => {
      queryClient.setQueryData(["datasets", activeOrgId], context?.previousDatasets);
      const msg = err instanceof Error ? err.message : "Failed to create dataset";
      toast.error("Create failed", { description: msg });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets", activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    createMutation.mutate({
      name: trimmed,
      description: description.trim() || undefined,
      schemaId: schemaId || undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create dataset</DialogTitle>
          <DialogDescription>
            A dataset is a collection of records extracted by your AI pipeline.
            You can assign a schema now or later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ds-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ds-name"
              placeholder="e.g. Internship Opportunities"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-desc">Description</Label>
            <Textarea
              id="ds-desc"
              placeholder="What does this dataset represent?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Schema</Label>
            <Select value={schemaId} onValueChange={setSchemaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a schema (optional)" />
              </SelectTrigger>
              <SelectContent>
                {schemas.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5" />
                    No schemas yet — create one in the Schema Builder.
                  </div>
                ) : (
                  schemas.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.fields.length} field(s)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The schema defines the columns and field types for records in
              this dataset.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-2 h-3.5 w-3.5" />
            )}
            Create dataset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
