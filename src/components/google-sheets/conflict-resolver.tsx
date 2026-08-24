"use client";

// ConflictResolver
// Allows users to resolve sync conflicts one-by-one or in bulk.
// Each conflict shows: the app value, the sheet value, the last-synced value,
// and three resolution options: keep app, keep sheet, or enter manual value.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Database,
  FileSpreadsheet,
  GitMerge,
  Check,
  ChevronDown,
  ChevronUp,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConflictRecord {
  id: string;
  recordId: string;
  columnId: string;
  columnName: string;
  appValue: unknown;
  sheetValue: unknown;
  lastSyncedValue: unknown;
  detectedAt: string;
}

type Resolution = "keep_app" | "keep_sheet" | "manual";

interface ConflictResolverProps {
  sheetMappingId: string;
  conflicts: ConflictRecord[];
  className?: string;
}

export function ConflictResolver({
  sheetMappingId,
  conflicts,
  className,
}: ConflictResolverProps) {
  const queryClient = useQueryClient();
  const [resolutions, setResolutions] = useState<
    Record<string, { resolution: Resolution; manualValue?: string }>
  >({});
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(conflicts.slice(0, 1).map((c) => c.id)) // expand first by default
  );
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setResolution(
    conflictId: string,
    resolution: Resolution,
    manualValue?: string
  ) {
    setResolutions((prev) => ({
      ...prev,
      [conflictId]: { resolution, manualValue },
    }));
  }

  const resolveOne = useMutation({
    mutationFn: async (conflictId: string) => {
      const r = resolutions[conflictId];
      if (!r) throw new Error("No resolution selected");
      return api.post(
        `/api/google-sheets/mappings/${sheetMappingId}/conflicts/${conflictId}/resolve`,
        { resolution: r.resolution, manualValue: r.manualValue ?? undefined }
      );
    },
    onSuccess: (_, conflictId) => {
      toast.success("Conflict resolved");
      setSubmitting((prev) => {
        const next = new Set(prev);
        next.delete(conflictId);
        return next;
      });
      queryClient.invalidateQueries({
        queryKey: ["conflicts", sheetMappingId],
      });
    },
    onError: (_, conflictId) => {
      toast.error("Failed to resolve conflict");
      setSubmitting((prev) => {
        const next = new Set(prev);
        next.delete(conflictId);
        return next;
      });
    },
  });

  function handleResolve(conflictId: string) {
    setSubmitting((prev) => new Set(prev).add(conflictId));
    resolveOne.mutate(conflictId);
  }

  if (!conflicts.length) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground", className)}>
        <GitMerge className="mx-auto h-8 w-8 mb-2 text-emerald-500" />
        <p className="text-sm font-medium">No conflicts</p>
        <p className="text-xs mt-1">All sync conflicts have been resolved.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-muted-foreground">
        {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} need your
        attention. Both the application and the Google Sheet changed the same value.
      </p>

      <ScrollArea className="max-h-[420px] pr-1">
        <div className="space-y-2">
          {conflicts.map((conflict) => {
            const res = resolutions[conflict.id];
            const isExpanded = expanded.has(conflict.id);
            const isSubmitting = submitting.has(conflict.id);

            return (
              <Card
                key={conflict.id}
                className={cn(
                  "border transition-colors",
                  res ? "border-emerald-500/30" : "border-orange-500/30"
                )}
              >
                {/* Header row */}
                <CardHeader className="py-2 px-3 cursor-pointer" onClick={() => toggleExpand(conflict.id)}>
                  <div className="flex items-center gap-2">
                    <GitMerge className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        Column:{" "}
                        <code className="font-mono text-primary">
                          {conflict.columnName}
                        </code>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Row {conflict.recordId.slice(-6)} ·{" "}
                        {new Date(conflict.detectedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    {res && (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                        <Check className="mr-1 h-2.5 w-2.5" />
                        Resolved
                      </Badge>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 px-3 pb-3 space-y-3">
                    {/* Value comparison */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <ValueCard
                        icon={Database}
                        label="App value"
                        value={conflict.appValue}
                        color="blue"
                        selected={res?.resolution === "keep_app"}
                        onClick={() => setResolution(conflict.id, "keep_app")}
                      />
                      <ValueCard
                        icon={FileSpreadsheet}
                        label="Sheet value"
                        value={conflict.sheetValue}
                        color="emerald"
                        selected={res?.resolution === "keep_sheet"}
                        onClick={() => setResolution(conflict.id, "keep_sheet")}
                      />
                      <div
                        className="rounded border p-2 space-y-1 cursor-pointer hover:border-violet-500/50 transition-colors"
                        onClick={() => setResolution(conflict.id, "manual")}
                      >
                        <p className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                          <PenLine className="h-2.5 w-2.5" />
                          Manual
                        </p>
                        {res?.resolution === "manual" ? (
                          <Input
                            value={res.manualValue ?? ""}
                            onChange={(e) =>
                              setResolution(conflict.id, "manual", e.target.value)
                            }
                            onClick={(e) => e.stopPropagation()}
                            className="h-6 text-xs"
                            placeholder="Enter value…"
                          />
                        ) : (
                          <p className="text-[10px] text-muted-foreground">
                            Click to enter
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Last synced value */}
                    <p className="text-[10px] text-muted-foreground">
                      Last synced value:{" "}
                      <code className="font-mono">
                        {renderValue(conflict.lastSyncedValue) || "(none)"}
                      </code>
                    </p>

                    {/* Resolve button */}
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs"
                      disabled={!res || isSubmitting}
                      onClick={() => handleResolve(conflict.id)}
                    >
                      {isSubmitting ? "Resolving…" : "Apply Resolution"}
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ValueCard({
  icon: Icon,
  label,
  value,
  color,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: unknown;
  color: "blue" | "emerald";
  selected: boolean;
  onClick: () => void;
}) {
  const colorCls = {
    blue: "border-blue-500/40 bg-blue-500/5",
    emerald: "border-emerald-500/40 bg-emerald-500/5",
  }[color];

  return (
    <div
      className={cn(
        "rounded border p-2 space-y-1 cursor-pointer hover:opacity-80 transition-opacity",
        selected ? colorCls : "hover:border-muted-foreground/40"
      )}
      onClick={onClick}
    >
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </p>
      <p className="text-xs font-mono break-all">
        {renderValue(value) || <span className="text-muted-foreground">(empty)</span>}
      </p>
      {selected && (
        <Badge className="text-[9px] py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
          <Check className="mr-0.5 h-2 w-2" />
          Selected
        </Badge>
      )}
    </div>
  );
}
