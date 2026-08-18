"use client";

import { useEffect, useState, useCallback } from "react";
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
import type { ViewId } from "@/lib/types";
import {
  LayoutDashboard,
  Inbox,
  Database,
  FileJson,
  Sparkles,
  Users,
  Building2,
  ShieldCheck,
  Settings,
  Share2,
  Search,
  Plus,
  Mail,
  RefreshCw,
  Sun,
  Moon,
  Zap,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

interface CommandItem {
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
  const setView = useAppStore((s) => s.setView);
  const openSource = useAppStore((s) => s.openSource);
  const openDataset = useAppStore((s) => s.openDataset);
  const openSchema = useAppStore((s) => s.openSchema);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const theme = useAppStore((s) => s.theme);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      // Escape to close
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Keyboard shortcuts for view navigation (Alt+1..9)
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

  const items: CommandItem[] = [
    // Navigation
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
    // Quick actions
    {
      id: "action-new-source",
      label: "Create new source",
      description: "Set up a new Gmail or Drive source",
      icon: Plus,
      shortcut: "N",
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
      action: () => {
        navigate("ai-studio");
      },
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
    // Settings
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

  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <Command className="rounded-lg">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <CommandInput
              placeholder="Search commands, navigate, or create…"
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0"
            />
          </div>
          <CommandList className="max-h-[400px] overflow-y-auto">
            <CommandEmpty>
              <div className="flex flex-col items-center py-6 text-center">
                <Search className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">No results found</p>
                <p className="text-xs text-muted-foreground">
                  Try a different search term
                </p>
              </div>
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {items
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
