"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type {
  DatasetDTO,
  DatasetRecordDTO,
  DatasetValueDTO,
  DatasetColumnDefDTO,
  RecordStatus,
  FieldType,
  SchemaDTO,
} from "@/lib/types";
import {
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { InlineEditCell } from "./dataset-inline-edit";
import { GoogleSheetsPanel } from "@/components/google-sheets/google-sheets-panel";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  SheetBody,
  SheetFooter,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  Trash2,
  Eye,
  ArrowLeft,
  Database,
  Mail,
  Clock,
  Cpu,
  FileText,
  Hash,
  Bookmark,
  Upload,
  Sparkles,
  Plus,
  Zap,
  AlertTriangle,
  FileSpreadsheet,
  MoreHorizontal,
  FileCode2,
  LayoutGrid,
  LayoutList,
  Undo,
  Redo,
  ArrowLeftToLine,
  ArrowRightToLine,
  Copy,
  ExternalLink,
  Bot,
} from "lucide-react";
import { NewShareRequestDialog } from "@/components/sharing/new-share-request-dialog";
import { AssignSchemaDialog } from "@/components/datasets/assign-schema-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

// URL detection helper
function isUrl(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Normalize escaped newline sequences in text (e.g. from JSON/API strings)
function normalizeNewlines(text: string): string {
  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
}

// ── LinkChip — an attractive clickable pill for URLs ─────────────────────

function LinkChip({ url, compact = false }: { url: string; compact?: boolean }) {
  let label = url;
  try {
    const parsed = new URL(url);
    label = parsed.hostname.replace(/^www\./, "");
  } catch {
    // keep raw url as label
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={url}
      className={`inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 
                  text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors 
                  font-medium truncate ${compact ? "px-2 py-0.5 text-xs max-w-[180px]" : "px-3 py-1 text-sm max-w-[260px]"}`}
    >
      <ExternalLink className={compact ? "h-2.5 w-2.5 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
      <span className="truncate">{label}</span>
    </a>
  );
}

// ── FormattedFieldValue — richly renders field values in the evidence drawer ─

function FormattedFieldValue({
  value,
  fieldType,
}: {
  value: unknown;
  fieldType: string;
}) {
  if (value == null || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }

  // Array / multiselect: render each item as a chip
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {value.map((item, i) => {
          const str = String(item);
          return (
            <span
              key={i}
              className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-sm text-foreground"
            >
              {str}
            </span>
          );
        })}
      </div>
    );
  }

  const text = String(value);

  // Single URL → link chip
  if (isUrl(text.trim())) {
    return <LinkChip url={text.trim()} />;
  }

  // Long text or text with newlines → preserve formatting
  const normalized = normalizeNewlines(text);
  if (normalized.includes("\n") || normalized.length > 200) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed break-words text-foreground">
        {normalized}
      </pre>
    );
  }

  return <span className="text-sm leading-relaxed break-words">{text}</span>;
}



export function DatasetDetailView() {
  const queryClient = useQueryClient();
  const datasetId = useAppStore((s) => s.selectedDatasetId);
  const setView = useAppStore((s) => s.setView);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | RecordStatus>(
    "all"
  );
  const [search, setSearch] = useState("");
  const [minConfidence, setMinConfidence] = useState([0]);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(
    null
  );
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [inlineEditCell, setInlineEditCell] = useState<{ recordId: string; fieldId: string } | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  type EditAction = {
    recordId: string;
    fieldId: string;
    valueId: string;
    oldVal: string;
    newVal: string;
  };
  const [undoStack, setUndoStack] = useState<EditAction[]>([]);
  const [redoStack, setRedoStack] = useState<EditAction[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });


  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCellClick = (recordId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    clickTimeoutRef.current = setTimeout(() => {
      setSelectedRecordId(recordId);
      clickTimeoutRef.current = null;
    }, 250);
  };

  const handleCellDoubleClick = (recordId: string, fieldId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (dataset?.accessLevel === "read" || dataset?.accessLevel === "comment") {
      toast.error("You do not have permission to edit this dataset.");
      return;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setInlineEditCell({ recordId, fieldId });
  };

  const [savedViews, setSavedViews] = useState<
    { id: string; name: string; statusFilter: string; search: string; hiddenFields: string[] }[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const key = `wip-saved-views-${datasetId}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [saveViewDialog, setSaveViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [importDialog, setImportDialog] = useState(false);
  const [importData, setImportData] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [extractDialog, setExtractDialog] = useState(false);
  const [extractSchemaId, setExtractSchemaId] = useState("");
  const [extractDatasetName, setExtractDatasetName] = useState("");
  const [sheetsPanelOpen, setSheetsPanelOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [assignSchemaOpen, setAssignSchemaOpen] = useState(false);

  // Inline Record Editing state
  const [editValue, setEditValue] = useState<DatasetValueDTO | null>(null);
  const [editNonce, setEditNonce] = useState(0);

  const handleEditClick = (v: DatasetValueDTO) => {
    setEditNonce((n) => n + 1);
    setEditValue(v);
  };


  // Persist saved views to localStorage whenever they change
  const persistSavedViews = (views: typeof savedViews) => {
    setSavedViews(views);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          `wip-saved-views-${datasetId}`,
          JSON.stringify(views)
        );
      } catch {
        // ignore
      }
    }
  };

  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    const view = {
      id: `view-${Date.now()}`,
      name: newViewName.trim(),
      statusFilter,
      search,
      hiddenFields: Array.from(hiddenFields),
    };
    persistSavedViews([...savedViews, view]);
    setNewViewName("");
    setSaveViewDialog(false);
    toast.success("View saved", { description: `"${view.name}" is now available in this dataset.` });
  };

  const applyView = (view: (typeof savedViews)[0]) => {
    setStatusFilter(view.statusFilter as "all" | RecordStatus);
    setSearch(view.search);
    setHiddenFields(new Set(view.hiddenFields));
    setPage(1);
    toast.info(`Applied view: ${view.name}`);
  };

  const deleteView = (id: string) => {
    persistSavedViews(savedViews.filter((v) => v.id !== id));
  };

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

  const cannotEdit = dataset?.accessLevel === "read" || dataset?.accessLevel === "comment";

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

  const createRecordMutation = useMutation({
    mutationFn: () => api.post<{id: string}>(`/api/datasets/${datasetId}/records`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-records", datasetId] });
      toast.success("Row added successfully");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to add row");
    }
  });

  // ── Schemas for AI extraction dialog ─────────────────────────────────
  const { data: schemas } = useQuery({
    queryKey: ["schemas"],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
    enabled: !!dataset?.isDefault,
  });

  // ── AI Extraction (Default Dataset → Custom Dataset) ─────────────────
  const extractMutation = useMutation({
    mutationFn: (vars: { schemaId: string; datasetName: string }) =>
      api.post<{ jobId: string; targetDatasetId: string }>(
        `/api/sources/${dataset?.sourceId}/extract`,
        { schemaId: vars.schemaId, datasetName: vars.datasetName }
      ),
    onSuccess: (res) => {
      toast.success("AI extraction queued", {
        description: `Job ${res.jobId.slice(0, 8)} created. Records will appear in the new dataset shortly.`,
      });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      queryClient.invalidateQueries({ queryKey: ["ai-jobs"] });
      setExtractDialog(false);
      setExtractSchemaId("");
      setExtractDatasetName("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      toast.error("Extraction failed", { description: msg });
    },
  });


  // ── Import mutation (CSV/JSON) ───────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: (vars: { format: "csv" | "json"; data: string }) =>
      api.post<{ imported: number }>(
        `/api/datasets/${datasetId}/import`,
        vars
      ),
    onSuccess: (res) => {
      toast.success("Import complete", {
        description: `${res.imported} record(s) imported successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["dataset-records", datasetId] });
      queryClient.invalidateQueries({ queryKey: ["dataset", datasetId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setImportDialog(false);
      setImportData("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to import";
      toast.error("Import failed", { description: msg });
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

  // ── Record deletion mutation (Bulk) ───────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (recordIds: string[]) =>
      api.delete<{ deleted: number }>(`/api/datasets/${datasetId}/records/bulk`, { recordIds }),
    onSuccess: (res) => {
      toast.success(`Deleted ${res.deleted} record(s)`);
      setSelectedRecords(new Set());
      queryClient.invalidateQueries({ queryKey: ["dataset-records", datasetId] });
      queryClient.invalidateQueries({ queryKey: ["dataset", datasetId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to delete records";
      toast.error("Delete failed", { description: msg });
    },
  });

  const applyEditMutation = useMutation({
    mutationFn: async (action: EditAction & { revertTo: string }) => {
      const field = dataset?.schema?.fields.find(f => f.id === action.fieldId);
      let parsedValue: any = action.revertTo;
      if (field?.type === "number") {
        parsedValue = parseFloat(action.revertTo) || 0;
      } else if (field?.type === "boolean") {
        parsedValue = action.revertTo.toLowerCase() === "true" || action.revertTo.toLowerCase() === "yes" || action.revertTo === "1";
      }

      return api.patch(`/api/datasets/${datasetId}/records/${action.recordId}/values/${action.valueId}`, {
        value: parsedValue,
        confidence: 1,
        evidence: "Undo/Redo operation",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-records", datasetId] });
      toast.success("Change applied");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to apply change");
    },
  });

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    setUndoStack(prev => {
      const newStack = [...prev];
      const action = newStack.pop()!;
      setRedoStack(r => [...r, action]);
      applyEditMutation.mutate({ ...action, revertTo: action.oldVal });
      return newStack;
    });
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    setRedoStack(prev => {
      const newStack = [...prev];
      const action = newStack.pop()!;
      setUndoStack(u => [...u, action]);
      applyEditMutation.mutate({ ...action, revertTo: action.newVal });
      return newStack;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, redoStack]);

  const createColumnMutation = useMutation({
    mutationFn: (vars: { name: string; type: string; position?: number }) =>
      api.post(`/api/datasets/${datasetId}/columns`, vars),
    onSuccess: () => {
      toast.success("Column created");
      queryClient.invalidateQueries({ queryKey: ["dataset", datasetId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to create column";
      toast.error("Create column failed", { description: msg });
    },
  });

  const deleteColumnMutation = useMutation({
    mutationFn: (columnId: string) =>
      api.delete(`/api/datasets/${datasetId}/columns/${columnId}`),
    onSuccess: () => {
      toast.success("Column deleted");
      queryClient.invalidateQueries({ queryKey: ["dataset", datasetId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to delete column";
      toast.error("Delete column failed", { description: msg });
    },
  });


  // ── Derived: visible fields ───────────────────────────────────────────
  // Use stable derived arrays as deps so the React Compiler can preserve memoization.
  const columnDefs = dataset?.columnDefs;
  const schemaFields = dataset?.schema?.fields;

  const allFields = useMemo(() => {
    // DatasetColumnDef is the authoritative source once seeded.
    if (columnDefs && columnDefs.length > 0) {
      const schemaFieldsMap = new Map(
        schemaFields?.map((f) => [f.id, f]) || []
      );
      return columnDefs
        .filter((c: any) => !c.isDeleted)
        .map((c) => {
          const sf = schemaFieldsMap.get(c.columnId);
          return {
            id: c.columnId,
            name: c.name,
            type: c.dataType as any,
            description: sf?.description ?? null,
            instructions: sf?.instructions ?? null,
            required: c.required,
            options: sf?.options ?? null,
            validation: sf?.validation ?? null,
            position: c.position,
            confidenceThreshold: sf?.confidenceThreshold ?? 0.7,
          };
        });
    }

    // Fallback if not seeded yet
    if (schemaFields && schemaFields.length > 0) {
      return schemaFields;
    }

    return [];
  }, [columnDefs, schemaFields]);

  const visibleFields = useMemo(
    () => allFields.filter((f) => !hiddenFields.has(f.id)),
    [allFields, hiddenFields]
  );

  const records = recordsPage?.data ?? [];
  const total = recordsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Derived: filtered records (client-side search & confidence filtering) ──
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minConf = minConfidence[0] / 100;
    
    return records.filter((r) => {
      // Filter by confidence
      if (r.confidence < minConf) return false;
      
      // Filter by search query
      if (!q) return true;
      return r.values.some((v) => {
        const txt = formatValueCompact(v.value, v.fieldType ?? "text").text;
        return txt.toLowerCase().includes(q);
      });
    });
  }, [records, search, minConfidence]);

  // ── Clipboard Copy (Ctrl+C / Cmd+C) ──────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        // Only if we have selections and focus is not inside an input
        if (selectedRecords.size === 0) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        e.preventDefault();

        // Build TSV format (Tab Separated Values) for easy pasting into Excel/Sheets
        const rows: string[] = [];

        // Header row
        if (visibleFields) {
          rows.push(["Record ID", ...visibleFields.map(f => f.name)].join("\t"));
        }

        // Selected records data
        if (filteredRecords && visibleFields) {
          const selectedList = filteredRecords.filter(r => selectedRecords.has(r.id));
          for (const r of selectedList) {
            const rowData: string[] = [r.id];
            for (const f of visibleFields) {
              const val = valueByFieldId(r, f.id);
              const text = val ? formatValueCompact(val.value, f.type).text || "" : "";
              // Basic escaping for tabs and newlines within cells
              const escaped = text.replace(/\t/g, " ").replace(/\n/g, " ");
              rowData.push(escaped);
            }
            rows.push(rowData.join("\t"));
          }
        }

        if (rows.length > 0) {
          const text = rows.join("\n");
          navigator.clipboard.writeText(text).then(() => {
            toast.success(`Copied ${selectedRecords.size} record(s) to clipboard`);
          }).catch(() => {
            toast.error("Failed to copy to clipboard");
          });
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedRecords, filteredRecords, visibleFields]);

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
      <div className="space-y-4">
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
      <div className="space-y-4">
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

  // ── No schema → soft banner (don't hard-block when imported columns exist) ─
  // Datasets imported from Google Sheets have DatasetColumnDef rows but the
  // schema link may not be set yet. We show a gentle banner instead of
  // redirecting the user to the Schema Builder every time.
  const noSchema = !dataset.schema;

  return (
    <div className="space-y-4">
      <DetailTopBar
        dataset={dataset}
        onBack={() => setView("datasets")}
        onRefresh={() => refetchRecords()}
        refreshing={recordsFetching}
        onExport={(f) => exportMutation.mutate({ format: f })}
        exporting={exportMutation.isPending}
        onShare={() => setShareOpen(true)}
        onAssignSchema={() => setAssignSchemaOpen(true)}
        cannotEdit={cannotEdit}
      />

      {/* Inline share dialog */}
      <NewShareRequestDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        dataset={dataset as any}
      />

      {/* Soft no-schema banner — doesn't block the grid */}
      {noSchema && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="text-amber-200">
            No schema assigned — showing imported columns. Records are visible but field types may be approximate.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0 border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
            onClick={() => setAssignSchemaOpen(true)}
          >
            Assign Schema
          </Button>
        </div>
      )}

      {/* Assign Schema Dialog */}
      <AssignSchemaDialog
        dataset={dataset}
        open={assignSchemaOpen}
        onOpenChange={setAssignSchemaOpen}
      />

      {/* Saved views bar */}
      {savedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">
            Saved views:
          </span>
          {savedViews.map((view) => (
            <div
              key={view.id}
              className="group flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs hover:bg-accent transition-colors"
            >
              <button
                onClick={() => applyView(view)}
                className="font-medium"
              >
                {view.name}
              </button>
              {view.statusFilter !== "all" && (
                <Badge variant="secondary" className="text-[9px] py-0 h-4">
                  {view.statusFilter}
                </Badge>
              )}
              <button
                onClick={() => deleteView(view.id)}
                className="ml-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                title="Delete view"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

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
            {/* Confidence filter moved into three-dot menu */}

            {/* Right-side toolbar: Connect Sheets | View Toggle | Column Toggle | Three-dot */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Connect Sheets */}
              {cannotEdit ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button variant="outline" size="sm" disabled className="opacity-50">
                          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                          Connect Sheets
                        </Button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>You must be an editor to connect sheets.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSheetsPanelOpen(true)}
                  title="Connect to Google Sheets"
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  Connect Sheets
                </Button>
              )}

              {/* AI Extract — primary action when available */}
              {dataset?.isDefault && dataset.sourceId && (
                cannotEdit ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button size="sm" className="gap-1.5 bg-transparent hover:bg-transparent bg-gradient-to-r from-cyan-600/10 to-blue-600/10 border border-blue-500/15 text-blue-700/50 dark:text-blue-300/50 backdrop-blur-xl shadow-sm" disabled>
                            <Bot className="h-3.5 w-3.5" />
                            Extract Custom Fields (AI)
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>You must be an editor to extract custom fields.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-transparent hover:bg-transparent bg-gradient-to-r from-cyan-600/15 to-blue-600/15 border border-blue-500/20 text-blue-700 dark:text-blue-300 backdrop-blur-xl hover:from-cyan-600/25 hover:to-blue-600/25 shadow-sm"
                    onClick={() => setExtractDialog(true)}
                    title="Run AI extraction from this Default Dataset into a new Custom Dataset"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Extract Custom Fields (AI)
                  </Button>
                )
              )}

              {/* List / Card view toggle */}
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="shrink-0">
                <TabsList className="h-8 p-1">
                  <TabsTrigger value="card" className="h-6 w-6 p-0" title="Card view">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </TabsTrigger>
                  <TabsTrigger value="list" className="h-6 w-6 p-0" title="List view (Spreadsheet)">
                    <LayoutList className="h-3.5 w-3.5" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Column visibility */}
              <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0 px-2" title="Show/Hide columns">
                  <Columns3 className="h-3.5 w-3.5" />
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

              {/* Three-dot overflow menu — Min Confidence, Save view, Add row, Import */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="More options">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Filter</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      const val = prompt(`Minimum confidence % (current: ${minConfidence[0]}%)`, String(minConfidence[0]));
                      if (val !== null && !isNaN(Number(val))) setMinConfidence([Math.max(0, Math.min(100, Number(val)))]);
                    }}
                  >
                    <Zap className="mr-2 h-4 w-4 text-amber-500" />
                    Min Confidence: {minConfidence[0]}%
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setSaveViewDialog(true)}>
                    <Bookmark className="mr-2 h-4 w-4" />
                    Save view
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => createRecordMutation.mutate()}
                    disabled={createRecordMutation.isPending || cannotEdit}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add row
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setImportDialog(true)}
                    disabled={cannotEdit}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import (CSV / JSON)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary Spreadsheet Toolbar */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-md border bg-card px-2 py-1.5 shadow-sm">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 rounded-sm text-muted-foreground" 
          disabled={undoStack.length === 0 || applyEditMutation.isPending} 
          title="Undo (Ctrl+Z)"
          onClick={handleUndo}
        >
          <Undo className="h-3.5 w-3.5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 rounded-sm text-muted-foreground" 
          disabled={redoStack.length === 0 || applyEditMutation.isPending} 
          title="Redo (Ctrl+Shift+Z)"
          onClick={handleRedo}
        >
          <Redo className="h-3.5 w-3.5" />
        </Button>
        
        <Separator orientation="vertical" className="mx-1 h-5" />
        
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => createRecordMutation.mutate()}
          disabled={createRecordMutation.isPending || cannotEdit}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Row
        </Button>
        
        <Separator orientation="vertical" className="mx-1 h-5" />
        
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            const name = prompt("Enter new column name:");
            if (!name) return;
            const targetField = inlineEditCell ? visibleFields.find(f => f.id === inlineEditCell.fieldId) : null;
            const position = targetField ? targetField.position : undefined;
            createColumnMutation.mutate({ name, type: "text", position });
          }}
          disabled={cannotEdit}
          title={inlineEditCell ? "Insert column to the left of the active cell" : "Insert column (select a cell first to insert left)"}
        >
          <ArrowLeftToLine className="mr-1.5 h-3.5 w-3.5" />
          Insert Col Left
        </Button>
        
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            const name = prompt("Enter new column name:");
            if (!name) return;
            const targetField = inlineEditCell ? visibleFields.find(f => f.id === inlineEditCell.fieldId) : null;
            const position = targetField ? targetField.position + 1 : undefined;
            createColumnMutation.mutate({ name, type: "text", position });
          }}
          disabled={cannotEdit}
          title={inlineEditCell ? "Insert column to the right of the active cell" : "Insert column at the end"}
        >
          <ArrowRightToLine className="mr-1.5 h-3.5 w-3.5" />
          Insert Col Right
        </Button>
      </div>

      {selectedRecords.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-md border border-primary/20 text-sm">
          <span className="font-medium text-primary">
            {selectedRecords.size} record{selectedRecords.size > 1 ? "s" : ""} selected
          </span>
          <Separator orientation="vertical" className="h-4 bg-primary/20" />
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 bg-background"
            disabled={statusMutation.isPending || cannotEdit}
            onClick={() => {
              const promises = [...selectedRecords].map(id => statusMutation.mutateAsync({ recordId: id, status: "approved" }).catch(() => {}));
              toast.promise(Promise.all(promises), {
                loading: "Approving records...",
                success: () => {
                  setSelectedRecords(new Set());
                  return `Approved ${selectedRecords.size} records`;
                },
                error: "Failed to approve some records"
              });
            }}
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
            Approve
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 bg-background"
            disabled={statusMutation.isPending || cannotEdit}
            onClick={() => {
              const promises = [...selectedRecords].map(id => statusMutation.mutateAsync({ recordId: id, status: "rejected" }).catch(() => {}));
              toast.promise(Promise.all(promises), {
                loading: "Rejecting records...",
                success: () => {
                  setSelectedRecords(new Set());
                  return `Rejected ${selectedRecords.size} records`;
                },
                error: "Failed to reject some records"
              });
            }}
          >
            <ThumbsDown className="mr-1.5 h-3.5 w-3.5 text-destructive" />
            Reject
          </Button>

          <Separator orientation="vertical" className="h-4 bg-primary/20 mx-1" />

          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20 hover:text-destructive"
            disabled={deleteMutation.isPending || cannotEdit}
            onClick={() => {
              setConfirmDialog({
                open: true,
                title: "Delete Records",
                description: `Are you sure you want to delete ${selectedRecords.size} records?`,
                onConfirm: () => {
                  deleteMutation.mutate(Array.from(selectedRecords));
                }
              });
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      )}

      {/* Airtable-style grid */}
      <Card className="overflow-hidden">
      {viewMode === "list" ? (
        <div className="overflow-x-auto">
          <Table 
            className="w-full"
            onCopy={(e) => {
              const selection = window.getSelection();
              if (!selection || selection.rangeCount === 0) return;
              
              const range = selection.getRangeAt(0);
              const container = document.createElement("div");
              container.appendChild(range.cloneContents());
              
              // Extract only valid table cells
              const rows = Array.from(container.querySelectorAll("tr"));
              if (rows.length === 0) return; // Not a table selection
              
              const tsv = rows.map(row => {
                const cells = Array.from(row.querySelectorAll("td, th"));
                return cells.map(cell => {
                  // For the record status cell or checkbox cell, we might want to skip or just grab text
                  // We'll just grab the innerText of the cell, which strips out HTML
                  let text = (cell.textContent || "").trim();
                  // Remove line breaks which would break TSV
                  text = text.replace(/[\r\n]+/g, " ");
                  return text;
                }).join("\t");
              }).join("\n");
              
              if (tsv) {
                e.clipboardData.setData("text/plain", tsv);
                e.preventDefault();
                toast.success("Copied cells to clipboard");
              }
            }}
          >
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60 sticky top-0 z-10">
                <TableHead className="w-12 border-r text-center">
                  <Checkbox 
                    checked={selectedRecords.size > 0 && selectedRecords.size === filteredRecords.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedRecords(new Set(filteredRecords.map((r) => r.id)));
                      } else {
                        setSelectedRecords(new Set());
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="w-[120px] min-w-[120px] border-r">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Record
                  </span>
                </TableHead>
                {visibleFields.map((f) => (
                  <TableHead
                    key={f.id}
                    className="min-w-[180px] border-r last:border-r-0 group/th px-1"
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="flex h-9 w-full items-center gap-1.5 cursor-pointer hover:bg-muted/60 px-2 rounded-md">
                          <FieldTypeBadge type={f.type} />
                          <span className="truncate text-sm font-medium flex-1 text-left">
                            {f.name}
                          </span>
                          {f.required && (
                            <span className="text-destructive shrink-0" title="Required">
                              *
                            </span>
                          )}
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/th:opacity-100 transition-opacity shrink-0" />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem 
                          disabled={cannotEdit}
                          onClick={() => {
                          const name = prompt("Enter new column name:");
                          if (name) createColumnMutation.mutate({ name, type: "text", position: f.position });
                        }}>
                          <Plus className="mr-2 h-4 w-4" /> Insert Left
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          disabled={cannotEdit}
                          onClick={() => {
                          const name = prompt("Enter new column name:");
                          if (name) createColumnMutation.mutate({ name, type: "text", position: f.position + 1 });
                        }}>
                          <Plus className="mr-2 h-4 w-4" /> Insert Right
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive" 
                          disabled={cannotEdit}
                          onClick={() => {
                            setConfirmDialog({
                              open: true,
                              title: "Delete Column",
                              description: `Delete column "${f.name}"? This cannot be undone.`,
                              onConfirm: () => {
                                deleteColumnMutation.mutate(f.id);
                              }
                            });
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Column
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordsLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleFields.length + 2}
                    className="h-24 text-center"
                  >
                    <LoadingState />
                  </TableCell>
                </TableRow>
              ) : recordsError ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleFields.length + 2}
                    className="py-6 text-center text-sm text-destructive"
                  >
                    Failed to load records.
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleFields.length + 2}
                    className="py-6"
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
                    onClick={(e) => handleCellClick(r.id, e)}
                  >
                    <TableCell className="border-r w-12 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox 
                        checked={selectedRecords.has(r.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedRecords);
                          if (checked) next.add(r.id);
                          else next.delete(r.id);
                          setSelectedRecords(next);
                        }}
                      />
                    </TableCell>
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
                      const isEditing = inlineEditCell?.recordId === r.id && inlineEditCell?.fieldId === f.id;
                      const cellIsUrl = isUrl(fmt.text);
                      return (
                        <TableCell
                          key={f.id}
                          className="border-r last:border-r-0 align-middle group/cell min-w-[150px] max-w-[300px] p-0"
                          onClick={(e) => handleCellClick(r.id, e)}
                          onDoubleClick={(e) => handleCellDoubleClick(r.id, f.id, e)}
                        >
                          {isEditing ? (
                            <InlineEditCell
                              datasetId={datasetId}
                              recordId={r.id}
                              fieldId={f.id}
                              valueId={v?.id}
                              initialValue={fmt.text}
                              fieldType={f.type}
                              onClose={() => setInlineEditCell(null)}
                              onSaveSuccess={(oldVal, newVal, valueId) => {
                                setUndoStack(prev => [...prev, { recordId: r.id, fieldId: f.id, valueId, oldVal, newVal }]);
                                setRedoStack([]); // clear redo stack on new edit
                              }}
                            />
                          ) : (
                            <div className="relative flex w-full h-12 items-center gap-2 cursor-pointer px-4">
                              {cellIsUrl ? (
                                <LinkChip url={fmt.text} compact />
                              ) : (
                                <TooltipProvider delayDuration={400}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className={`min-w-0 flex-1 truncate text-sm ${
                                          f.type === "number" ? "tabular-nums" : ""
                                        }`}
                                      >
                                        {fmt.node ?? (
                                          <span className={fmt.text ? "text-foreground" : "text-muted-foreground"}>
                                            {fmt.text || "—"}
                                          </span>
                                        )}
                                      </span>
                                    </TooltipTrigger>
                                    {fmt.text && (
                                      <TooltipContent className="max-w-[400px] break-words">
                                        {fmt.text}
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {v && (
                                <TooltipProvider delayDuration={400}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${confidenceColor(v.confidence)}`}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Confidence {Math.round(v.confidence * 100)}%
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {cellIsUrl && (
                                <button
                                  className="absolute top-1 right-1 opacity-0 group-hover/cell:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground bg-background/80"
                                  title="Copy link"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(fmt.text).then(() => {
                                      toast.success("Link copied to clipboard");
                                    }).catch(() => {
                                      toast.error("Failed to copy link");
                                    });
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}

                          </TableCell>
                        );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-4 bg-muted/10">
          {filteredRecords.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={<Database className="h-5 w-5" />}
                title={records.length === 0 ? "No records yet" : "No records match your filters"}
                description={records.length === 0 ? "Records will appear here once extracted." : "Try adjusting filters."}
              />
            </div>
          ) : (
            filteredRecords.map((r, idx) => (
              <Card
                key={r.id}
                className={`flex flex-col gap-3 p-4 transition-all hover:shadow-md cursor-pointer ${
                  selectedRecordId === r.id ? "border-primary ring-1 ring-primary shadow-sm" : ""
                }`}
                onClick={(e) => handleCellClick(r.id, e)}
              >
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedRecords.has(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedRecords);
                        if (checked) next.add(r.id);
                        else next.delete(r.id);
                        setSelectedRecords(next);
                      }}
                    />
                    <span className="text-xs font-mono text-muted-foreground">
                      #{(page - 1) * PAGE_SIZE + idx + 1}
                    </span>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex-1 space-y-2">
                  {visibleFields.slice(0, 6).map((f) => {
                    const v = valueByFieldId(r, f.id);
                    const fmt = v ? formatValueCompact(v.value, f.type) : { text: "" };
                    return (
                      <div key={f.id} className="grid grid-cols-[100px_1fr] items-start gap-2 text-sm">
                        <TooltipProvider delayDuration={400}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground truncate">{f.name}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {f.name}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate font-medium flex-1">
                            {fmt.text || "—"}
                          </span>
                          {v && (
                            <TooltipProvider delayDuration={400}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${confidenceColor(v.confidence)}`}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Confidence {Math.round(v.confidence * 100)}%
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {visibleFields.length > 6 && (
                    <div className="text-xs text-muted-foreground italic">
                      + {visibleFields.length - 6} more fields
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
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
        fields={visibleFields}
        onClose={() => setSelectedRecordId(null)}
        onEditClick={handleEditClick}
        onStatusChange={(status) => {
          if (selectedRecord) {
            statusMutation.mutate({ recordId: selectedRecord.id, status });
          }
        }}
        statusPending={statusMutation.isPending}
      />

      {/* Save view dialog */}
      <Dialog open={saveViewDialog} onOpenChange={setSaveViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>
              Capture the current filter and column visibility configuration
              for quick access later. Saved views are stored locally in your
              browser and are per-dataset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="view-name">View name</Label>
              <Input
                id="view-name"
                placeholder="e.g. Pending review, low confidence"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveView();
                }}
                autoFocus
              />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-medium">Current configuration:</p>
              <p>
                <span className="text-muted-foreground">Status filter:</span>{" "}
                {statusFilter === "all" ? "All statuses" : statusFilter}
              </p>
              <p>
                <span className="text-muted-foreground">Search:</span>{" "}
                {search || "(empty)"}
              </p>
              <p>
                <span className="text-muted-foreground">Hidden fields:</span>{" "}
                {hiddenFields.size === 0
                  ? "None (all visible)"
                  : `${hiddenFields.size} hidden`}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveViewDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={!newViewName.trim()}
            >
              <Bookmark className="mr-1.5 h-3.5 w-3.5" />
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              confirmDialog.onConfirm();
              setConfirmDialog(prev => ({ ...prev, open: false }));
            }}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import dialog */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk import records</DialogTitle>
            <DialogDescription>
              Paste CSV or JSON data to create records in bulk. Field names must
              match the schema field names (case-insensitive). All imported
              records are created with status "valid" and 100% confidence
              (human-verified import).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Button
                variant={importFormat === "csv" ? "default" : "outline"}
                size="sm"
                onClick={() => setImportFormat("csv")}
              >
                CSV format
              </Button>
              <Button
                variant={importFormat === "json" ? "default" : "outline"}
                size="sm"
                onClick={() => setImportFormat("json")}
              >
                JSON format
              </Button>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <p className="font-medium mb-1">Expected fields:</p>
              <p className="font-mono text-muted-foreground">
                {allFields.map((f) => f.name).join(", ")}
              </p>
            </div>
            <div>
              <Label htmlFor="import-data">
                {importFormat === "csv" ? "CSV data" : "JSON array"}
              </Label>
              <Textarea
                id="import-data"
                rows={8}
                placeholder={
                  importFormat === "csv"
                    ? `${allFields.map((f) => f.name).join(",")}\nvalue1,value2,...`
                    : JSON.stringify(
                        allFields.reduce(
                          (acc, f) => ({ ...acc, [f.name]: "..." }),
                          {}
                        ),
                        null,
                        2
                      )
                }
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                importMutation.mutate({ format: importFormat, data: importData })
              }
              disabled={!importData.trim() || importMutation.isPending}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {importMutation.isPending ? "Importing…" : `Import ${importFormat.toUpperCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Extraction Dialog */}
      {dataset?.isDefault && (
        <AiExtractDialog
          open={extractDialog}
          datasetName={dataset?.name ?? ""}
          schemas={schemas ?? []}
          schemaId={extractSchemaId}
          onSchemaChange={setExtractSchemaId}
          newDatasetName={extractDatasetName}
          onDatasetNameChange={setExtractDatasetName}
          onConfirm={() => {
            if (!extractSchemaId) {
              toast.error("Select a schema first");
              return;
            }
            extractMutation.mutate({
              schemaId: extractSchemaId,
              datasetName: extractDatasetName.trim() || undefined as unknown as string,
            });
          }}
          loading={extractMutation.isPending}
          onClose={() => setExtractDialog(false)}
        />
      )}
      {/* Edit value dialog (keyed by nonce so it remounts fresh each open) */}
      <EditValueDialog
        key={editNonce}
        open={!!editValue}
        value={editValue}
        datasetId={datasetId}
        recordId={editValue?.recordId ?? null}
        onClose={() => setEditValue(null)}
      />

      {/* Google Sheets Panel */}
      {dataset && (
        <GoogleSheetsPanel
          open={sheetsPanelOpen}
          onOpenChange={(open) => { if (!open) setSheetsPanelOpen(false); }}
          dataset={{
            id: dataset.id,
            name: dataset.name,
            recordCount: dataset.recordCount,
            sheetMappingId: (dataset as any).sheetMappingId ?? null,
            syncStatus: (dataset as any).syncStatus ?? null,
          }}
          appColumns={allFields.map((f) => ({
              columnId: f.id,
              name: f.name,
              dataType: f.type,
              required: f.required,
            }))
          }
          allDatasets={[{ id: dataset.id, name: dataset.name }]}
        />
      )}
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
  onShare,
  onAssignSchema,
  cannotEdit,
}: {
  dataset: DatasetDTO | null;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onExport: (format: "csv" | "json") => void;
  exporting: boolean;
  onShare?: () => void;
  onAssignSchema?: () => void;
  cannotEdit?: boolean;
}) {
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
        {cannotEdit ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button variant="outline" size="sm" disabled>
                    <Share2 className="mr-2 h-3.5 w-3.5" />
                    Share
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>You must be an editor to share this dataset.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onShare?.()}>
            <Share2 className="mr-2 h-3.5 w-3.5" />
            Share
          </Button>
        )}
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
        {/* Three-dot actions menu */}
        {!cannotEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onAssignSchema?.()}>
                <FileCode2 className="mr-2 h-4 w-4" />
                {dataset?.schema ? "Change Schema" : "Assign Schema"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ── Evidence drawer ──────────────────────────────────────────────────────

function EvidenceDrawer({
  open,
  record,
  fields,
  onClose,
  onStatusChange,
  statusPending,
  onEditClick,
}: {
  open: boolean;
  record: DatasetRecordDTO | null;
  fields: Array<{ id: string; name: string; dataType?: string; position?: number; [key: string]: unknown }>;
  onClose: () => void;
  onStatusChange: (status: RecordStatus) => void;
  statusPending: boolean;
  onEditClick: (v: DatasetValueDTO) => void;
}) {
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
              <SheetHeader className="border-b p-4">
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
                  {(record.sourceName || record.sourceSubject || record.sourceEmailId) && (
                    <span className="inline-flex items-center gap-1" title={record.sourceSubject || record.sourceName || record.sourceEmailId || undefined}>
                      <Mail className="h-3 w-3" />
                      <span className="font-medium truncate max-w-[200px]">
                        {record.sourceSubject || record.sourceName || (record.sourceEmailId ? record.sourceEmailId.slice(0, 8) + "…" : "")}
                      </span>
                    </span>
                  )}
                </div>
              </SheetHeader>

              <SheetBody className="space-y-4 px-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {fields.length} field{fields.length === 1 ? "" : "s"}
                </p>
                {fields.length === 0 ? (
                  <EmptyState
                    icon={<Database className="h-5 w-5" />}
                    title="No fields"
                    description="This dataset has no schema fields configured."
                  />
                ) : (
                  [...fields]
                    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                    .map((f) => {
                    const v = record.values.find((val) => val.fieldId === f.id);
                    const displayValue = v || {
                      id: `empty-${f.id}`,
                      fieldId: f.id,
                      fieldName: f.name,
                      fieldType: f.dataType,
                      value: null,
                      confidence: 0,
                      evidence: "",
                      modelUsed: "manual",
                      promptVersion: "manual",
                      extractedAt: new Date().toISOString(),
                    } as unknown as DatasetValueDTO;
                    
                    return (
                      <FieldValueCard
                        key={displayValue.id}
                        value={displayValue}
                        onEdit={() => onEditClick({ ...displayValue, recordId: record.id, id: v ? v.id : undefined } as any)}
                      />
                    );
                  })
                )}
              </SheetBody>

              {/* Action footer */}
              <SheetFooter className="flex-col items-start bg-muted/30">
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
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}



function FieldValueCard({
  value,
  onEdit,
}: {
  value: DatasetValueDTO;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      {/* Header row: field name + confidence badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {value.fieldType && <FieldTypeBadge type={value.fieldType} />}
          <span className="text-sm font-semibold">{value.fieldName ?? "Field"}</span>
        </div>
        <ConfidenceBadge value={value.confidence} />
      </div>

      {/* Rich-formatted value */}
      <div className="mt-3 min-h-[2rem] break-words">
        <FormattedFieldValue value={value.value} fieldType={value.fieldType ?? "text"} />
      </div>

      {/* Collapsible Extracted Details (evidence snippet + human-correction record) */}
      {(value.evidence || (value.originalValue != null && value.correctedAt)) && (
        <Collapsible className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="flex w-full items-center justify-between p-0 h-auto font-medium text-xs text-muted-foreground hover:bg-transparent hover:text-foreground">
              <span>Extracted Details</span>
              <ChevronDown className="h-3 w-3 transition-transform duration-200" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            {/* Evidence snippet */}
            {value.evidence && (
              <blockquote className="border-l-2 border-primary/40 bg-muted/30 py-2 pl-3 pr-2">
                <p className="font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  "{value.evidence}"
                </p>
              </blockquote>
            )}

            {/* Original AI value (shown when corrected by a human) */}
            {value.originalValue != null && value.correctedAt && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Original AI value (preserved)
                  </p>
                  {value.originalConfidence != null && (
                    <Badge variant="outline" className="text-[9px] tabular-nums">
                      {Math.round(value.originalConfidence * 100)}% confidence
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-amber-900 dark:text-amber-200 break-words">
                  {formatValueCompact(value.originalValue, value.fieldType ?? "text").text || "—"}
                </p>
                <p className="mt-1 text-[10px] text-amber-700/80 dark:text-amber-400/80">
                  Corrected {relativeTime(value.correctedAt)}
                  {value.correctedBy ? ` by ${value.correctedBy.slice(0, 8)}…` : ""}
                </p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

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
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
              {label}
            </p>
            <p className="inline-flex items-center gap-1 truncate font-mono text-xs text-foreground">
              {icon}
              <span className="truncate">{value}</span>
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[400px] break-words">
          {title ?? value}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
    }) => {
      if (value?.id && !String(value.id).startsWith("empty-")) {
        return api.patch<DatasetValueDTO>(
          `/api/datasets/${datasetId}/records/${recordId}/values/${value.id}`,
          payload
        );
      } else {
        return api.post<DatasetValueDTO>(
          `/api/datasets/${datasetId}/records/${recordId}/values`,
          { ...payload, fieldId: value?.fieldId }
        );
      }
    },
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

// ── AI Extract Dialog ───────────────────────────────────────────────────

function AiExtractDialog({
  open,
  datasetName,
  schemas,
  schemaId,
  onSchemaChange,
  newDatasetName,
  onDatasetNameChange,
  onConfirm,
  loading,
  onClose,
}: {
  open: boolean;
  datasetName: string;
  schemas: SchemaDTO[];
  schemaId: string;
  onSchemaChange: (v: string) => void;
  newDatasetName: string;
  onDatasetNameChange: (v: string) => void;
  onConfirm: () => void;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-500" />
            Extract Custom Fields
          </DialogTitle>
          <DialogDescription>
            Run an AI pipeline over the evidence in <strong>{datasetName}</strong> to extract specific fields defined in a schema.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="extract-schema">Target schema *</Label>
            <Select value={schemaId} onValueChange={onSchemaChange}>
              <SelectTrigger id="extract-schema">
                <SelectValue placeholder="Select a schema to extract" />
              </SelectTrigger>
              <SelectContent>
                {schemas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.fields.length} fields)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="extract-ds-name">New dataset name (optional)</Label>
            <Input
              id="extract-ds-name"
              placeholder="Leave blank to auto-generate"
              value={newDatasetName}
              onChange={(e) => onDatasetNameChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A new dataset will be created for the extracted records.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!schemaId || loading}>
            {loading ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-3.5 w-3.5" />
            )}
            Run Extraction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
