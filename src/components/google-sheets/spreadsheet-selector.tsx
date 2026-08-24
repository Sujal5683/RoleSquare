"use client";

// SpreadsheetSelector
// Searchable list of Google Drive spreadsheets for the selected Sheets account.
// Displays name, last-modified date, and owner email.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileSpreadsheet,
  Loader2,
  Search,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface SpreadsheetItem {
  id: string;
  name: string;
  webViewLink: string | null;
  modifiedTime: string | null;
  ownerEmail: string | null;
}

interface SpreadsheetSelectorProps {
  sheetsAccountId: string;
  value?: string | null;        // selected spreadsheetId
  onSelect: (id: string, name: string) => void;
  className?: string;
}

export function SpreadsheetSelector({
  sheetsAccountId,
  value,
  onSelect,
  className,
}: SpreadsheetSelectorProps) {
  const [search, setSearch] = useState("");
  const { selectedOrganizationId } = useAppStore();

  const { data, isLoading, isError } = useQuery<{
    items: SpreadsheetItem[];
    nextPageToken?: string;
  }>({
    queryKey: ["spreadsheets", sheetsAccountId, selectedOrganizationId],
    queryFn: () =>
      api.get(
        `/api/google-sheets/spreadsheets?sheetsAccountId=${sheetsAccountId}`
      ),
    enabled: !!sheetsAccountId,
  });

  const filtered = (data?.items ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          id="spreadsheet-search"
          placeholder="Search spreadsheets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-sm">Loading spreadsheets…</span>
        </div>
      ) : isError ? (
        <div className="text-center py-6 text-sm text-red-400">
          Failed to load spreadsheets. Check your Google account connection.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {search ? `No spreadsheets matching "${search}"` : "No spreadsheets found"}
        </div>
      ) : (
        <ScrollArea className="h-64 rounded-md border">
          <div className="p-1">
            {filtered.map((sheet) => (
              <button
                key={sheet.id}
                id={`spreadsheet-${sheet.id}`}
                onClick={() => onSelect(sheet.id, sheet.name)}
                className={cn(
                  "w-full text-left flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent transition-colors group",
                  value === sheet.id && "bg-accent"
                )}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sheet.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {sheet.modifiedTime
                      ? `Modified ${formatDistanceToNow(new Date(sheet.modifiedTime), { addSuffix: true })}`
                      : ""}
                    {sheet.ownerEmail ? ` · ${sheet.ownerEmail}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {sheet.webViewLink && (
                    <a
                      href={sheet.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                  {value === sheet.id && (
                    <ChevronRight className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {data?.nextPageToken && (
        <p className="text-center text-xs text-muted-foreground">
          Showing first 50 results. Refine your search to find others.
        </p>
      )}
    </div>
  );
}
