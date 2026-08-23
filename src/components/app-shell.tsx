"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, type SessionUser } from "@/lib/store";
import { api } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Menu,
  Search,
  Sun,
  Moon,
  ChevronDown,
  Building2,
  Plus,
  HelpCircle,
  LogOut,
  Zap,
  TrendingUp,
  Command as CommandIcon,
  MailOpen,
  type LucideIcon,
} from "lucide-react";
import type { ViewId } from "@/lib/types";
import { CommandPalette } from "@/components/command-palette";
import { NotificationsDropdown } from "@/components/notifications-dropdown";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog";
import { DashboardView } from "./views/dashboard-view";
import { SourcesView } from "./views/sources-view";
import { DatasetsView } from "./views/datasets-view";
import { SchemaBuilderView } from "./views/schema-builder-view";
import { AiStudioView } from "./views/ai-studio-view";
import { MembersView } from "./views/members-view";
import { SharingView } from "./views/sharing-view";
import { AuditView } from "./views/audit-view";
import { SettingsView } from "./views/settings-view";
import { UsageView } from "./views/usage-view";
import { OrganizationsView } from "./views/organizations-view";
import { AssistantButton } from "./assistant/assistant-button";
import { AssistantPanel } from "./assistant/assistant-panel";

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Workspace" },
  { id: "sources", label: "Sources", icon: Inbox, group: "Workspace" },
  { id: "datasets", label: "Datasets", icon: Database, group: "Workspace" },
  { id: "schema-builder", label: "Schema Builder", icon: FileJson, group: "Workspace" },
  { id: "ai-studio", label: "AI Studio", icon: Sparkles, group: "Workspace" },
  { id: "usage", label: "Usage & Billing", icon: TrendingUp, group: "Workspace" },
  { id: "sharing", label: "Sharing Center", icon: Share2, group: "Governance" },
  { id: "organizations", label: "Organizations", icon: Building2, group: "Governance" },
  { id: "members", label: "Members", icon: Users, group: "Governance" },
  { id: "invitations", label: "Invitations", icon: MailOpen, group: "Governance" },
  { id: "audit", label: "Audit Logs", icon: ShieldCheck, group: "Governance" },
  { id: "settings", label: "Settings", icon: Settings, group: "Account" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const openSource = useAppStore((s) => s.openSource);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const clearAssistantUnread = useAppStore((s) => s.clearAssistantUnread);

  const router = useRouter();
  const supabase = createClient();

  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [orgs, setOrgs] = useState<
    { id: string; name: string; slug: string; plan: string; role: string }[]
  >([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{
        user: {
          id: string;
          email: string;
          name: string | null;
          avatarUrl: string | null;
          role: string;
        };
        organizations: {
          id: string;
          name: string;
          slug: string;
          plan: string;
          role: string;
        }[];
      }>("/api/session")
      .then((data) => {
        setSession({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name || data.user.email,
          avatarUrl: data.user.avatarUrl,
        });
        setOrgs(data.organizations);
        setActiveOrgId(data.organizations[0]?.id ?? null);
      })
      .catch(() => {
        // api-client will handle 401→/login redirect automatically
      })
      .finally(() => setSessionLoading(false));
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Alt+T to toggle theme
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        toggleTheme();
      }
      // Alt+A to toggle AI Assistant
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setAssistantOpen(true);
        clearAssistantUnread();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleTheme, setAssistantOpen, clearAssistantUnread]);

  // Landing page is rendered without the shell
  if (view === "landing") {
    return <>{children}</>;
  }

  // Show a minimal loading skeleton while session is being fetched
  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </div>
      </div>
    );
  }

  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));
  const activeOrg = orgs.find((o) => o.id === activeOrgId) || orgs[0];

  const Sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold">Workspace</span>
          <span className="text-[10px] text-muted-foreground">Intelligence Platform</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </p>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setView(item.id);
                      setSidebarOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors group",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", active && "scale-110")} />
                    <span className="truncate">{item.label}</span>
                    {active && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary-foreground/70" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Quick Actions */}
        <div>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Actions
          </p>
          <div className="space-y-0.5">
            <button
              onClick={() => {
                openSource(null);
                setSidebarOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">New Source</span>
            </button>
            <button
              onClick={() => {
                setView("ai-studio");
                setSidebarOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="truncate">Test Extraction</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t p-3 space-y-2">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium truncate">{activeOrg?.name ?? "Acme Intelligence"}</p>
            <span className="text-[9px] uppercase font-bold rounded px-1.5 py-0.5 bg-primary/10 text-primary">{activeOrg?.plan ?? "free"}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {activeOrg?.role ?? "owner"} access
          </p>
        </div>
        <button
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
          className="flex w-full items-center justify-between rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Search className="h-3 w-3" /> Command palette
          </span>
          <kbd className="font-mono text-[10px]">⌘K</kbd>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <CommandPalette />
      <KeyboardShortcutsDialog />
      {/* AI Assistant — floating button + slide-in panel */}
      <AssistantButton />
      <AssistantPanel />
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Mobile menu */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            {Sidebar}
          </SheetContent>
        </Sheet>

        {/* Org switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">{activeOrg?.name ?? "Acme"}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {orgs.map((o) => (
              <DropdownMenuItem
                key={o.id}
                onClick={() => setActiveOrgId(o.id)}
                className="flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{o.name}</span>
                  <span className="text-xs text-muted-foreground">{o.slug}</span>
                </div>
                <span className="text-[10px] uppercase">{o.plan}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setView("organizations")}
              className="text-primary"
            >
              <Plus className="mr-2 h-4 w-4" /> New organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search / Command palette trigger */}
        <button
          onClick={() => {
            // Dispatch Cmd+K to open the command palette
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
          className="relative hidden md:flex flex-1 max-w-md items-center gap-2 rounded-md border bg-background py-1.5 px-3 text-sm text-muted-foreground hover:bg-accent transition-colors group"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground group-hover:bg-background">
            <CommandIcon className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme (Alt+T)">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          <NotificationsDropdown />
          <Button
            variant="ghost"
            size="icon"
            title="Help & shortcuts (?)"
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
            }}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 flex items-center gap-2 rounded-md p-1 hover:bg-accent">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={session?.avatarUrl || undefined} />
                  <AvatarFallback>
                    {session?.name?.charAt(0).toUpperCase() ?? "A"}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:block text-left leading-none">
                  <p className="text-xs font-medium">{session?.name ?? "Alice"}</p>
                  <p className="text-[10px] text-muted-foreground">{session?.email}</p>
                </div>
                <ChevronDown className="hidden lg:block h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div>
                  <p className="text-sm font-medium">{session?.name}</p>
                  <p className="text-xs text-muted-foreground font-normal">{session?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setView("settings")}>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("audit")}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Audit logs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 border-r bg-sidebar">{Sidebar}</aside>

        {/* Main content */}
        <main className="flex-1 overflow-x-hidden">
          <div key={view} className="mx-auto max-w-7xl p-4 sm:p-4 lg:p-6 view-fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Sticky footer */}
      <footer className="border-t bg-background px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-primary text-primary-foreground">
              <Zap className="h-2.5 w-2.5" />
            </span>
            <span className="font-medium text-foreground">Workspace Intelligence Platform</span>
            <span className="hidden sm:inline">· Evidence-backed AI extraction</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
              }}
            >
              <kbd className="font-mono text-[10px] rounded border bg-muted px-1 py-0.5">⌘K</kbd>
              <span className="hidden sm:inline">Command palette</span>
            </button>
            <span>·</span>
            <span className="hidden sm:inline">v1.0 · {activeOrg?.plan ?? "team"} plan</span>
            <span className="hidden sm:inline">·</span>
            <a className="hover:text-foreground transition-colors" href="#" onClick={(e) => { e.preventDefault(); setView("landing"); }}>
              About
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
