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
  History,
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
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
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
// This view is imported centrally from page.tsx, so we might not even need it here if it's unused.
import { AuditView } from "./views/audit-view";
import { SettingsView } from "./views/settings-view";
import { UsageView } from "./views/usage-view";
import { OrganizationsView } from "./views/organizations-view";
import { AssistantButton } from "./assistant/assistant-button";
import { AssistantPanel } from "./assistant/assistant-panel";
import { SidebarJobsWidget } from "./sidebar-jobs-widget";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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
  { id: "ai-studio", label: "AI Studio", icon: Bot, group: "Workspace" },
  { id: "sharing", label: "Sharing Center", icon: Share2, group: "Governance" },
  { id: "organizations", label: "Organizations", icon: Building2, group: "Governance" },
  { id: "members", label: "Members", icon: Users, group: "Governance" },
  { id: "invitations", label: "Invitations", icon: MailOpen, group: "Governance" },
  { id: "usage", label: "Usage & Billing", icon: TrendingUp, group: "Account" },
  { id: "audit", label: "Audit Logs", icon: History, group: "Account" },
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
  const desktopSidebarOpen = useAppStore((s) => s.desktopSidebarOpen);
  const setDesktopSidebarOpen = useAppStore((s) => s.setDesktopSidebarOpen);

  const router = useRouter();
  const supabase = createClient();

  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [orgs, setOrgs] = useState<
    { id: string; name: string; slug: string; plan: string; role: string }[]
  >([]);
  const activeOrgId = useAppStore((s) => s.selectedOrganizationId);
  const setActiveOrgId = useAppStore((s) => s.setOrganization);

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
        const currentActiveOrgId = useAppStore.getState().selectedOrganizationId;
        const isValid = data.organizations.some(o => o.id === currentActiveOrgId);
        
        if (!isValid && data.organizations.length > 0) {
          setActiveOrgId(data.organizations[0].id);
        }
      })
      .catch(() => {
        // api-client will handle 401→/login redirect automatically
      })
      .finally(() => setSessionLoading(false));
  }, [setActiveOrgId]);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
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

  // Show a minimal loading skeleton while session is being fetched
  if (sessionLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        <div className="relative z-10 flex flex-col items-center gap-8">
          {/* Logo */}
          <div className="flex h-24 w-24 items-center justify-center">
            <img src="/Logo.svg" alt="RoleSquare Logo" className="h-full w-full object-contain drop-shadow-md" />
          </div>
          
          {/* 3 shimmering dots */}
          <div className="flex gap-2.5">
            <div className="h-3 w-3 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
            <div className="h-3 w-3 rounded-full bg-primary/80 animate-pulse" style={{ animationDelay: "200ms", animationDuration: "1s" }} />
            <div className="h-3 w-3 rounded-full bg-primary animate-pulse" style={{ animationDelay: "400ms", animationDuration: "1s" }} />
          </div>
          
          {/* Loading text with animated dots */}
          <div className="text-sm font-semibold text-muted-foreground uppercase tracking-widest flex items-center">
            Loading Workspace
            <span className="flex w-6 justify-start ml-1">
              <span className="animate-pulse text-lg leading-none" style={{ animationDelay: "0ms", animationDuration: "1s" }}>.</span>
              <span className="animate-pulse text-lg leading-none" style={{ animationDelay: "200ms", animationDuration: "1s" }}>.</span>
              <span className="animate-pulse text-lg leading-none" style={{ animationDelay: "400ms", animationDuration: "1s" }}>.</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));
  const activeOrg = orgs.find((o) => o.id === activeOrgId) || orgs[0];

  const Sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
            <img src="/Logo.svg" alt="RoleSquare Logo" className="h-full w-full object-contain" />
          </div>
          <div className="flex flex-col leading-none truncate">
            <span className="text-lg font-black tracking-tight truncate">RoleSquare</span>
            <span className="text-[10px] font-medium text-muted-foreground truncate uppercase tracking-widest mt-0.5">Intelligent Workspace</span>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setSidebarOpen(false);
            setDesktopSidebarOpen(!desktopSidebarOpen);
          }}
        >
          {desktopSidebarOpen ? (
            <PanelLeftClose className="hidden lg:block h-4 w-4" />
          ) : (
            <PanelLeftOpen className="hidden lg:block h-4 w-4" />
          )}
          <PanelLeftClose className="block lg:hidden h-4 w-4" />
        </Button>
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
                const active = 
                  view === item.id ||
                  (item.id === "sources" && view === "source-builder") ||
                  (item.id === "datasets" && view === "dataset-detail");
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
                        ? "bg-sidebar-primary/15 border border-sidebar-primary/20 text-sidebar-primary shadow-sm backdrop-blur-xl"
                        : "border border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", active && "scale-110")} />
                    <span className="truncate">{item.label}</span>
                    {active && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}


      </nav>

      <SidebarJobsWidget />
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <CommandPalette />
      <KeyboardShortcutsDialog />
      {/* AI Assistant — floating button + slide-in panel */}
      <AssistantButton />
      <AssistantPanel />
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Mobile menu */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0" hideClose>
            {Sidebar}
          </SheetContent>
        </Sheet>
        
        {!desktopSidebarOpen && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="hidden lg:flex" 
            onClick={() => setDesktopSidebarOpen(true)}
          >
            <PanelLeftOpen className="h-5 w-5" />
            <span className="sr-only">Open sidebar</span>
          </Button>
        )}

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
          <NotificationsDropdown />
          <Tooltip><TooltipTrigger asChild><Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
                              }}
                            >
                              <HelpCircle className="h-4 w-4" />
                            </Button></TooltipTrigger><TooltipContent>Help & shortcuts (?)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={toggleTheme}>
                              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                            </Button></TooltipTrigger><TooltipContent>Toggle theme (Alt+T)</TooltipContent></Tooltip>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-2 flex items-center gap-2 rounded-md border border-border bg-background p-1 pr-2 hover:bg-accent hover:text-accent-foreground transition-colors">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={session?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
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
                <History className="mr-2 h-4 w-4" /> Audit logs
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
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside 
          className={cn(
            "hidden lg:flex flex-col border-r bg-sidebar overflow-x-hidden overflow-y-auto transition-all duration-300",
            desktopSidebarOpen ? "w-64" : "w-0 border-r-0"
          )}
        >
          <div className="w-64 h-full">{Sidebar}</div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div key={view} className="mx-auto max-w-7xl p-4 sm:p-4 lg:p-6 view-fade-in">
            {children}
          </div>
        </main>
      </div>

    </div>
  );
}
