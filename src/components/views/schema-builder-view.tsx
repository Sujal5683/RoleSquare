"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type {
  SchemaDTO,
  SchemaFieldDTO,
  FieldType,
  ExtractionResult,
} from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { FieldTypeBadge, ConfidenceBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenuSeparator,
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  FileJson,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Play,
  RefreshCw,
  Sparkles,
  Wand2,
  AlertCircle,
  ChevronLeft,
  FileText,
  Copy,
  Download,
  Upload,
  MoreHorizontal,
  Settings2,
  Eye,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Boolean" },
  { value: "enum", label: "Enum" },
  { value: "array", label: "Array" },
  { value: "multiselect", label: "Multiselect" },
];

const OPTIONS_FIELD_TYPES: FieldType[] = ["enum", "multiselect"];

interface FieldDraft {
  id?: string;
  name: string;
  type: FieldType;
  description: string;
  instructions: string;
  required: boolean;
  options: string[];
  validation: { min?: number; max?: number; regex?: string };
  confidenceThreshold: number;
}

const EMPTY_FIELD: FieldDraft = {
  name: "",
  type: "text",
  description: "",
  instructions: "",
  required: false,
  options: [],
  validation: {},
  confidenceThreshold: 0.7,
};

const PREBUILT_TEMPLATES = [
  {
    name: "Invoice / Receipt",
    description: "Standard financial document extraction",
    fields: [
      { name: "vendorName", type: "text", description: "Name of the merchant or vendor", required: true },
      { name: "totalAmount", type: "number", description: "Total amount paid including tax", required: true },
      { name: "date", type: "date", description: "Date of the transaction", required: true },
      { name: "currency", type: "enum", description: "Currency of the transaction", required: false, options: ["USD", "EUR", "GBP", "INR", "CAD", "AUD"] },
      { name: "taxAmount", type: "number", description: "Tax amount paid", required: false },
      { name: "invoiceNumber", type: "text", description: "Invoice or receipt reference number", required: false },
      { name: "paymentMethod", type: "enum", description: "Method of payment used", required: false, options: ["Credit Card", "Bank Transfer", "Cash", "Check", "PayPal", "Other"] },
    ]
  },
  {
    name: "Job Applicant (Resume)",
    description: "Extract candidate details from resumes or emails",
    fields: [
      { name: "candidateName", type: "text", description: "Full name of the candidate", required: true },
      { name: "email", type: "text", description: "Candidate email address", required: true },
      { name: "phone", type: "text", description: "Candidate phone number", required: false },
      { name: "currentRole", type: "text", description: "Current or most recent job title", required: false },
      { name: "yearsOfExperience", type: "number", description: "Total years of professional experience", required: false },
      { name: "skills", type: "array", description: "List of technical or professional skills", required: false },
      { name: "educationLevel", type: "enum", description: "Highest education level attained", required: false, options: ["High School", "Associate", "Bachelor's", "Master's", "PhD", "Other"] },
    ]
  },
  {
    name: "Contract / Agreement",
    description: "Extract key terms from contracts and legal agreements",
    fields: [
      { name: "contractTitle", type: "text", description: "Title or name of the contract", required: true },
      { name: "partyA", type: "text", description: "First party (company or person) in the agreement", required: true },
      { name: "partyB", type: "text", description: "Second party (company or person) in the agreement", required: true },
      { name: "effectiveDate", type: "date", description: "Date the contract takes effect", required: true },
      { name: "expirationDate", type: "date", description: "Date the contract expires or terminates", required: false },
      { name: "contractValue", type: "number", description: "Total monetary value of the contract", required: false },
      { name: "contractType", type: "enum", description: "Type of contract", required: false, options: ["Service Agreement", "NDA", "Employment", "Vendor", "Partnership", "License", "Other"] },
      { name: "paymentTerms", type: "text", description: "Payment schedule and terms", required: false },
    ]
  },
  {
    name: "Medical / Health Record",
    description: "Extract clinical information from medical documents",
    fields: [
      { name: "patientName", type: "text", description: "Full name of the patient", required: true },
      { name: "dateOfBirth", type: "date", description: "Patient date of birth", required: false },
      { name: "diagnosis", type: "text", description: "Primary diagnosis or condition", required: true },
      { name: "medication", type: "array", description: "List of prescribed medications", required: false },
      { name: "visitDate", type: "date", description: "Date of the medical visit", required: true },
      { name: "doctorName", type: "text", description: "Name of the attending physician", required: false },
      { name: "notes", type: "text", description: "Clinical notes or observations", required: false },
    ]
  },
  {
    name: "Real Estate Listing",
    description: "Extract property details from listings or emails",
    fields: [
      { name: "propertyAddress", type: "text", description: "Full address of the property", required: true },
      { name: "listingPrice", type: "number", description: "Asking or listing price in local currency", required: true },
      { name: "propertyType", type: "enum", description: "Type of property", required: false, options: ["House", "Apartment", "Condo", "Townhouse", "Land", "Commercial", "Other"] },
      { name: "bedrooms", type: "number", description: "Number of bedrooms", required: false },
      { name: "bathrooms", type: "number", description: "Number of bathrooms", required: false },
      { name: "squareFootage", type: "number", description: "Total area in square feet", required: false },
      { name: "listingDate", type: "date", description: "Date the property was listed", required: false },
      { name: "agentName", type: "text", description: "Name of the listing agent", required: false },
    ]
  },
  {
    name: "Sales Lead / Email",
    description: "Extract lead information from sales emails and inquiries",
    fields: [
      { name: "contactName", type: "text", description: "Full name of the contact", required: true },
      { name: "email", type: "text", description: "Contact email address", required: true },
      { name: "company", type: "text", description: "Company or organization name", required: false },
      { name: "jobTitle", type: "text", description: "Job title or role of the contact", required: false },
      { name: "productInterest", type: "text", description: "Product or service the lead is interested in", required: false },
      { name: "budget", type: "number", description: "Estimated budget or deal size", required: false },
      { name: "urgency", type: "enum", description: "Timeline urgency of the lead", required: false, options: ["Immediate", "Within 1 month", "1-3 months", "3-6 months", "No timeline"] },
      { name: "source", type: "enum", description: "Source of the lead", required: false, options: ["Email", "Webinar", "Referral", "Marketing", "Cold Outreach", "Other"] },
    ]
  },
  {
    name: "Shipping / Logistics",
    description: "Extract shipment and delivery details",
    fields: [
      { name: "trackingNumber", type: "text", description: "Shipment tracking number", required: true },
      { name: "carrier", type: "enum", description: "Shipping carrier", required: false, options: ["UPS", "FedEx", "DHL", "USPS", "Amazon", "Other"] },
      { name: "senderName", type: "text", description: "Name of the sender", required: false },
      { name: "recipientName", type: "text", description: "Name of the recipient", required: true },
      { name: "deliveryAddress", type: "text", description: "Delivery address", required: true },
      { name: "shipDate", type: "date", description: "Date the package was shipped", required: false },
      { name: "estimatedDelivery", type: "date", description: "Estimated delivery date", required: false },
      { name: "weight", type: "number", description: "Package weight in kilograms", required: false },
    ]
  },
  {
    name: "Product Review",
    description: "Extract structured data from product reviews",
    fields: [
      { name: "productName", type: "text", description: "Name of the product being reviewed", required: true },
      { name: "reviewerName", type: "text", description: "Name or username of the reviewer", required: false },
      { name: "rating", type: "number", description: "Numeric rating given (e.g. 1-5)", required: true },
      { name: "reviewDate", type: "date", description: "Date the review was written", required: false },
      { name: "pros", type: "array", description: "List of positive points mentioned", required: false },
      { name: "cons", type: "array", description: "List of negative points or complaints", required: false },
      { name: "sentiment", type: "enum", description: "Overall sentiment of the review", required: false, options: ["Positive", "Neutral", "Negative", "Mixed"] },
      { name: "verifiedPurchase", type: "boolean", description: "Whether this is a verified purchase review", required: false },
    ]
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function buildPrompt(schema: SchemaDTO | null | undefined): string {
  if (!schema) return "";
  const lines: string[] = [];
  lines.push(
    "Extract the following fields from the source content. For each field, provide value, confidence (0-1), and evidence quoting the source text."
  );
  if (schema.promptTemplate) {
    lines.push("");
    lines.push(`Custom instructions: ${schema.promptTemplate}`);
  }
  lines.push("");
  lines.push("Fields:");
  if (schema.fields.length === 0) {
    lines.push("  (no fields defined)");
  } else {
    schema.fields.forEach((f, i) => {
      lines.push(
        `  ${i + 1}. ${f.name} (${f.type})${f.required ? " [required]" : ""}`
      );
      if (f.description) lines.push(`     description: ${f.description}`);
      if (f.instructions) lines.push(`     instructions: ${f.instructions}`);
      if (f.options && f.options.length > 0) {
        lines.push(`     allowed values: ${f.options.join(", ")}`);
      }
    });
  }
  lines.push("");
  lines.push(
    "Return strict JSON: { fields: [{ name, value, confidence, evidence }] }"
  );
  return lines.join("\n");
}

import { useActiveOrg } from "@/hooks/use-active-org";

interface SortableFieldItemProps {
  field: SchemaFieldDTO;
  onEdit: (f: SchemaFieldDTO) => void;
  onDelete: (f: SchemaFieldDTO) => void;
}

function SortableFieldItem({ field, onEdit, onDelete }: SortableFieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 px-4 py-3 bg-card hover:bg-muted/40 relative ${
        isDragging ? "shadow-md rounded-md ring-1 ring-border" : ""
      }`}
    >
      <button
        type="button"
        className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing flex items-center justify-center rounded transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{field.name}</span>
          <FieldTypeBadge type={field.type} />
          {field.required && (
            <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              required
            </span>
          )}
          {field.options && field.options.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {field.options.length} options
            </span>
          )}
          {(field as any).validation && Object.keys((field as any).validation).length > 0 && (
            <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {Object.entries((field as any).validation)
                .map(([k, v]) => `${k}:${v}`)
                .join(" ")}
            </span>
          )}
        </div>
        {field.description && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {field.description}
          </p>
        )}
        {field.instructions && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/80 italic truncate">
            {field.instructions}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(field)}
          aria-label="Edit field"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(field)}
          aria-label="Delete field"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export function SchemaBuilderView() {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();
  const selectedSchemaId = useAppStore((s) => s.selectedSchemaId);
  const openSchema = useAppStore((s) => s.openSchema);
  const setView = useAppStore((s) => s.setView);

  const [activeSchemaId, setActiveSchemaId] = useState<string | null>(
    selectedSchemaId
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [viewTemplate, setViewTemplate] = useState<typeof PREBUILT_TEMPLATES[0] | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [fieldDialog, setFieldDialog] = useState<{
    open: boolean;
    field: FieldDraft | null;
  }>({ open: false, field: null });
  const [fieldDialogNonce, setFieldDialogNonce] = useState(0);
  const [deleteFieldTarget, setDeleteFieldTarget] =
    useState<SchemaFieldDTO | null>(null);
  const [sampleText, setSampleText] = useState(
    "From: recruiter@techcorp.com\nSubject: Software Engineer Internship - Summer 2025\n\nHi,\n\nTechCorp is hiring Software Engineer interns for Summer 2025. Location: San Francisco (remote-friendly). CTC: 25 LPA. Eligibility: CS/IT students with 7.5+ CGPA. Apply by March 15, 2025."
  );
  const [testResult, setTestResult] = useState<ExtractionResult | null>(null);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: schemas, isLoading: listLoading } = useQuery({
    queryKey: ["schemas", activeOrgId],
    queryFn: () => api.get<SchemaDTO[]>("/api/schemas"),
    enabled: !!activeOrgId,
  });

  const { data: activeSchema, isLoading: schemaLoading } = useQuery({
    queryKey: ["schema", activeSchemaId],
    queryFn: () => api.get<SchemaDTO>(`/api/schemas/${activeSchemaId}`),
    enabled: !!activeSchemaId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const createSchemaMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      api.post<SchemaDTO>("/api/schemas", payload),
    onSuccess: (schema) => {
      toast.success("Schema created", {
        description: schema.name,
      });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      // Navigate to the new schema via the store so other views stay in sync.
      openSchema(schema.id, schema.name);
      setActiveSchemaId(schema.id);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to create schema";
      toast.error("Create failed", { description: msg });
    },
  });

  const deleteSchemaMutation = useMutation({
    mutationFn: () => api.delete(`/api/schemas/${activeSchemaId}`),
    onSuccess: () => {
      toast.success("Schema deleted");
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setDeleteOpen(false);
      setActiveSchemaId(null);
      openSchema(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to delete schema";
      toast.error("Delete failed", { description: msg });
    },
  });

  const updateSchemaMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.patch<SchemaDTO>(`/api/schemas/${activeSchemaId}`, payload),
    onSuccess: () => {
      toast.success("Schema updated");
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update schema";
      toast.error("Update failed", { description: msg });
    },
  });

  const createFieldMutation = useMutation({
    mutationFn: (payload: unknown) =>
      api.post<SchemaFieldDTO>(`/api/schemas/${activeSchemaId}/fields`, payload),
    onSuccess: () => {
      toast.success("Field added");
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setFieldDialog({ open: false, field: null });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to add field";
      toast.error("Add field failed", { description: msg });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({
      fieldId,
      payload,
    }: {
      fieldId: string;
      payload: unknown;
    }) =>
      api.patch<SchemaFieldDTO>(
        `/api/schemas/${activeSchemaId}/fields/${fieldId}`,
        payload
      ),
    onSuccess: () => {
      toast.success("Field updated");
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setFieldDialog({ open: false, field: null });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update field";
      toast.error("Update field failed", { description: msg });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) =>
      api.delete(`/api/schemas/${activeSchemaId}/fields/${fieldId}`),
    onSuccess: () => {
      toast.success("Field deleted");
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
      setDeleteFieldTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to delete field";
      toast.error("Delete field failed", { description: msg });
    },
  });

  const testExtractionMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<ExtractionResult>(
        `/api/schemas/${activeSchemaId}/test-extraction`,
        { sampleText: text }
      ),
    onSuccess: (result) => {
      setTestResult(result);
      toast.success("Extraction complete", {
        description: `${result.fields.length} fields · ${Math.round(
          result.overallConfidence * 100
        )}% avg confidence · ${result.tokensUsed} tokens`,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      toast.error("Extraction failed", { description: msg });
    },
  });

  const reorderFieldsMutation = useMutation({
    mutationFn: (orderedFieldIds: string[]) =>
      api.patch(`/api/schemas/${activeSchemaId}/fields/reorder`, { orderedFieldIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
      queryClient.invalidateQueries({ queryKey: ["schemas"] });
    },
    onError: (err: unknown) => {
      toast.error("Failed to reorder fields");
      queryClient.invalidateQueries({ queryKey: ["schema", activeSchemaId] });
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id && activeSchema) {
      const oldIndex = activeSchema.fields.findIndex(f => f.id === active.id);
      const newIndex = activeSchema.fields.findIndex(f => f.id === over?.id);
      
      const newFields = arrayMove(activeSchema.fields, oldIndex, newIndex);
      
      // Optimistic update
      queryClient.setQueryData(["schema", activeSchemaId], {
        ...activeSchema,
        fields: newFields
      });

      reorderFieldsMutation.mutate(newFields.map(f => f.id));
    }
  };

  // If no active schema and we have schemas available, default to the first one
  // (React-recommended render-time state adjustment — avoids setState-in-effect).
  if (activeSchemaId === null && schemas && schemas.length > 0) {
    setActiveSchemaId(schemas[0].id);
  }

  // Clear test result when switching schemas (render-time adjustment).
  const [prevSchemaId, setPrevSchemaId] = useState<string | null | undefined>(
    activeSchemaId
  );
  if (activeSchemaId !== prevSchemaId) {
    setPrevSchemaId(activeSchemaId);
    setTestResult(null);
  }

  const prompt = useMemo(() => buildPrompt(activeSchema), [activeSchema]);

  const handleOpenFieldEditor = (field?: SchemaFieldDTO) => {
    setFieldDialogNonce((n) => n + 1);
    if (field) {
      setFieldDialog({
        open: true,
        field: {
          id: field.id,
          name: field.name,
          type: field.type,
          description: field.description ?? "",
          instructions: field.instructions ?? "",
          required: field.required,
          options: field.options ?? [],
          validation: (field as any).validation ?? {},
          confidenceThreshold: field.confidenceThreshold ?? 0.7,
        },
      });
    } else {
      setFieldDialog({ open: true, field: { ...EMPTY_FIELD } });
    }
  };

  const handleSaveField = (field: FieldDraft) => {
    if (!field.name.trim()) {
      toast.error("Field name is required");
      return;
    }
    const payload: Record<string, unknown> = {
      name: field.name.trim(),
      type: field.type,
      description: field.description || null,
      instructions: field.instructions || null,
      required: field.required,
      options:
        OPTIONS_FIELD_TYPES.includes(field.type) && field.options.length > 0
          ? field.options
          : null,
      validation: Object.keys(field.validation || {}).length > 0 ? field.validation : null,
      confidenceThreshold: field.confidenceThreshold,
    };
    if (field.id) {
      updateFieldMutation.mutate({ fieldId: field.id, payload });
    } else {
      createFieldMutation.mutate(payload);
    }
  };

  // Debounced updates for inline edits
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [draftMetadata, setDraftMetadata] = useState<{name: string, description: string, promptTemplate: string}>({
    name: "", description: "", promptTemplate: ""
  });

  // Sync draft when activeSchema changes (from network)
  useEffect(() => {
    if (activeSchema) {
      setDraftMetadata({
        name: activeSchema.name || "",
        description: activeSchema.description || "",
        promptTemplate: activeSchema.promptTemplate || "",
      });
    }
  }, [activeSchema]);

  const handleUpdateSchema = (updates: Partial<typeof draftMetadata>) => {
    setDraftMetadata(prev => ({ ...prev, ...updates }));
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      updateSchemaMutation.mutate(updates);
    }, 1000);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader
        title="Schema Builder"
        description="Define the structured fields the AI will extract from each source. Every extraction is evidence-backed."
        icon={<FileJson className="h-5 w-5" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              openSchema(null);
              setView("sources");
            }}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Back
          </Button>
        }
      />

      {/* Top schema selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Label className="text-xs whitespace-nowrap">Active schema</Label>
              <Select
                value={activeSchemaId ?? "none"}
                onValueChange={(v) =>
                  setActiveSchemaId(v === "none" ? null : v)
                }
              >
                <SelectTrigger className="flex-1 sm:max-w-md">
                  <SelectValue placeholder="Select a schema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {(schemas ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · v{s.version} ({s.fields.length} fields)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ["schemas"] })}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setTemplatesOpen(true)}>
                <FileText className="mr-2 h-3.5 w-3.5" />
                Templates
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                New schema
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {listLoading ? (
        <LoadingState rows={3} />
      ) : !activeSchemaId ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={<FileJson className="h-5 w-5" />}
              title="No schema selected"
              description="Choose an existing schema from the dropdown above, or create a new one to start defining extraction fields."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Create schema
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : schemaLoading ? (
        <LoadingState rows={4} />
      ) : !activeSchema ? (
        <ErrorState message="Schema not found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: schema metadata + fields */}
          <div className="lg:col-span-2 space-y-4">
            {/* Metadata */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Schema metadata
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant={isEditingMetadata ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsEditingMetadata(!isEditingMetadata)}
                    aria-label="Toggle edit mode"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                    aria-label="Delete schema"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => {
                          const name = window.prompt(
                            "Cloned schema name:",
                            `${activeSchema?.name ?? "Schema"} (copy)`
                          );
                          if (name && activeSchemaId) {
                            api.post<SchemaDTO>(`/api/schemas/${activeSchemaId}/clone`, { name })
                              .then((cloned) => {
                                toast.success("Schema cloned", {
                                  description: `"${name}" created with ${cloned.fields?.length ?? 0} fields.`,
                                });
                                queryClient.invalidateQueries({ queryKey: ["schemas"] });
                                setActiveSchemaId(cloned.id);
                              })
                              .catch(() => toast.error("Clone failed"));
                          }
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Clone schema
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          if (!activeSchema) return;
                          const json = JSON.stringify(activeSchema, null, 2);
                          const blob = new Blob([json], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `schema-${activeSchema.name.toLowerCase().replace(/\s+/g, "-")}.json`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Export JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".json";
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                              try {
                                const data = JSON.parse(event.target?.result as string);
                                if (!data.name || !Array.isArray(data.fields)) {
                                  throw new Error("Invalid schema JSON format");
                                }
                                const created = await api.post<SchemaDTO>("/api/schemas", {
                                  name: `${data.name} (Imported)`,
                                  description: data.description,
                                });
                                for (const field of data.fields) {
                                  await api.post(`/api/schemas/${created.id}/fields`, {
                                    name: field.name,
                                    type: field.type,
                                    description: field.description,
                                    instructions: field.instructions,
                                    required: field.required,
                                    options: field.options,
                                    validation: field.validation,
                                    confidenceThreshold: field.confidenceThreshold
                                  });
                                }
                                toast.success("Schema imported successfully");
                                queryClient.invalidateQueries({ queryKey: ["schemas"] });
                                setActiveSchemaId(created.id);
                              } catch (err: any) {
                                toast.error("Import failed", { description: err.message });
                              }
                            };
                            reader.readAsText(file);
                          };
                          input.click();
                        }}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Import JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditingMetadata ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="schema-name">Name</Label>
                        <Input
                          id="schema-name"
                          value={draftMetadata.name}
                          onChange={(e) =>
                            handleUpdateSchema({ name: e.target.value })
                          }
                          placeholder="Schema name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Version</Label>
                        <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm font-mono">
                          v{activeSchema.version}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="schema-desc">Description</Label>
                      <Input
                        id="schema-desc"
                        value={draftMetadata.description}
                        onChange={(e) =>
                          handleUpdateSchema({
                            description: e.target.value,
                          })
                        }
                        placeholder="What this schema extracts"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="schema-prompt">Prompt template (override)</Label>
                      <Textarea
                        id="schema-prompt"
                        rows={3}
                        value={draftMetadata.promptTemplate}
                        onChange={(e) =>
                          handleUpdateSchema({
                            promptTemplate: e.target.value,
                          })
                        }
                        placeholder="Optional system-prompt override sent to the LLM."
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Auto-saves and bumps version.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 text-sm">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <h4 className="text-muted-foreground mb-1 text-xs font-medium">Name</h4>
                        <p className="font-medium">{draftMetadata.name || "—"}</p>
                      </div>
                      <div>
                        <h4 className="text-muted-foreground mb-1 text-xs font-medium">Version</h4>
                        <p className="font-mono">v{activeSchema.version}</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-muted-foreground mb-1 text-xs font-medium">Description</h4>
                      <p>{draftMetadata.description || "—"}</p>
                    </div>
                    {draftMetadata.promptTemplate && (
                      <div>
                        <h4 className="text-muted-foreground mb-1 text-xs font-medium">Prompt template</h4>
                        <pre className="text-xs p-2 bg-muted/30 rounded border whitespace-pre-wrap font-mono">
                          {draftMetadata.promptTemplate}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fields list */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Fields
                  <span className="text-xs font-normal text-muted-foreground">
                    ({activeSchema.fields.length})
                  </span>
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenFieldEditor()}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add field
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {activeSchema.fields.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      icon={<Sparkles className="h-5 w-5" />}
                      title="No fields yet"
                      description="Add your first extraction field to define what the AI should pull from each source."
                      action={
                        <Button
                          size="sm"
                          onClick={() => handleOpenFieldEditor()}
                        >
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Add field
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <div className="max-h-[480px] overflow-y-auto divide-y">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={activeSchema.fields.map((f) => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {activeSchema.fields.map((f) => (
                          <SortableFieldItem
                            key={f.id}
                            field={f}
                            onEdit={handleOpenFieldEditor}
                            onDelete={setDeleteFieldTarget}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: prompt preview + test extraction */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader >
                <CardTitle className="text-base flex items-center gap-2">
                  <Wand2 className="h-4 w-4" />
                  Prompt preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-[11px] font-mono leading-relaxed text-muted-foreground">
                  {prompt || "—"}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader >
                <CardTitle className="text-base flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Test extraction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="sample-text">Sample source text</Label>
                  <Textarea
                    id="sample-text"
                    rows={6}
                    value={sampleText}
                    onChange={(e) => setSampleText(e.target.value)}
                    placeholder="Paste an email body, document excerpt, etc."
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => testExtractionMutation.mutate(sampleText)}
                  disabled={
                    !sampleText.trim() ||
                    testExtractionMutation.isPending ||
                    activeSchema.fields.length === 0
                  }
                >
                  {testExtractionMutation.isPending ? (
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                  )}
                  Run extraction
                </Button>
                {activeSchema.fields.length === 0 && (
                  <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <AlertCircle className="h-3 w-3" />
                    Add at least one field before testing.
                  </p>
                )}

                {/* Test result */}
                {testResult && (
                  <>
                    <Separator />
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Result</span>
                        <span className="text-muted-foreground tabular-nums">
                          {testResult.tokensUsed} tok ·{" "}
                          {Math.round(testResult.overallConfidence * 100)}% avg
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        model: {testResult.modelUsed} · prompt:{" "}
                        {testResult.promptVersion}
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto space-y-2">
                      {testResult.fields.map((f, i) => (
                        <div
                          key={`${f.fieldName}-${i}`}
                          className="rounded-lg border p-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">
                                {f.fieldName}
                              </p>
                              <p className="text-sm break-words">
                                {f.value === null || f.value === undefined
                                  ? "—"
                                  : Array.isArray(f.value)
                                  ? f.value.join(", ")
                                  : String(f.value)}
                              </p>
                            </div>
                            <ConfidenceBadge value={f.confidence} />
                          </div>
                          {f.evidence && (
                            <p className="mt-1.5 text-[10px] text-muted-foreground italic border-l-2 pl-2">
                              "{f.evidence}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Create schema dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new schema</DialogTitle>
            <DialogDescription>
              Give your schema a name and description. You'll add fields next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-schema-name">Name *</Label>
              <Input
                id="new-schema-name"
                placeholder="e.g. Placement Records"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-schema-desc">Description</Label>
              <Textarea
                id="new-schema-desc"
                rows={3}
                placeholder="What this schema extracts"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createSchemaMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createSchemaMutation.mutate({
                  name: newName,
                  description: newDescription || undefined,
                })
              }
              disabled={!newName.trim() || createSchemaMutation.isPending}
            >
              {createSchemaMutation.isPending ? (
                <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-2 h-3.5 w-3.5" />
              )}
              Create schema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit schema dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit schema details</DialogTitle>
            <DialogDescription>
              Update the name or description of this schema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-schema-name">Schema Name</Label>
              <Input
                id="edit-schema-name"
                placeholder="e.g. Invoice Extractions"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-schema-desc">Description (optional)</Label>
              <Input
                id="edit-schema-desc"
                placeholder="Brief summary of what this schema extracts"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={updateSchemaMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                updateSchemaMutation.mutate({
                  name: newName,
                  description: newDescription || undefined,
                });
                setEditOpen(false);
              }}
              disabled={!newName.trim() || updateSchemaMutation.isPending}
            >
              {updateSchemaMutation.isPending ? (
                <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Settings2 className="mr-2 h-3.5 w-3.5" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete schema confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schema?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the schema{" "}
              <span className="font-medium text-foreground">
                {activeSchema?.name}
              </span>
              . Any datasets using this schema will lose their field definitions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSchemaMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSchemaMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteSchemaMutation.mutate();
              }}
            >
              {deleteSchemaMutation.isPending ? "Deleting…" : "Delete schema"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Field editor dialog */}
      <FieldEditorDialog
        key={fieldDialogNonce}
        open={fieldDialog.open}
        field={fieldDialog.field}
        onClose={() => setFieldDialog({ open: false, field: null })}
        onSave={handleSaveField}
        saving={
          createFieldMutation.isPending || updateFieldMutation.isPending
        }
      />

      {/* Delete field confirmation */}
      <AlertDialog
        open={!!deleteFieldTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteFieldTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete field?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteFieldTarget?.name}
              </span>{" "}
              from this schema. Existing dataset values for this field will be
              orphaned but not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFieldMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteFieldMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteFieldTarget) {
                  deleteFieldMutation.mutate(deleteFieldTarget.id);
                }
              }}
            >
              {deleteFieldMutation.isPending ? "Deleting…" : "Delete field"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Templates Dialog */}
      <Dialog open={templatesOpen} onOpenChange={(open) => {
        setTemplatesOpen(open);
        if (!open) setViewTemplate(null);
      }}>
        <DialogContent className="sm:max-w-3xl">
          {viewTemplate ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewTemplate(null)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <DialogTitle>{viewTemplate.name}</DialogTitle>
                    <DialogDescription>{viewTemplate.description}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid gap-2">
                  {viewTemplate.fields.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{f.name}</span>
                          <FieldTypeBadge type={f.type as any} />
                          {f.required && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded">required</span>
                          )}
                        </div>
                        {f.description && <p className="text-xs text-muted-foreground mt-1">{f.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewTemplate(null)}>Back</Button>
                <Button onClick={async () => {
                  setTemplatesOpen(false);
                  try {
                    const created = await api.post<SchemaDTO>("/api/schemas", {
                      name: viewTemplate.name,
                      description: viewTemplate.description,
                    });
                    for (const field of viewTemplate.fields) {
                      await api.post(`/api/schemas/${created.id}/fields`, field);
                    }
                    toast.success("Template schema created!");
                    queryClient.invalidateQueries({ queryKey: ["schemas"] });
                    setActiveSchemaId(created.id);
                  } catch (err: any) {
                    toast.error("Failed to create from template", { description: err.message });
                  }
                }}>
                  <Download className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Pre-built Schema Templates</DialogTitle>
                <DialogDescription>
                  Select a template to quickly create a schema with standard fields.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2 py-4 max-h-[60vh] overflow-y-auto pr-2">
                {PREBUILT_TEMPLATES.map((t, i) => (
                  <Card key={i} className="flex flex-col">
                    <CardHeader className="p-4 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <CardTitle className="text-sm">{t.name}</CardTitle>
                          <DialogDescription className="text-xs line-clamp-2">{t.description}</DialogDescription>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">{t.fields.length} fields</Badge>
                      </div>
                    </CardHeader>
                    <div className="p-4 pt-3 mt-auto flex items-center justify-end gap-2 border-t">
                      <Button variant="outline" size="sm" onClick={() => setViewTemplate(t)}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </Button>
                      <Button size="sm" onClick={async () => {
                        setTemplatesOpen(false);
                        try {
                          const created = await api.post<SchemaDTO>("/api/schemas", {
                            name: t.name,
                            description: t.description,
                          });
                          for (const field of t.fields) {
                            await api.post(`/api/schemas/${created.id}/fields`, field);
                          }
                          toast.success("Template schema created!");
                          queryClient.invalidateQueries({ queryKey: ["schemas"] });
                          setActiveSchemaId(created.id);
                        } catch (err: any) {
                          toast.error("Failed to create from template", { description: err.message });
                        }
                      }}>
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Import
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTemplatesOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Field editor dialog (separate component for clarity) ─────────────────

function FieldEditorDialog({
  open,
  field,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  field: FieldDraft | null;
  onClose: () => void;
  onSave: (field: FieldDraft) => void;
  saving: boolean;
}) {
  // Initialize draft from the field prop on mount (this component is keyed
  // by a nonce in the parent so it remounts with a fresh draft each open).
  const [draft, setDraft] = useState<FieldDraft>(field ?? EMPTY_FIELD);

  const isOptionsType = OPTIONS_FIELD_TYPES.includes(draft.type);

  const handleOptionsChange = (raw: string) => {
    const opts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setDraft((d) => ({ ...d, options: opts }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "Edit field" : "Add field"}
          </DialogTitle>
          <DialogDescription>
            Define how the AI should extract this field from source content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="field-name">Name *</Label>
              <Input
                id="field-name"
                placeholder="e.g. company, amount"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={draft.type}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, type: v as FieldType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-desc">Description</Label>
            <Input
              id="field-desc"
              placeholder="What this field represents"
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-instr">Instructions</Label>
            <Textarea
              id="field-instr"
              rows={2}
              placeholder="Optional extraction hints for the LLM"
              value={draft.instructions}
              onChange={(e) =>
                setDraft((d) => ({ ...d, instructions: e.target.value }))
              }
            />
          </div>

          {isOptionsType && (
            <div className="space-y-2">
              <Label htmlFor="field-options">
                Allowed values (comma-separated)
              </Label>
              <Input
                id="field-options"
                placeholder="low, medium, high"
                value={draft.options.join(", ")}
                onChange={(e) => handleOptionsChange(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="field-required" className="cursor-pointer">
                Required field
              </Label>
              <p className="text-[10px] text-muted-foreground">
                The LLM will treat missing required values as low confidence.
              </p>
            </div>
            <Switch
              id="field-required"
              checked={draft.required}
              onCheckedChange={(v) =>
                setDraft((d) => ({ ...d, required: v }))
              }
            />
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div>
              <Label className="text-sm font-medium">Validation Rules</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Optional constraints the AI must respect when extracting this field. Extracted values that don't pass these checks will be flagged for human review.
              </p>
            </div>
            
            {(draft.type === "number" || draft.type === "date") && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Min {draft.type === "number" ? "value" : "date"}
                    </Label>
                    <Input 
                      type={draft.type === "number" ? "number" : "date"}
                      className="h-8 text-xs" 
                      value={draft.validation?.min?.toString() || ""}
                      onChange={(e) => setDraft(d => ({ ...d, validation: { ...d.validation, min: e.target.value ? Number(e.target.value) : undefined } }))} 
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {draft.type === "number" ? "e.g. 0 — values below this are rejected" : "e.g. Jan 1 2020 — dates earlier than this are flagged"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Max {draft.type === "number" ? "value" : "date"}
                    </Label>
                    <Input 
                      type={draft.type === "number" ? "number" : "date"}
                      className="h-8 text-xs" 
                      value={draft.validation?.max?.toString() || ""}
                      onChange={(e) => setDraft(d => ({ ...d, validation: { ...d.validation, max: e.target.value ? Number(e.target.value) : undefined } }))} 
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {draft.type === "number" ? "e.g. 1000000 — values above this are rejected" : "e.g. Today — dates in the future are flagged"}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {draft.type === "text" && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Regex Pattern</Label>
                    <select
                      className="text-[10px] border rounded px-1 py-0.5 bg-background text-muted-foreground h-6"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setDraft(d => ({ ...d, validation: { ...d.validation, regex: e.target.value || undefined } }));
                      }}
                    >
                      <option value="">— Quick presets —</option>
                      <option value="^\S+@\S+\.\S+$">Email address</option>
                      <option value="^\+?[\d\s\-()]{7,15}$">Phone number</option>
                      <option value="^\d{4}-\d{2}-\d{2}$">Date (YYYY-MM-DD)</option>
                      <option value="^[A-Z]{2,3}-\d{4,6}$">ID code (e.g. INV-1042)</option>
                      <option value="^\$?\d{1,3}(,\d{3})*(\.\d{2})?$">Currency (e.g. $1,234.56)</option>
                      <option value="^https?://.+$">URL</option>
                      <option value="^[A-Z][a-z]+ [A-Z][a-z]+$">Full name (Title Case)</option>
                    </select>
                  </div>
                  <Input 
                    className="h-8 text-xs font-mono" 
                    placeholder="e.g.  ^[A-Z]{3}-\d{4}$  matches codes like ABC-1234"
                    value={draft.validation?.regex || ""}
                    onChange={(e) => setDraft(d => ({ ...d, validation: { ...d.validation, regex: e.target.value || undefined } }))} 
                  />
                  <p className="text-[10px] text-muted-foreground">
                    A regular expression the extracted text must match. Leave blank for no format constraint. Use the presets above for common formats.
                  </p>
                  {draft.validation?.regex && (() => {
                    try { new RegExp(draft.validation.regex); return <p className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ Valid pattern</p>; }
                    catch { return <p className="text-[10px] text-destructive">✗ Invalid regex — check your syntax</p>; }
                  })()}
                </div>
              </div>
            )}

            {draft.type !== "number" && draft.type !== "date" && draft.type !== "text" && (
              <p className="text-xs text-muted-foreground italic">No validation rules available for this field type.</p>
            )}
          </div>

          {/* Confidence threshold */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="cursor-pointer">
                  Confidence threshold
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Fields below this confidence are routed to human review.
                </p>
              </div>
              <Badge
                variant={
                  draft.confidenceThreshold >= 0.85
                    ? "default"
                    : draft.confidenceThreshold >= 0.6
                    ? "secondary"
                    : "outline"
                }
                className="tabular-nums"
              >
                {Math.round(draft.confidenceThreshold * 100)}%
              </Badge>
            </div>
            <Slider
              value={[draft.confidenceThreshold]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) =>
                setDraft((d) => ({ ...d, confidenceThreshold: v }))
              }
              className="w-full"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>0% (always review)</span>
              <span>50%</span>
              <span>70% (default)</span>
              <span>100% (never review)</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(draft)}
            disabled={!draft.name.trim() || saving}
          >
            {saving ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-2 h-3.5 w-3.5" />
            )}
            {draft.id ? "Save changes" : "Add field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
