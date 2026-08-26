"use client";

// ColumnMapping — interactive column mapping UI for the import/link wizards.
// Maps each Google Sheet header to an existing app column (or creates a new one).
// AI suggestions are shown with confidence badges; high-confidence ones are
// pre-selected but always overrideable by the user.

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain,
  ChevronRight,
  CircleDot,
  Plus,
  SkipForward,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppColumn {
  columnId: string;
  name: string;
  dataType: string;
  required: boolean;
}

export interface AISuggestion {
  sheetHeader: string;
  appColumnId: string | null;
  appColumnName: string | null;
  confidence: number;
  reason: string;
  suggestedDataType: string;
  isAutoSelected: boolean;
}

export interface ColumnMappingEntry {
  sheetHeader: string;
  columnId: string | null;   // null = skip
  columnName?: string;
  dataType?: string;
  isNewColumn: boolean;
  newColumnName?: string;
  newColumnType?: string;
}

interface ColumnMappingProps {
  sheetHeaders: string[];
  appColumns: AppColumn[];
  aiSuggestions?: AISuggestion[];
  isLoadingAI?: boolean;
  value: ColumnMappingEntry[];
  onChange: (mappings: ColumnMappingEntry[]) => void;
  className?: string;
}

const DATA_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "decimal", label: "Decimal" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "currency", label: "Currency" },
  { value: "enum", label: "Enum" },
];

const CONFIDENCE_CONFIG = {
  high: { label: "AI", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  medium: { label: "AI?", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  low: { label: "AI~", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

function getConfidenceLevel(confidence: number) {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}

// ── AI Loading Skeleton ───────────────────────────────────────────────────────

function AIMappingLoadingSkeleton({ headers }: { headers: string[] }) {
  return (
    <div className="space-y-4">
      {/* AI Banner */}
      <div className="relative overflow-hidden rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-950/60 via-indigo-950/60 to-violet-950/60 p-4">
        {/* Animated shimmer */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 ring-1 ring-violet-500/30">
            <Brain className="h-5 w-5 animate-pulse text-violet-300" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-violet-100">
              AI is auto-mapping your columns
            </p>
            <p className="text-xs text-violet-300/70">
              Analyzing {headers.length} column{headers.length !== 1 ? "s" : ""} and finding best matches…
            </p>
          </div>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" />
        </div>
        {/* Progress dots */}
        <div className="mt-3 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full bg-violet-500/30"
              style={{
                animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Skeleton rows */}
      <ScrollArea className="max-h-80">
        <div className="space-y-1.5 pr-1">
          {headers.map((header, idx) => (
            <div
              key={`${header}-${idx}`}
              className="flex items-center gap-2 rounded-md border bg-card/50 px-3 py-2 animate-pulse"
            >
              {/* Sheet header skeleton */}
              <div className="w-36 shrink-0 space-y-1">
                <div className="h-3 w-24 rounded bg-muted/60" />
                <div className="h-2 w-12 rounded bg-muted/40" />
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
              {/* Destination skeleton */}
              <div className="flex-1 min-w-0">
                <div className="h-7 w-full rounded-md bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── AI Summary Banner ─────────────────────────────────────────────────────────

function AISummaryBanner({
  suggestions,
  mappedCount,
  skippedCount,
}: {
  suggestions: AISuggestion[];
  mappedCount: number;
  skippedCount: number;
}) {
  const highConf = suggestions.filter((s) => s.confidence >= 0.85).length;
  const medConf = suggestions.filter((s) => s.confidence >= 0.6 && s.confidence < 0.85).length;
  const lowConf = suggestions.filter((s) => s.confidence < 0.6).length;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500/15">
        <Sparkles className="h-3.5 w-3.5 text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-violet-300">AI Mapping Applied</p>
        <p className="text-[10px] text-muted-foreground">
          {mappedCount} mapped · {skippedCount} skipped
        </p>
      </div>
      {/* Confidence breakdown */}
      <div className="flex items-center gap-1.5 shrink-0">
        {highConf > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
            <CheckCircle2 className="h-2.5 w-2.5" />
            {highConf} high
          </span>
        )}
        {medConf > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
            <AlertCircle className="h-2.5 w-2.5" />
            {medConf} med
          </span>
        )}
        {lowConf > 0 && (
          <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] text-slate-400">
            {lowConf} low
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ColumnMapping({
  sheetHeaders,
  appColumns,
  aiSuggestions = [],
  isLoadingAI = false,
  value,
  onChange,
  className,
}: ColumnMappingProps) {
  // Initialize mappings from AI suggestions or empty
  useEffect(() => {
    const isCreatingNewDataset = appColumns.length === 0;

    if (aiSuggestions.length > 0 && value.length === 0) {
      const initial: ColumnMappingEntry[] = sheetHeaders.map((header) => {
        const suggestion = aiSuggestions.find((s) => s.sheetHeader === header);
        if (suggestion?.isAutoSelected && suggestion.appColumnId) {
          return {
            sheetHeader: header,
            columnId: suggestion.appColumnId,
            columnName: suggestion.appColumnName ?? undefined,
            dataType: suggestion.suggestedDataType,
            isNewColumn: false,
          };
        }
        return {
          sheetHeader: header,
          columnId: null,
          isNewColumn: isCreatingNewDataset,
          newColumnName: isCreatingNewDataset ? header : undefined,
          newColumnType: isCreatingNewDataset ? (suggestion?.suggestedDataType || "text") : undefined,
        };
      });
      onChange(initial);
    } else if (value.length === 0 && sheetHeaders.length > 0) {
      // No AI — try exact name match
      const initial: ColumnMappingEntry[] = sheetHeaders.map((header) => {
        const exact = appColumns.find(
          (c) => c.name.toLowerCase() === header.toLowerCase()
        );
        return {
          sheetHeader: header,
          columnId: exact?.columnId ?? null,
          columnName: exact?.name,
          dataType: exact?.dataType,
          isNewColumn: isCreatingNewDataset,
          newColumnName: isCreatingNewDataset ? header : undefined,
          newColumnType: isCreatingNewDataset ? "text" : undefined,
        };
      });
      onChange(initial);
    }
     
  }, [aiSuggestions, sheetHeaders]);

  function updateEntry(index: number, patch: Partial<ColumnMappingEntry>) {
    const updated = value.map((e, i) => (i === index ? { ...e, ...patch } : e));
    onChange(updated);
  }

  const mappedCount = value.filter((e) => e.columnId !== null || e.isNewColumn).length;
  const skippedCount = value.filter((e) => e.columnId === null && !e.isNewColumn).length;

  // ── Loading state: rich skeleton + AI banner ───────────────────────────────
  if (isLoadingAI) {
    return <AIMappingLoadingSkeleton headers={sheetHeaders} />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Summary bar */}
      {aiSuggestions.length > 0 ? (
        <AISummaryBanner
          suggestions={aiSuggestions}
          mappedCount={mappedCount}
          skippedCount={skippedCount}
        />
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {mappedCount} mapped · {skippedCount} skipped
          </span>
        </div>
      )}

      {/* Column rows */}
      <ScrollArea className="max-h-80">
        <div className="space-y-1.5 pr-1">
          {sheetHeaders.map((header, idx) => {
            const entry = value[idx] ?? {
              sheetHeader: header,
              columnId: null,
              isNewColumn: false,
            };
            const suggestion = aiSuggestions.find((s) => s.sheetHeader === header);
            const confLevel = suggestion
              ? getConfidenceLevel(suggestion.confidence)
              : null;

            return (
              <div
                key={`${header}-${idx}`}
                className="flex items-center gap-2 rounded-md border bg-card/50 px-3 py-2"
              >
                {/* Sheet header */}
                <div className="w-36 shrink-0">
                  <p className="text-xs font-mono truncate" title={header}>
                    {header}
                  </p>
                  {suggestion && confLevel && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] px-1 py-0 mt-0.5 cursor-default",
                              CONFIDENCE_CONFIG[confLevel].className
                            )}
                          >
                            {CONFIDENCE_CONFIG[confLevel].label}{" "}
                            {Math.round(suggestion.confidence * 100)}%
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-[220px]">
                          {suggestion.reason}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>

                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                {/* Destination selector */}
                <div className="flex-1 min-w-0">
                  {entry.isNewColumn ? (
                    <div className="flex gap-1.5">
                      <Input
                        value={entry.newColumnName ?? header}
                        onChange={(e) =>
                          updateEntry(idx, { newColumnName: e.target.value })
                        }
                        placeholder="Column name"
                        className="h-7 text-xs flex-1"
                      />
                      <Select
                        value={entry.newColumnType ?? suggestion?.suggestedDataType ?? "text"}
                        onValueChange={(v) =>
                          updateEntry(idx, { newColumnType: v })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPES.map((dt) => (
                            <SelectItem key={dt.value} value={dt.value} className="text-xs">
                              {dt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <Select
                      value={entry.columnId ?? "__skip__"}
                      onValueChange={(v) => {
                        if (v === "__skip__") {
                          updateEntry(idx, { columnId: null, isNewColumn: false });
                        } else if (v === "__new__") {
                          updateEntry(idx, {
                            columnId: null,
                            isNewColumn: true,
                            newColumnName: header,
                            newColumnType:
                              suggestion?.suggestedDataType ?? "text",
                          });
                        } else {
                          const col = appColumns.find((c) => c.columnId === v);
                          updateEntry(idx, {
                            columnId: v,
                            columnName: col?.name,
                            dataType: col?.dataType,
                            isNewColumn: false,
                          });
                        }
                      }}
                    >
                      <SelectTrigger id={`mapping-${idx}`} className="h-7 text-xs w-full">
                        <SelectValue placeholder="Map to column…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel className="text-[10px]">
                            Existing columns
                          </SelectLabel>
                          {appColumns.map((col) => (
                            <SelectItem key={col.columnId} value={col.columnId} className="text-xs">
                              <span className="flex items-center gap-1.5">
                                <CircleDot className="h-2.5 w-2.5 text-muted-foreground" />
                                {col.name}
                                <span className="text-muted-foreground ml-1">
                                  {col.dataType}
                                </span>
                                {col.required && (
                                  <span className="text-red-400 text-[10px]">*</span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectItem value="__new__" className="text-xs text-blue-400">
                            <Plus className="mr-1 inline h-3 w-3" />
                            Add as new column
                          </SelectItem>
                          <SelectItem value="__skip__" className="text-xs text-muted-foreground">
                            <SkipForward className="mr-1 inline h-3 w-3" />
                            Skip this column
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Cancel new column */}
                {entry.isNewColumn && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() =>
                      updateEntry(idx, {
                        isNewColumn: false,
                        columnId: null,
                        newColumnName: undefined,
                        newColumnType: undefined,
                      })
                    }
                  >
                    <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
