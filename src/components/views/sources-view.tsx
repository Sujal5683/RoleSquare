"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { SourceDTO, SourceRunDTO, SourceStatus } from "@/lib/types";
import {
  PageHeader,
  StatCard,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Inbox,
  Plus,
  Search,
  Mail,
  HardDrive,
  FileText,
  Table as TableIcon,
  FormInput,
  Play,
  Pause,
  Pencil,
  Trash2,
  MoreHorizontal,
  History,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Zap,
  X,
  Copy,
  Filter,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";

// ── Helpers ──────────────────────────────────────────────────────────────

const SOURCE_TYPE_ICON: Record<string, React.ReactNode> = {
  gmail: <Mail className="h-4 w-4" />,
  drive: <HardDrive className="h-4 w-4" />,
  docs: <FileText className="h-4 w-4" />,
  sheets: <TableIcon className="h-4 w-4" />,
  forms: <FormInput className="h-4 w-4" />,
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, HH:mm");
  } catch {
    return "—";
  }
}

import { useActiveOrg } from "@/hooks/use-active-org";

// ── Component ────────────────────────────────────────────────────────────

export function SourcesView() {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();
  const openSource = useAppStore((s) => s.openSource);
  const setView = useAppStore((s) => s.setView);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SourceStatus>("all");
  const [runsDialogSource, setRunsDialogSource] = useState<SourceDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SourceDTO | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showFilters, setShowFilters] = useState(false);
  const [schemaFilter, setSchemaFilter] = useState("all");
  const [datasetFilter, setDatasetFilter] = useState("all");
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [detailsSource, setDetailsSource] = useState<SourceDTO | null>(null);

  const { data: sources, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["sources", activeOrgId],
    queryFn: () => api.get<SourceDTO[]>("/api/sources"),
    enabled: !!activeOrgId,
    refetchInterval: 3000,
  });

  // Runs query — only enabled when a source is opened in the dialog
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["source-runs", runsDialogSource?.id],
    queryFn: () =>
      api.get<SourceRunDTO[]>(`/api/sources/${runsDialogSource!.id}/runs`),
    enabled: !!runsDialogSource,
    refetchInterval: 2000,
  });

  const scanMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<SourceRunDTO>(`/api/sources/${id}/scan`, { mode: "incremental" }),
    onSuccess: (_data, id) => {
      toast.success("Scan triggered", {
        description: `Incremental scan queued for source.`,
      });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["source-runs", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to trigger scan";
      toast.error("Scan failed", { description: msg });
    },
  });

  const pauseResumeMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SourceStatus }) =>
      api.patch<SourceDTO>(`/api/sources/${id}`, { status }),
    onSuccess: () => {
      toast.success("Source updated");
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update source";
      toast.error("Update failed", { description: msg });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sources/${id}`),
    onSuccess: () => {
      toast.success("Source deleted");
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to delete source";
      toast.error("Delete failed", { description: msg });
    },
  });

  // Bulk pause/resume — runs N mutations in parallel and waits for all
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: SourceStatus }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.patch(`/api/sources/${id}`, { status }))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;
      if (failed > 0 && succeeded === 0) {
        throw new Error(`All ${failed} updates failed`);
      }
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed > 0) {
        toast.warning("Bulk update partial", {
          description: `${succeeded} updated, ${failed} failed.`,
        });
      } else {
        toast.success(`${succeeded} sources updated`);
      }
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSelectedIds(new Set());
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Bulk update failed";
      toast.error("Bulk update failed", { description: msg });
    },
  });

  const bulkScanMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.post(`/api/sources/${id}/scan`, { mode: "incremental" }))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;
      if (succeeded === 0) throw new Error("All scans failed");
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed > 0) {
        toast.warning("Bulk scan partial", {
          description: `${succeeded} scans queued, ${failed} failed.`,
        });
      } else {
        toast.success(`${succeeded} scans queued`);
      }
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSelectedIds(new Set());
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Bulk scan failed";
      toast.error("Bulk scan failed", { description: msg });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.delete(`/api/sources/${id}`))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;
      if (succeeded === 0) throw new Error("All deletes failed");
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed > 0) {
        toast.warning("Bulk delete partial", {
          description: `${succeeded} deleted, ${failed} failed.`,
        });
      } else {
        toast.success(`${succeeded} sources deleted`);
      }
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSelectedIds(new Set());
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Bulk delete failed";
      toast.error("Bulk delete failed", { description: msg });
    },
  });

  // Selection helpers — defined after `filtered` to avoid referencing
  // a not-yet-initialized const inside the closure.
  // (toggleSelect is order-independent; toggleSelectAll needs filtered.)
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Filtered sources
  const filtered = useMemo(() => {
    if (!sources) return [];
    const q = search.trim().toLowerCase();
    return sources.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (schemaFilter !== "all" && s.schema?.name !== schemaFilter) return false;
      if (datasetFilter !== "all" && s.dataset?.name !== datasetFilter) return false;
      if (scheduleFilter !== "all" && s.scheduleMode !== scheduleFilter) return false;
      return true;
    });
  }, [sources, search, statusFilter, schemaFilter, datasetFilter, scheduleFilter]);

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((s) => s.id));
    });
  };

  // Stats
  const stats = useMemo(() => {
    const list = sources ?? [];
    return {
      total: list.length,
      active: list.filter((s) => s.status === "active").length,
      paused: list.filter((s) => s.status === "paused").length,
      needsAttention: list.filter(
        (s) => s.status === "error" || s.runState !== "idle"
      ).length,
    };
  }, [sources]);

  const handleNewSource = () => {
    openSource(null);
    setView("source-builder");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sources"
        description="Gmail, Drive, Docs, Sheets and Forms sources that feed your extraction pipeline."
        icon={<Inbox className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
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
            <Button size="sm" onClick={handleNewSource}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New source
            </Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Sources"
          value={stats.total}
          icon={<Inbox className="h-4 w-4" />}
          hint="Configured"
        />
        <StatCard
          label="Active"
          value={stats.active}
          icon={<CheckCircle2 className="h-4 w-4" />}
          hint="Running schedule"
        />
        <StatCard
          label="Paused"
          value={stats.paused}
          icon={<Pause className="h-4 w-4" />}
          hint="On hold"
        />
        <StatCard
          label="Needs Attention"
          value={stats.needsAttention}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="Error or running"
        />
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search sources by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Status
                </span>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as "all" | SourceStatus)}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="idle">Idle</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={showFilters ? "secondary" : "outline"}
                  size="icon"
                  onClick={() => setShowFilters(!showFilters)}
                  title="Toggle advanced filters"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Quick Filter Bar */}
            {showFilters && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Schema</span>
                  <Select value={schemaFilter} onValueChange={setSchemaFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Any schema" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any schema</SelectItem>
                      {Array.from(new Set(sources?.map(s => s.schema?.name).filter(Boolean))).map(name => (
                        <SelectItem key={name!} value={name!}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Dataset</span>
                  <Select value={datasetFilter} onValueChange={setDatasetFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Any dataset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any dataset</SelectItem>
                      {Array.from(new Set(sources?.map(s => s.dataset?.name).filter(Boolean))).map(name => (
                        <SelectItem key={name!} value={name!}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Schedule</span>
                  <Select value={scheduleFilter} onValueChange={setScheduleFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Any schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any schedule</SelectItem>
                      <SelectItem value="interval">Interval</SelectItem>
                      <SelectItem value="cron">Cron</SelectItem>
                      <SelectItem value="webhook">Webhook</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sources table */}
      <Card>
        <CardHeader >
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Sources
            <span className="text-xs font-normal text-muted-foreground">
              ({filtered.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <LoadingState rows={4} />
            </div>
          ) : isError ? (
            <div className="p-4">
              <ErrorState
                message="Failed to load sources"
                onRetry={() => refetch()}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title={
                  sources && sources.length > 0
                    ? "No sources match your filters"
                    : "No sources yet"
                }
                description={
                  sources && sources.length > 0
                    ? "Try adjusting your search or status filter."
                    : "Create your first source to start ingesting Gmail, Drive, Docs, Sheets or Forms content."
                }
                action={
                  <Button size="sm" onClick={handleNewSource}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    New source
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Bulk action bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {selectedIds.size} selected
                    </span>
                    <button
                      onClick={clearSelection}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedIds.size === 0) return;
                        bulkScanMutation.mutate(Array.from(selectedIds));
                      }}
                      disabled={bulkScanMutation.isPending}
                    >
                      <Play className="mr-1.5 h-3 w-3" />
                      Scan all
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        bulkUpdateMutation.mutate({
                          ids: Array.from(selectedIds),
                          status: "active",
                        })
                      }
                      disabled={bulkUpdateMutation.isPending}
                    >
                      <Play className="mr-1.5 h-3 w-3" />
                      Resume
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        bulkUpdateMutation.mutate({
                          ids: Array.from(selectedIds),
                          status: "paused",
                        })
                      }
                      disabled={bulkUpdateMutation.isPending}
                    >
                      <Pause className="mr-1.5 h-3 w-3" />
                      Pause
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete ${selectedIds.size} source(s)? This cannot be undone.`
                          )
                        ) {
                          bulkDeleteMutation.mutate(Array.from(selectedIds));
                        }
                      }}
                      disabled={bulkDeleteMutation.isPending}
                    >
                      <Trash2 className="mr-1.5 h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          filtered.length > 0 &&
                          selectedIds.size === filtered.length
                        }
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="min-w-[200px]">Name</TableHead>
                    <TableHead className="min-w-[160px]">Connection</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const isScanning = s.runState !== "idle";
                    const isSelected = selectedIds.has(s.id);
                    const connectionEmail = s.googleConnection?.googleEmail ?? null;
                    return (
                      <TableRow
                        key={s.id}
                        className={`hover:bg-muted/40 cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                        onClick={() => setDetailsSource(s)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(s.id)}
                            aria-label={`Select ${s.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary capitalize">
                              {SOURCE_TYPE_ICON[s.sourceType] ?? (
                                <Inbox className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 max-w-[250px] sm:max-w-xs md:max-w-sm lg:max-w-md">
                              <p
                                className="block text-left text-sm font-medium truncate"
                                title={s.name}
                              >
                                {s.name}
                              </p>
                              <p className="text-xs text-muted-foreground capitalize truncate">
                                {s.sourceType}
                                {s.schema ? ` · ${s.schema.name}` : ""}
                                {s.dataset ? ` · ${s.dataset.name}` : ""}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {connectionEmail ? (
                            <span
                              className="text-xs text-muted-foreground truncate block max-w-[160px]"
                              title={connectionEmail}
                            >
                              {connectionEmail}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setRunsDialogSource(s)}
                              title="View Runs"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => scanMutation.mutate(s.id)}
                              disabled={isScanning || scanMutation.isPending}
                            >
                              {isScanning ? (
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="mr-2 h-4 w-4" />
                              )}
                              {isScanning ? "Scanning…" : "Scan"}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => openSource(s.id, s.name)}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit Configuration
                                </DropdownMenuItem>
                                {s.status === "paused" ? (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      pauseResumeMutation.mutate({
                                        id: s.id,
                                        status: "active",
                                      });
                                    }}
                                  >
                                    <Play className="mr-2 h-4 w-4 text-green-600" />
                                    Resume
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      pauseResumeMutation.mutate({
                                        id: s.id,
                                        status: "paused",
                                      });
                                    }}
                                  >
                                    <Pause className="mr-2 h-4 w-4 text-orange-600" />
                                    Pause
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    const name = prompt("Clone source name:", `${s.name} (copy)`);
                                    if (name) {
                                      api.post(`/api/sources/${s.id}/clone`, { name })
                                        .then(() => {
                                          toast.success("Source cloned", {
                                            description: `Created ${name}`,
                                          });
                                          queryClient.invalidateQueries({ queryKey: ["sources"] });
                                          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                                        })
                                        .catch(() => toast.error("Clone failed"));
                                    }
                                  }}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  Clone
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget(s)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Sheet */}
      <Sheet open={!!detailsSource} onOpenChange={(open) => !open && setDetailsSource(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {detailsSource && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary capitalize">
                    {SOURCE_TYPE_ICON[detailsSource.sourceType] ?? <Inbox className="h-5 w-5" />}
                  </div>
                  <div>
                    <SheetTitle>{detailsSource.name}</SheetTitle>
                    <SheetDescription className="capitalize">
                      {detailsSource.sourceType} Source
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              
              <SheetBody>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-medium mb-3">Status & Run State</h4>
                    <div className="flex items-center gap-3 flex-wrap">
                      <StatusBadge status={detailsSource.status} />
                      <StatusBadge status={detailsSource.runState} />
                      {detailsSource.runState !== "idle" && (
                        <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Scanning in progress…
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-3">Configuration</h4>
                    <div className="space-y-3 text-sm">
                      {detailsSource.schema && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Schema</span>
                          <span className="font-medium">{detailsSource.schema.name}</span>
                        </div>
                      )}
                      {detailsSource.dataset && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Dataset</span>
                          <span className="font-medium">{detailsSource.dataset.name}</span>
                        </div>
                      )}
                      {detailsSource.googleConnection && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Connection</span>
                          <span className="font-medium truncate max-w-[200px]" title={detailsSource.googleConnection.googleEmail}>
                            {detailsSource.googleConnection.googleEmail}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-3">Schedule</h4>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Mode</span>
                        <span className="font-medium capitalize">{detailsSource.scheduleMode}</span>
                      </div>
                      {detailsSource.scheduleExpr && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Expression</span>
                          <span className="font-mono bg-muted px-1.5 rounded">{detailsSource.scheduleExpr}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Last Run</span>
                        <span>{formatDate(detailsSource.lastRunAt)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Next Run</span>
                        <span>{formatDate(detailsSource.nextRunAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </SheetBody>

              <SheetFooter>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => scanMutation.mutate(detailsSource.id)}
                  disabled={detailsSource.runState !== "idle" || scanMutation.isPending}
                >
                  {detailsSource.runState !== "idle" ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {detailsSource.runState !== "idle" ? "Scanning…" : "Scan Now"}
                </Button>
                <Button className="flex-1" onClick={() => {
                  openSource(detailsSource.id, detailsSource.name);
                  setDetailsSource(null);
                }}>
                  Edit Configuration
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Runs dialog */}
      <Dialog
        open={!!runsDialogSource}
        onOpenChange={(open) => {
          if (!open) setRunsDialogSource(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Run history — {runsDialogSource?.name}
            </DialogTitle>
            <DialogDescription>
              Recent scans for this source. Each run creates a GMAIL_SCAN job
              in the AI pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="p-0 flex-1 overflow-y-auto">
            {runsLoading ? (
              <LoadingState rows={3} />
            ) : !runs || runs.length === 0 ? (
              <EmptyState
                icon={<History className="h-5 w-5" />}
                title="No runs yet"
                description="Trigger a scan to see run history here."
              />
            ) : (
              <div className="space-y-2 p-6">
                {runs.slice(0, 20).map((run) => (
                  <div
                    key={run.id}
                    className="rounded-lg border p-3 hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={run.status} />
                        <span className="text-xs font-mono uppercase">
                          {run.mode}
                        </span>
                      </div>
                      <span
                        className="text-xs text-muted-foreground"
                        title={formatDate(run.startedAt)}
                      >
                        {relativeTime(run.startedAt)}
                      </span>
                    </div>
                    {run.status === "running" && (
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={run.progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {run.progress}%
                        </span>
                      </div>
                    )}
                    {run.errorMessage && (
                      <p className="mt-2 text-xs text-destructive">
                        {run.errorMessage}
                      </p>
                    )}
                    {run.stats && Object.keys(run.stats).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(run.stats).map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium"
                          >
                            {k.replace(/([A-Z])/g, " $1").toLowerCase()}:{` `}
                            <span className="ml-1 tabular-nums">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              and all of its rules and run history. This action cannot be
              undone.
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
              {deleteMutation.isPending ? "Deleting…" : "Delete source"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}
