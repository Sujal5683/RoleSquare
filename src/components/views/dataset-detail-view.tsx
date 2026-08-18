"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type {
  DatasetDTO,
  DatasetRecordDTO,
  DatasetValueDTO,
  RecordStatus,
  FieldType,
} from "@/lib/types";
import {
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import {
  StatusBadge,
  ConfidenceBadge,
  FieldTypeBadge,
} from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  FileDown,
  FileJson,
  Share2,
  Columns3,
  Check,
  X,
  Pencil,
  CheckCircle2,
  ThumbsDown,
  Eye,
  ArrowLeft,
  Database,
  Mail,
  Clock,
  Cpu,
  FileText,
  Hash,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: "all" | RecordStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "valid", label: "Valid" },
  { value: "needs_review", label: "Needs Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy HH:mm");
  } catch {
    return "—";
  }
}

function formatDateValue(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") {
    // Try to parse ISO date strings
    const d = parseISO(v);
    if (!Number.isNaN(d.getTime())) return format(d, "yyyy-MM-dd");
    return v;
  }
  if (typeof v === "number") return String(v);
  return String(v);
}

function formatValueCompact(
  v: unknown,
  type: FieldType
): { text: string; node?: React.ReactNode } {
  if (v == null || v === "") return { text: "" };
  switch (type) {
    case "boolean":
      return {
        text: v ? "Yes" : "No",
        node: v ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        ),
      };
    case "date":
      return { text: formatDateValue(v) };
    case "number":
      return { text: typeof v === "number" ? String(v) : String(v) };
    case "array":
    case "multiselect":
      if (Array.isArray(v)) {
        return { text: v.join(", ") };
      }
      return { text: String(v) };
    case "enum":
      return {
        text: String(v),
        node: (
          <Badge variant="secondary" className="font-normal">
            {String(v)}
          </Badge>
        ),
      };
    default:
      return { text: String(v) };
  }
}

function confidenceColor(c: number): string {
  const pct = Math.round(c * 100);
  if (pct >= 85) return "bg-emerald-500";
  if (pct >= 65) return "bg-amber-500";
  return "bg-red-500";
}

function valueByFieldId(
  record: DatasetRecordDTO,
  fieldId: string
): DatasetValueDTO | undefined {
  return record.values.find((v) => v.fieldId === fieldId);
}

// ── Component ────────────────────────────────────────────────────────────

export function DatasetDetailView() {
  const queryClient = useQueryClient();
  const datasetId = useAppStore((s) => s.selectedDatasetId);
  const setView = useAppStore((s) => s.setView);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | RecordStatus>(
    "all"
  );
  const [search, setSearch] = useState("");
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(
    null
  );

  // ── Dataset detail (for schema + record count) ────────────────────────
  const {
    data: dataset,
    isLoading: datasetLoading,
    isError: datasetError,
    refetch: refetchDataset,
  } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => api.get<DatasetDTO>(`/api/datasets/${datasetId}`),
    enabled: !!datasetId,
  });

  // ── Records (paginated) ───────────────────────────────────────────────
  const {
    data: recordsPage,
    isLoading: recordsLoading,
    isError: recordsError,
    refetch: refetchRecords,
    isFetching: recordsFetching,
  } = useQuery({
    queryKey: [
      "dataset-records",
      datasetId,
      page,
      statusFilter,
      // We don't include `search` because it's client-side on the current
      // page; but per the task we still list it to align cache shape.
      search,
    ],
    queryFn: () =>
      api.get<{
        data: DatasetRecordDTO[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/api/datasets/${datasetId}/records?page=${page}&pageSize=${PAGE_SIZE}` +
          (statusFilter !== "all" ? `&status=${statusFilter}` : "")
      ),
    enabled: !!datasetId,
  });

  // ── Export mutation ───────────────────────────────────────────────────
  const exportMutation = useMutation({
    mutationFn: ({ format }: { format: "csv" | "json" }) =>
      api.post<{ jobId: string; downloadUrl?: string; recordCount: number }>(
        `/api/datasets/${datasetId}/export`,
        { format }
      ),
    onSuccess: (res, vars) => {
      if (res.downloadUrl) {
        window.open(res.downloadUrl, "_blank");
        toast.success("Export ready", {
          description: `${vars.format.toUpperCase()} export of ${res.recordCount} record(s) opened in a new tab.`,
        });
      } else {
        toast.success("Export queued", { description: `Job ${res.jobId} created.` });
      }
      queryClient.invalidateQueries({ queryKey: ["ai-jobs"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to export";
      toast.error("Export failed", { description: msg });
    },
  });

  // ── Record status mutation (Approve / Reject / Mark for review) ───────
  const statusMutation = useMutation({
    mutationFn: ({
      recordId,
      status,
    }: {
      recordId: string;
      status: RecordStatus;
    }) =>
      api.patch<DatasetRecordDTO>(
        `/api/datasets/${datasetId}/records/${recordId}`,
        { status }
      ),
    onSuccess: (_data, vars) => {
      const verb =
        vars.status === "approved"
          ? "approved"
          : vars.status === "rejected"
            ? "rejected"
            : "marked for review";
      toast.success(`Record ${verb}`);
      queryClient.invalidateQueries({
        queryKey: ["dataset-records", datasetId],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update status";
      toast.error("Update failed", { description: msg });
    },
  });

  // ── Derived: visible fields ───────────────────────────────────────────
  const allFields = useMemo(() => dataset?.schema?.fields ?? [], [dataset]);
  const visibleFields = useMemo(
    () => allFields.filter((f) => !hiddenFields.has(f.id)),
    [allFields, hiddenFields]
  );

  const records = recordsPage?.data ?? [];
  const total = recordsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Derived: filtered records (client-side search across all field values) ──
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      r.values.some((v) => {
        const txt = formatValueCompact(v.value, v.fieldType ?? "text").text;
        return txt.toLowerCase().includes(q);
      })
    );
  }, [records, search]);

  // Selected record (latest from query data, so it updates after PATCH)
  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) ?? null,
    [records, selectedRecordId]
  );

  // ── No dataset selected (shouldn't happen but defensive) ──────────────
  if (!datasetId) {
    return (
      <EmptyState
        icon={<Database className="h-5 w-5" />}
        title="No dataset selected"
        description="Pick a dataset to explore its records."
        action={
          <Button size="sm" onClick={() => setView("datasets")}>
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            Back to datasets
          </Button>
        }
      />
    );
  }

  if (datasetLoading) {
    return (
      <div className="space-y-6">
        <DetailTopBar
          dataset={null}
          onBack={() => setView("datasets")}
          onRefresh={() => refetchDataset()}
          refreshing={false}
          onExport={(f) => exportMutation.mutate({ format: f })}
          exporting={exportMutation.isPending}
        />
        <LoadingState rows={5} />
      </div>
    );
  }

  if (datasetError || !dataset) {
    return (
      <div className="space-y-6">
        <DetailTopBar
          dataset={null}
          onBack={() => setView("datasets")}
          onRefresh={() => refetchDataset()}
          refreshing={false}
          onExport={(f) => exportMutation.mutate({ format: f })}
          exporting={exportMutation.isPending}
        />
        <ErrorState
          message="Failed to load dataset"
          onRetry={() => refetchDataset()}
        />
      </div>
    );
  }

  // ── No schema → empty state ───────────────────────────────────────────
  if (!dataset.schema) {
    return (
      <div className="space-y-6">
        <DetailTopBar
          dataset={dataset}
          onBack={() => setView("datasets")}
          onRefresh={() => refetchDataset()}
          refreshing={false}
          onExport={(f) => exportMutation.mutate({ format: f })}
          exporting={exportMutation.isPending}
        />
        <EmptyState
          icon={<Database className="h-5 w-5" />}
          title="No schema assigned"
          description="This dataset doesn't have a schema yet, so it has no columns. Assign a schema to start exploring records in the Airtable-style grid."
          action={
            <Button size="sm" onClick={() => setView("schema-builder")}>
              <Database className="mr-2 h-3.5 w-3.5" />
              Open Schema Builder
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailTopBar
        dataset={dataset}
        onBack={() => setView("datasets")}
        onRefresh={() => refetchRecords()}
        refreshing={recordsFetching}
        onExport={(f) => exportMutation.mutate({ format: f })}
        exporting={exportMutation.isPending}
      />

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              {/* Status filter */}
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as "all" | RecordStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search across all field values in this page…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Column visibility */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <Columns3 className="mr-2 h-3.5 w-3.5" />
                  Columns
                  <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Toggle columns
                </p>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {allFields.map((f) => {
                    const isVisible = !hiddenFields.has(f.id);
                    return (
                      <label
                        key={f.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={isVisible}
                          onCheckedChange={(checked) => {
                            setHiddenFields((prev) => {
                              const next = new Set(prev);
                              if (checked) next.delete(f.id);
                              else next.add(f.id);
                              return next;
                            });
                          }}
                        />
                        <span className="flex items-center gap-1.5 text-sm">
                          <FieldTypeBadge type={f.type} />
                          <span className="truncate">{f.name}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setHiddenFields(new Set())}
                  >
                    Show all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setHiddenFields(new Set(allFields.map((f) => f.id)))
                    }
                  >
                    Hide all
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Airtable-style grid */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60 sticky top-0 z-10">
                <TableHead className="w-[120px] min-w-[120px] border-r">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Record
                  </span>
                </TableHead>
                {visibleFields.map((f) => (
                  <TableHead
                    key={f.id}
                    className="min-w-[180px] border-r last:border-r-0"
                  >
                    <div className="flex items-center gap-1.5">
                      <FieldTypeBadge type={f.type} />
                      <span className="truncate text-sm font-medium">
                        {f.name}
                      </span>
                      {f.required && (
                        <span className="text-destructive" title="Required">
                          *
                        </span>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordsLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleFields.length + 1}
                    className="py-6"
                  >
                    <LoadingState rows={3} />
                  </TableCell>
                </TableRow>
              ) : recordsError ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleFields.length + 1}
                    className="py-6"
                  >
                    <ErrorState
                      message="Failed to load records"
                      onRetry={() => refetchRecords()}
                    />
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleFields.length + 1}
                    className="py-10"
                  >
                    <EmptyState
                      icon={<Database className="h-5 w-5" />}
                      title={
                        records.length === 0
                          ? "No records yet"
                          : "No records match your filters"
                      }
                      description={
                        records.length === 0
                          ? "Records will appear here once the AI pipeline extracts them from your sources."
                          : "Try adjusting the status filter or search query."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((r, idx) => (
                  <TableRow
                    key={r.id}
                    className={`h-12 cursor-pointer hover:bg-muted/40 ${idx % 2 === 1 ? "bg-muted/20" : ""} ${selectedRecordId === r.id ? "ring-1 ring-inset ring-primary" : ""}`}
                    onClick={() => setSelectedRecordId(r.id)}
                  >
                    {/* Record-status cell */}
                    <TableCell className="border-r align-middle">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </span>
                        <StatusBadge status={r.status} />
                      </div>
                    </TableCell>

                    {/* Field-value cells */}
                    {visibleFields.map((f) => {
                      const v = valueByFieldId(r, f.id);
                      const fmt = v
                        ? formatValueCompact(v.value, f.type)
                        : { text: "" };
                      return (
                        <TableCell
                          key={f.id}
                          className="border-r last:border-r-0 align-middle"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecordId(r.id);
                            }}
                            className="flex w-full items-center gap-2 text-left hover:underline-offset-2"
                          >
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${
                                f.type === "number"
                                  ? "tabular-nums"
                                  : ""
                              }`}
                              title={fmt.text}
                            >
                              {fmt.node ?? (
                                <span className="text-muted-foreground">
                                  {fmt.text || "—"}
                                </span>
                              )}
                            </span>
                            {v && (
                              <span
                                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${confidenceColor(v.confidence)}`}
                                title={`Confidence ${Math.round(v.confidence * 100)}%`}
                              />
                            )}
                          </button>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-muted-foreground tabular-nums">
          Showing {filteredRecords.length} of {records.length} on page {page} ·{" "}
          {total} total record(s) · {totalPages} page(s)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || recordsFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Prev
          </Button>
          <span className="px-2 text-xs tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || recordsFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Evidence drawer */}
      <EvidenceDrawer
        open={!!selectedRecord}
        record={selectedRecord}
        onClose={() => setSelectedRecordId(null)}
        onStatusChange={(status) => {
          if (selectedRecord) {
            statusMutation.mutate({ recordId: selectedRecord.id, status });
          }
        }}
        statusPending={statusMutation.isPending}
      />
    </div>
  );
}

// ── Top bar ──────────────────────────────────────────────────────────────

function DetailTopBar({
  dataset,
  onBack,
  onRefresh,
  refreshing,
  onExport,
  exporting,
}: {
  dataset: DatasetDTO | null;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onExport: (format: "csv" | "json") => void;
  exporting: boolean;
}) {
  const setView = useAppStore((s) => s.setView);
  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 h-8 w-8"
          onClick={onBack}
          aria-label="Back to datasets"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {dataset?.name ?? "Dataset"}
            </h1>
            {dataset?.schema && (
              <Badge variant="secondary" className="font-normal">
                {dataset.schema.name}
              </Badge>
            )}
            {dataset && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                <Hash className="mr-1 h-3 w-3" />
                {dataset.recordCount} record(s)
              </Badge>
            )}
          </div>
          {dataset?.description && (
            <p className="text-sm text-muted-foreground max-w-2xl">
              {dataset.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            toast.info("Open Sharing Center", {
              description: "Manage dataset sharing permissions and requests.",
            });
            setView("sharing");
          }}
        >
          <Share2 className="mr-2 h-3.5 w-3.5" />
          Share
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={exporting}>
              <FileDown className="mr-2 h-3.5 w-3.5" />
              Export
              <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onExport("csv")}>
              <FileDown className="mr-2 h-4 w-4" />
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("json")}>
              <FileJson className="mr-2 h-4 w-4" />
              Export JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── Evidence drawer ──────────────────────────────────────────────────────

function EvidenceDrawer({
  open,
  record,
  onClose,
  onStatusChange,
  statusPending,
}: {
  open: boolean;
  record: DatasetRecordDTO | null;
  onClose: () => void;
  onStatusChange: (status: RecordStatus) => void;
  statusPending: boolean;
}) {
  const [editValue, setEditValue] = useState<DatasetValueDTO | null>(null);
  const [editNonce, setEditNonce] = useState(0);

  const handleEditClick = (v: DatasetValueDTO) => {
    setEditNonce((n) => n + 1);
    setEditValue(v);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <SheetContent
          side="right"
          className="w-full flex-col gap-0 p-0 sm:max-w-xl md:max-w-2xl"
        >
          {record && (
            <>
              <SheetHeader className="border-b p-5">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-4 w-4 text-primary" />
                  Record evidence
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Evidence-backed details for record {record.id}
                </SheetDescription>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={record.status} />
                  <ConfidenceBadge value={record.confidence} />
                  <span
                    className="inline-flex items-center gap-1"
                    title={formatDateTime(record.createdAt)}
                  >
                    <Clock className="h-3 w-3" />
                    {relativeTime(record.createdAt)}
                  </span>
                  {record.sourceEmailId && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      <span className="font-mono">
                        {record.sourceEmailId.slice(0, 8)}…
                      </span>
                    </span>
                  )}
                </div>
              </SheetHeader>

              {/* Field values list */}
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {record.values.length} extracted field
                  {record.values.length === 1 ? "" : "s"}
                </p>
                {record.values.length === 0 ? (
                  <EmptyState
                    icon={<Database className="h-5 w-5" />}
                    title="No field values"
                    description="This record has no extracted values yet."
                  />
                ) : (
                  record.values.map((v) => (
                    <FieldValueCard
                      key={v.id}
                      value={v}
                      onEdit={() => handleEditClick(v)}
                    />
                  ))
                )}
              </div>

              {/* Action footer */}
              <div className="border-t bg-muted/30 p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Record actions
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => onStatusChange("approved")}
                    disabled={statusPending}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onStatusChange("rejected")}
                    disabled={statusPending}
                  >
                    <ThumbsDown className="mr-1.5 h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange("needs_review")}
                    disabled={statusPending}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Mark for review
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit value dialog (keyed by nonce so it remounts fresh each open) */}
      <EditValueDialog
        key={editNonce}
        open={!!editValue}
        value={editValue}
        datasetId={record?.datasetId ?? null}
        recordId={record?.id ?? null}
        onClose={() => setEditValue(null)}
      />
    </>
  );
}

// ── Field value card (inside drawer) ────────────────────────────────────

function FieldValueCard({
  value,
  onEdit,
}: {
  value: DatasetValueDTO;
  onEdit: () => void;
}) {
  const fmt = formatValueCompact(value.value, value.fieldType ?? "text");
  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {value.fieldType && <FieldTypeBadge type={value.fieldType} />}
          <span className="text-sm font-medium">{value.fieldName ?? "Field"}</span>
        </div>
        <ConfidenceBadge value={value.confidence} />
      </div>

      {/* Large value */}
      <div className="mt-3 min-h-[2rem] text-base font-medium leading-snug break-words">
        {fmt.node ?? (
          <span className={fmt.text ? "" : "text-muted-foreground"}>
            {fmt.text || "—"}
          </span>
        )}
      </div>

      {/* Evidence snippet */}
      {value.evidence && (
        <blockquote className="mt-3 border-l-2 border-primary/40 bg-muted/30 py-2 pl-3 pr-2">
          <p className="font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            “{value.evidence}”
          </p>
        </blockquote>
      )}

      {/* Meta row */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        {value.sourceFile && (
          <MetaItem
            icon={<FileText className="h-3 w-3" />}
            label="Source"
            value={value.sourceFile}
          />
        )}
        {value.pageNumber != null && (
          <MetaItem
            icon={<Hash className="h-3 w-3" />}
            label="Page"
            value={String(value.pageNumber)}
          />
        )}
        <MetaItem
          icon={<Cpu className="h-3 w-3" />}
          label="Model"
          value={value.modelUsed}
        />
        <MetaItem
          icon={<FileText className="h-3 w-3" />}
          label="Prompt"
          value={value.promptVersion}
        />
        <MetaItem
          icon={<Clock className="h-3 w-3" />}
          label="Extracted"
          value={relativeTime(value.extractedAt)}
          title={formatDateTime(value.extractedAt)}
        />
      </div>

      {/* Edit action */}
      <div className="mt-3 border-t pt-3">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3 w-3" />
          Edit value
        </Button>
      </div>
    </div>
  );
}

function MetaItem({
  icon,
  label,
  value,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title ?? value}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </p>
      <p className="inline-flex items-center gap-1 truncate font-mono text-xs text-foreground">
        {icon}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

// ── Edit value dialog (separate, keyed component) ────────────────────────

function EditValueDialog({
  open,
  value,
  datasetId,
  recordId,
  onClose,
}: {
  open: boolean;
  value: DatasetValueDTO | null;
  datasetId: string | null;
  recordId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  // Initialize once on mount (this component is keyed by a nonce in the
  // parent so it remounts with a fresh draft each open).
  const [valueText, setValueText] = useState<string>(
    value ? serializeForEdit(value.value, value.fieldType ?? "text") : ""
  );
  const [confidence, setConfidence] = useState<number>(
    value ? Math.round(value.confidence * 100) : 100
  );
  const [evidence, setEvidence] = useState<string>(value?.evidence ?? "");

  const updateMutation = useMutation({
    mutationFn: (payload: {
      value: unknown;
      confidence: number;
      evidence: string;
    }) =>
      api.patch<DatasetValueDTO>(
        `/api/datasets/${datasetId}/records/${recordId}/values/${value?.id}`,
        payload
      ),
    onSuccess: () => {
      toast.success("Value updated", {
        description: "Human correction recorded in the audit log.",
      });
      queryClient.invalidateQueries({
        queryKey: ["dataset-records", datasetId],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update value";
      toast.error("Update failed", { description: msg });
    },
  });

  const handleSubmit = () => {
    if (!value || !datasetId || !recordId) return;
    const parsed = parseForEdit(valueText, value.fieldType ?? "text");
    updateMutation.mutate({
      value: parsed,
      confidence: confidence / 100,
      evidence: evidence.trim(),
    });
  };

  if (!value) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit value — {value.fieldName ?? "Field"}
          </DialogTitle>
          <DialogDescription>
            Human corrections are audit-logged and bumped to 100% confidence
            unless you override the slider below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ev-value">Value</Label>
            <Textarea
              id="ev-value"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              rows={3}
              className="font-mono text-sm"
              placeholder="Enter the corrected value (use comma-separated values for array/multiselect fields)…"
            />
            <p className="text-xs text-muted-foreground">
              Type: <FieldTypeBadge type={value.fieldType ?? "text"} />
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="ev-confidence">Confidence</Label>
              <span className="text-sm font-medium tabular-nums">
                {confidence}%
              </span>
            </div>
            <Slider
              id="ev-confidence"
              value={[confidence]}
              onValueChange={(vals) => setConfidence(vals[0] ?? 100)}
              min={0}
              max={100}
              step={5}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-evidence">Evidence</Label>
            <Textarea
              id="ev-evidence"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={3}
              placeholder="Quoted snippet from the source supporting this value…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
            )}
            Save correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit helpers ─────────────────────────────────────────────────────────

function serializeForEdit(v: unknown, type: FieldType): string {
  if (v == null) return "";
  if (type === "array" || type === "multiselect") {
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function parseForEdit(raw: string, type: FieldType): unknown {
  const trimmed = raw.trim();
  if (type === "array" || type === "multiselect") {
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (type === "number") {
    const n = Number(trimmed);
    return Number.isNaN(n) ? trimmed : n;
  }
  if (type === "boolean") {
    return /^(true|yes|1|y)$/i.test(trimmed);
  }
  return trimmed;
}
