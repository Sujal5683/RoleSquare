"use client";

// TabSelector — lists tabs in a spreadsheet and lets the user pick one.
// Shows row count, column count estimates, and allows creating a new tab.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Grid3X3, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

interface TabSelectorProps {
  sheetsAccountId: string;
  spreadsheetId: string;
  value?: string | null;       // selected tab title
  onSelect: (title: string, sheetId: number) => void;
  allowNew?: boolean;
  className?: string;
}

export function TabSelector({
  sheetsAccountId,
  spreadsheetId,
  value,
  onSelect,
  allowNew = false,
  className,
}: TabSelectorProps) {
  const { data, isLoading, isError } = useQuery<{
    tabs: TabInfo[];
    title: string;
  }>({
    queryKey: ["spreadsheet-tabs", spreadsheetId, sheetsAccountId],
    queryFn: () =>
      api.get(
        `/api/google-sheets/spreadsheets/${spreadsheetId}/tabs?sheetsAccountId=${sheetsAccountId}`
      ),
    enabled: !!spreadsheetId && !!sheetsAccountId,
  });

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground py-4", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading tabs…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn("text-sm text-red-400 py-4", className)}>
        Failed to load spreadsheet tabs.
      </div>
    );
  }

  const tabs = data?.tabs ?? [];

  return (
    <div className={cn("space-y-1", className)}>
      {tabs.map((tab) => {
        const dataRows = Math.max(0, (tab.rowCount || 0) - 1);
        return (
          <button
            key={tab.sheetId}
            id={`tab-${tab.sheetId}`}
            onClick={() => onSelect(tab.title, tab.sheetId)}
            className={cn(
              "w-full text-left flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent transition-colors border",
              value === tab.title
                ? "border-primary/40 bg-primary/5"
                : "border-transparent"
            )}
          >
            <Grid3X3 className="h-4 w-4 shrink-0 text-emerald-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{tab.title}</p>
              <p className="text-xs text-muted-foreground">
                ~{dataRows.toLocaleString()} rows · {tab.columnCount} columns
              </p>
            </div>
            {value === tab.title && (
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                Selected
              </Badge>
            )}
          </button>
        );
      })}

      {tabs.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No tabs found in this spreadsheet.
        </p>
      )}

      {allowNew && (
        <button
          id="new-tab-btn"
          className="w-full text-left flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent transition-colors border border-dashed border-muted-foreground/30 text-muted-foreground"
          onClick={() => onSelect("__new__", -1)}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="text-sm">Create new tab</span>
        </button>
      )}
    </div>
  );
}
