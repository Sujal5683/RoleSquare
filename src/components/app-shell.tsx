"use client";

import { useEffect, useState } from "react";
import { useAppStore, type SessionUser } from "@/lib/store";
import { api } from "@/lib/api-client";
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
  Bell,
  Sun,
  Moon,
  ChevronDown,
  Building2,
  Plus,
  HelpCircle,
  LogOut,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ViewId } from "@/lib/types";

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
  { id: "sharing", label: "Sharing Center", icon: Share2, group: "Governance" },
  { id: "organizations", label: "Organizations", icon: Building2, group: "Governance" },
  { id: "members", label: "Members", icon: Users, group: "Governance" },
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

  const [session, setSession] = useState<SessionUser | null>(null);
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
      .catch(() => {});
  }, []);

  // Landing page is rendered without the shell
  if (view === "landing") {
    return <>{children}</>;
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
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium">{activeOrg?.name ?? "Acme Intelligence"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {activeOrg?.plan ?? "free"} plan · {activeOrg?.role ?? "owner"} access
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
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

        {/* Search */}
        <div className="relative hidden md:block flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search sources, datasets, records…"
            className="w-full rounded-md border bg-background py-1.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" title="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Help">
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
              <DropdownMenuItem onClick={() => setView("landing")} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Back to landing
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
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      {/* Sticky footer */}
      <footer className="border-t bg-background px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p>
            <span className="font-medium text-foreground">Workspace Intelligence Platform</span>{" "}
            · Evidence-backed AI extraction for Google Workspace
          </p>
          <div className="flex items-center gap-4">
            <span>v1.0 · MVP</span>
            <span>·</span>
            <span>Acme Intelligence</span>
            <span>·</span>
            <a className="hover:text-foreground" href="#" onClick={(e) => { e.preventDefault(); setView("landing"); }}>
              About
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
