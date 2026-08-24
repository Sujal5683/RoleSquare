"use client";

// SheetPreview — renders a mini-table of the first N rows from a sheet tab.
// Used in both the import wizard and link wizard to let the user see the data
// before mapping columns.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetPreviewProps {
  sheetsAccountId: string;
  spreadsheetId: string;
  tabName: string;
  limit?: number;
  highlightHeader?: boolean;
  className?: string;
}

export function SheetPreview({
  sheetsAccountId,
  spreadsheetId,
  tabName,
  limit = 10,
  highlightHeader = true,
  className,
}: SheetPreviewProps) {
  const { data, isLoading, isError } = useQuery<{
    headers: string[];
    rows: string[][];
    totalRowsEstimate: number;
  }>({
    queryKey: ["sheet-preview", spreadsheetId, tabName, sheetsAccountId],
    queryFn: () =>
      api.get(
        `/api/google-sheets/spreadsheets/${spreadsheetId}/preview` +
          `?sheetsAccountId=${encodeURIComponent(sheetsAccountId)}` +
          `&tab=${encodeURIComponent(tabName)}&limit=${limit}`
      ),
    enabled: !!sheetsAccountId && !!spreadsheetId && !!tabName,
  });

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-8 text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading preview…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn("flex items-center gap-2 py-6 text-sm text-red-400", className)}>
        <AlertCircle className="h-4 w-4 shrink-0" />
        Could not load preview. Check your permissions.
      </div>
    );
  }

  if (!data || !data.headers.length) {
    return (
      <div className={cn("text-sm text-muted-foreground text-center py-8", className)}>
        No data found in this tab.
      </div>
    );
  }

  const { headers, rows, totalRowsEstimate } = data;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Stats bar */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Eye className="h-3.5 w-3.5" />
        <span>
          Showing {rows.length} of ~{totalRowsEstimate.toLocaleString()} rows
        </span>
        <span>·</span>
        <span>{headers.length} columns</span>
        {headers.includes("__row_id__") && (
          <Badge variant="outline" className="text-[10px] py-0">
            Linked
          </Badge>
        )}
      </div>

      {/* Table */}
      <ScrollArea className="rounded-md border">
        <div className="min-w-max">
          <table className="w-full text-xs">
            <thead>
              <tr className={cn(highlightHeader && "bg-muted/60")}>
                <th className="px-2 py-1.5 text-right text-muted-foreground font-normal border-r w-8">
                  #
                </th>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className={cn(
                      "px-3 py-1.5 text-left font-semibold truncate max-w-[180px] border-r last:border-r-0",
                      h === "__row_id__" && "text-muted-foreground/40 font-normal italic"
                    )}
                    title={h}
                  >
                    {h === "__row_id__" ? "(row ID)" : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-t hover:bg-muted/30 transition-colors"
                >
                  <td className="px-2 py-1 text-right text-muted-foreground/60 border-r">
                    {ri + 2}
                  </td>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-1 truncate max-w-[180px] border-r last:border-r-0"
                      title={cell}
                    >
                      {cell || (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
