"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { ViewId, SourceDTO, DatasetDTO, SchemaDTO } from "@/lib/types";
import {
  LayoutDashboard,
  Inbox,
  Database,
  FileJson,
  Sparkles,
  Users,
  Share2,
  ShieldCheck,
  Settings,
  Building2,
  Search,
  Plus,
  Sun,
  Moon,
  Zap,
  Clock,
  ArrowRight,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

interface SearchResults {
  query: string;
  results: {
    sources: SourceDTO[];
    datasets: DatasetDTO[];
    schemas: SchemaDTO[];
    records: {
      id: string;
      datasetId: string;
      dataset?: { id: string; name: string };
      status: string;
      confidence: number;
      values: { fieldName?: string; value: unknown }[];
    }[];
  };
  total: number;
}

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  shortcut?: string;
  action: () => void;
  group: string;
  keywords?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const setView = useAppStore((s) => s.setView);
  const openSource = useAppStore((s) => s.openSource);
  const openDataset = useAppStore((s) => s.openDataset);
  const openSchema = useAppStore((s) => s.openSchema);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const theme = useAppStore((s) => s.theme);
  const recentItems = useAppStore((s) => s.recentItems);

  // Debounced search query — only hits the API after the user stops typing
  // for 250ms, and only if the query is at least 2 characters.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = search.trim();
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Reset search when the palette closes (via onOpenChange, not in effect)
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setSearch("");
      setDebouncedQuery("");
    }
  }, []);

  const { data: searchData } = useQuery({
    queryKey: ["global-search", debouncedQuery],
    queryFn: () =>
      api.get<SearchResults>(`/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=5`),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Alt+1..9 for view navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          const views: ViewId[] = [
            "dashboard",
            "sources",
            "datasets",
            "schema-builder",
            "ai-studio",
            "sharing",
            "organizations",
            "members",
            "settings",
          ];
          if (views[num - 1]) {
            setView(views[num - 1]);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setView]);

  const navigate = useCallback(
    (view: ViewId) => {
      setView(view);
      setOpen(false);
    },
    [setView]
  );

  const isSearching = search.trim().length >= 2;
  const hasResults = searchData && searchData.total > 0;

  // Static commands (navigation + actions + settings)
  const staticActions: CommandAction[] = [
    {
      id: "nav-dashboard",
      label: "Dashboard",
      description: "Overview of pipeline and review queue",
      icon: LayoutDashboard,
      shortcut: "Alt+1",
      action: () => navigate("dashboard"),
      group: "Navigate",
      keywords: "home overview stats kpi",
    },
    {
      id: "nav-sources",
      label: "Sources",
      description: "Gmail and Drive ingestion sources",
      icon: Inbox,
      shortcut: "Alt+2",
      action: () => navigate("sources"),
      group: "Navigate",
      keywords: "gmail drive ingestion rules",
    },
    {
      id: "nav-datasets",
      label: "Datasets",
      description: "Structured data collections",
      icon: Database,
      shortcut: "Alt+3",
      action: () => navigate("datasets"),
      group: "Navigate",
      keywords: "data records grid table",
    },
    {
      id: "nav-schemas",
      label: "Schema Builder",
      description: "Define extraction field schemas",
      icon: FileJson,
      shortcut: "Alt+4",
      action: () => navigate("schema-builder"),
      group: "Navigate",
      keywords: "fields types extraction prompt",
    },
    {
      id: "nav-ai-studio",
      label: "AI Studio",
      description: "Extraction runs and test sandbox",
      icon: Sparkles,
      shortcut: "Alt+5",
      action: () => navigate("ai-studio"),
      group: "Navigate",
      keywords: "ai extraction llm gemini test",
    },
    {
      id: "nav-sharing",
      label: "Sharing Center",
      description: "Manage dataset access requests",
      icon: Share2,
      shortcut: "Alt+6",
      action: () => navigate("sharing"),
      group: "Navigate",
      keywords: "permissions access approve",
    },
    {
      id: "nav-usage",
      label: "Usage & Billing",
      description: "Token consumption, costs, and quota trends",
      icon: TrendingUp,
      action: () => navigate("usage"),
      group: "Navigate",
      keywords: "usage billing cost tokens quota metrics charts",
    },
    {
      id: "nav-organizations",
      label: "Organizations",
      description: "Manage organizations and teams",
      icon: Building2,
      shortcut: "Alt+7",
      action: () => navigate("organizations"),
      group: "Navigate",
      keywords: "org team company",
    },
    {
      id: "nav-members",
      label: "Members",
      description: "Team members and roles",
      icon: Users,
      shortcut: "Alt+8",
      action: () => navigate("members"),
      group: "Navigate",
      keywords: "users team invite roles",
    },
    {
      id: "nav-settings",
      label: "Settings",
      description: "Profile, security, billing",
      icon: Settings,
      shortcut: "Alt+9",
      action: () => navigate("settings"),
      group: "Navigate",
      keywords: "profile account security billing",
    },
    {
      id: "action-new-source",
      label: "Create new source",
      description: "Set up a new Gmail or Drive source",
      icon: Plus,
      action: () => {
        openSource(null);
        setOpen(false);
      },
      group: "Quick Actions",
      keywords: "add create source gmail drive new",
    },
    {
      id: "action-new-schema",
      label: "Create new schema",
      description: "Define a new extraction schema",
      icon: Plus,
      action: () => {
        openSchema(null);
        setOpen(false);
      },
      group: "Quick Actions",
      keywords: "add create schema fields new",
    },
    {
      id: "action-test-extraction",
      label: "Test AI extraction",
      description: "Run extraction on sample text",
      icon: Sparkles,
      action: () => navigate("ai-studio"),
      group: "Quick Actions",
      keywords: "ai extract test sandbox llm",
    },
    {
      id: "action-audit",
      label: "View audit logs",
      description: "Review activity timeline",
      icon: ShieldCheck,
      action: () => navigate("audit"),
      group: "Quick Actions",
      keywords: "logs history activity timeline",
    },
    {
      id: "toggle-theme",
      label: theme === "light" ? "Switch to dark mode" : "Switch to light mode",
      description: "Toggle theme appearance",
      icon: theme === "light" ? Moon : Sun,
      action: () => {
        toggleTheme();
        setOpen(false);
      },
      group: "Settings",
      keywords: "dark light theme appearance color",
    },
  ];

  const recentItemIcon: Record<string, LucideIcon> = {
    dataset: Database,
    source: Inbox,
    schema: FileJson,
    record: FileJson,
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <Command className="rounded-lg" shouldFilter={!isSearching}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <CommandInput
              placeholder="Search commands, navigate, or find records…"
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="ml-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          <CommandList className="max-h-[440px] overflow-y-auto">
            <CommandEmpty>
              <div className="flex flex-col items-center py-5 text-center">
                <Search className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">
                  {isSearching ? "No results found" : "Start typing to search"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isSearching
                    ? `No matches for "${debouncedQuery}"`
                    : "Try searching for sources, datasets, schemas, or records"}
                </p>
              </div>
            </CommandEmpty>

            {/* Search Results — shown when query >= 2 chars */}
            {isSearching && hasResults && (
              <>
                {searchData!.results.sources.length > 0 && (
                  <CommandGroup
                    heading={`Sources (${searchData!.results.sources.length})`}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {searchData!.results.sources.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={`source ${s.name} ${s.description || ""}`}
                        onSelect={() => {
                          openSource(s.id);
                          setOpen(false);
                        }}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 aria-selected:bg-accent"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          <Inbox className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.description || s.sourceType} · {s.status}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {searchData!.results.datasets.length > 0 && (
                  <CommandGroup
                    heading={`Datasets (${searchData!.results.datasets.length})`}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {searchData!.results.datasets.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={`dataset ${d.name} ${d.description || ""}`}
                        onSelect={() => {
                          openDataset(d.id);
                          setOpen(false);
                        }}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 aria-selected:bg-accent"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <Database className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {d.recordCount} records{d.schema ? ` · ${d.schema.name}` : ""}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {searchData!.results.schemas.length > 0 && (
                  <CommandGroup
                    heading={`Schemas (${searchData!.results.schemas.length})`}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {searchData!.results.schemas.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={`schema ${s.name} ${s.description || ""}`}
                        onSelect={() => {
                          openSchema(s.id);
                          setOpen(false);
                        }}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 aria-selected:bg-accent"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                          <FileJson className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.fields.length} fields · v{s.version}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {searchData!.results.records.length > 0 && (
                  <CommandGroup
                    heading={`Records (${searchData!.results.records.length})`}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {searchData!.results.records.map((r) => {
                      const firstValue = r.values[0];
                      const displayValue = firstValue
                        ? String(firstValue.value)
                        : "Record";
                      return (
                        <CommandItem
                          key={r.id}
                          value={`record ${displayValue} ${r.dataset?.name || ""}`}
                          onSelect={() => {
                            if (r.datasetId) {
                              openDataset(r.datasetId);
                            }
                            setOpen(false);
                          }}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2.5 aria-selected:bg-accent"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            <FileJson className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {displayValue}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {r.dataset?.name || "Unknown dataset"} ·{" "}
                              {Math.round(r.confidence * 100)}% confidence
                            </p>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </>
            )}

            {/* Recently Viewed — only shown when not searching */}
            {!isSearching && recentItems.length > 0 && (
              <CommandGroup
                heading="Recently Viewed"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {recentItems.slice(0, 5).map((item) => {
                  const Icon = recentItemIcon[item.type] || FileJson;
                  return (
                    <CommandItem
                      key={item.id}
                      value={`recent ${item.type} ${item.name}`}
                      onSelect={() => {
                        if (item.type === "source") openSource(item.id);
                        else if (item.type === "dataset") openDataset(item.id);
                        else if (item.type === "schema") openSchema(item.id);
                        setOpen(false);
                      }}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2.5 aria-selected:bg-accent"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate capitalize">
                          {item.type}: {item.name.slice(0, 12)}
                          {item.name.length > 12 ? "…" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {timeAgo(item.timestamp)}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Static commands — hidden when searching */}
            {!isSearching && (
              <>
                {Array.from(new Set(staticActions.map((i) => i.group))).map((group) => (
                  <CommandGroup
                    key={group}
                    heading={group}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {staticActions
                      .filter((i) => i.group === group)
                      .map((item) => {
                        const Icon = item.icon;
                        return (
                          <CommandItem
                            key={item.id}
                            value={`${item.label} ${item.keywords || ""} ${item.description || ""}`}
                            onSelect={() => item.action()}
                            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 aria-selected:bg-accent"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{item.label}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            {item.shortcut && (
                              <CommandShortcut className="ml-auto shrink-0">
                                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                                  {item.shortcut}
                                </kbd>
                              </CommandShortcut>
                            )}
                          </CommandItem>
                        );
                      })}
                  </CommandGroup>
                ))}
              </>
            )}

            <CommandSeparator />
            <CommandGroup>
              <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
                    Select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
                    Close
                  </span>
                </div>
                <span className="flex items-center gap-1 text-primary">
                  <Zap className="h-3 w-3" /> WIP
                </span>
              </div>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
