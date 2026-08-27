"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { OrganizationDTO, MemberDTO, Plan } from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { PlanBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronRight,
  Users,
  Calendar,
  Search,
  FileSpreadsheet,
  LayoutGrid,
  LayoutList,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const PLAN_OPTIONS: { value: Plan; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "team", label: "Team" },
  { value: "enterprise", label: "Enterprise" },
];

const COLORS = [
  "bg-red-500/15 text-red-700 dark:text-red-400",
  "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "bg-green-500/15 text-green-700 dark:text-green-400",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400",
  "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  "bg-rose-500/15 text-rose-700 dark:text-rose-400",
];

function getAvatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

import { OrgSheetsWizard } from "@/components/google-sheets/org-sheets-wizard";

function OrgSheetsWrapper({
  orgId,
  open,
  onOpenChange,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: datasets } = useQuery({
    queryKey: ["datasets", orgId],
    queryFn: () => api.get<any[]>(`/api/datasets?organizationId=${orgId}`),
    enabled: !!orgId && open,
  });

  return (
    <OrgSheetsWizard
      open={open}
      onOpenChange={onOpenChange}
      datasets={(datasets ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        recordCount: d.recordCount || 0,
      }))}
      organizationId={orgId}
    />
  );
}

// ── Main component ───────────────────────────────────────────────────────

export function OrganizationsView() {
  const queryClient = useQueryClient();
  const setOrganization = useAppStore((s) => s.setOrganization);
  const setView = useAppStore((s) => s.setView);
  const selectedOrganizationId = useAppStore((s) => s.selectedOrganizationId);

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrganizationDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizationDTO | null>(null);
  const [connectSheetsOrg, setConnectSheetsOrg] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");

  // ── Queries ────────────────────────────────────────────────────────────
  const {
    data: orgs,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<OrganizationDTO[]>("/api/organizations"),
  });

  // Fetch members per org (small N — fan out in parallel)
  const orgIds = useMemo(() => (orgs ?? []).map((o) => o.id), [orgs]);
  const { data: membersByOrg } = useQuery({
    queryKey: ["organizations", "members", orgIds],
    queryFn: async () => {
      const results: Record<string, MemberDTO[]> = {};
      await Promise.all(
        orgIds.map(async (id) => {
          try {
            const list = await api.get<MemberDTO[]>(
              `/api/organizations/${id}/members`
            );
            results[id] = list;
          } catch {
            results[id] = [];
          }
        })
      );
      return results;
    },
    enabled: orgIds.length > 0,
  });

  // ── Delete mutation ────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/organizations/${id}`),
    onSuccess: () => {
      toast.success("Organization deleted");
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to delete org";
      toast.error("Delete failed", { description: msg });
    },
  });

  // ── Invite mutation ────────────────────────────────────────────────────
  const inviteMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "rejected" }) =>
      api.patch(`/api/organizations/${id}/members/me`, { status }),
    onSuccess: () => {
      toast.success("Invitation updated");
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update invitation";
      toast.error("Error", { description: msg });
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!orgs) return [];
    let result = orgs;

    if (filterRole !== "all") {
      result = result.filter((o) => o.userRole === filterRole);
    }
    if (filterPlan !== "all") {
      result = result.filter((o) => o.plan === filterPlan);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.slug.toLowerCase().includes(q) ||
          o.plan.toLowerCase().includes(q)
      );
    }

    return result;
  }, [orgs, search, filterRole, filterPlan]);

  const handleOpen = (org: OrganizationDTO) => {
    setOrganization(org.id);
    setView("members");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Organizations"
        description="Manage the workspaces you belong to. Each organization has its own sources, datasets, members, and sharing policies."
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New organization
            </Button>
          </div>
        }
      />

      {/* Search */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, slug, or plan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-row gap-2">
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPlan} onValueChange={setFilterPlan}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="ml-auto shrink-0">
              <TabsList className="h-8 p-1">
                <TabsTrigger value="card" className="h-6 w-6 p-0" title="Grid view">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="list" className="h-6 w-6 p-0" title="List view">
                  <LayoutList className="h-3.5 w-3.5" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <LoadingState rows={3} />
        </div>
      ) : isError ? (
        <ErrorState
          message="Failed to load organizations"
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title={
            orgs && orgs.length > 0
              ? "No organizations match your search"
              : "No organizations yet"
          }
          description={
            orgs && orgs.length > 0
              ? "Try adjusting your search query."
              : "Create your first organization to start ingesting sources and building datasets."
          }
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New organization
            </Button>
          }
        />
      ) : (
        <div className={viewMode === "list" ? "flex flex-col gap-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
          {filtered.map((org) => {
            const members = membersByOrg?.[org.id] ?? [];
            const firstThree = members.slice(0, 3);
            const extra = Math.max(0, members.length - 3);
            return (
              <Card
                key={org.id}
                onClick={() => setOrganization(org.id)}
                className={`flex p-4 transition-all hover:shadow-md cursor-pointer ${
                  selectedOrganizationId === org.id
                    ? "border-primary ring-1 ring-primary shadow-sm"
                    : ""
                } ${viewMode === "list" ? "flex-row gap-4" : "flex-col gap-3"}`}
              >
                <div className="flex flex-1 min-w-0 gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 w-full">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen(org);
                          }}
                          className="block text-left text-base font-semibold leading-tight truncate hover:underline w-full"
                          title={org.name}
                        >
                          {org.name}
                        </button>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          {selectedOrganizationId === org.id && (
                            <Badge variant="secondary" className="font-normal text-[10px] px-1.5 py-0 h-5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              Active
                            </Badge>
                          )}
                          <PlanBadge plan={org.plan} />
                          <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {org.slug}
                          </code>
                          {org.userStatus === "invited" && (
                            <span className="text-[10px] font-medium text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                              Pending Invite
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Non-list right side actions */}
                      {viewMode !== "list" && org.userStatus !== "invited" && (
                        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 shrink-0 ml-2">
                          {/* Members icon */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            aria-label="View members"
                            title="View members"
                            onClick={() => {
                              setOrganization(org.id);
                              setView("members");
                            }}
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Organization actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => setEditTarget(org)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpen(org)}>
                                <Users className="mr-2 h-4 w-4" />
                                Members
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConnectSheetsOrg(org.id)}>
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                                Connect to Google Sheets
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(org)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>

                    {/* Member avatars */}
                    <div className="flex items-center gap-2">
                      {firstThree.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No members yet
                        </span>
                      ) : (
                        <>
                          <div className="flex -space-x-2">
                            {firstThree.map((m) => (
                              <Avatar
                                key={m.id}
                                className="relative h-7 w-7 border-2 border-background ring-1 ring-border/50 transition-transform hover:z-10 hover:scale-110"
                                title={m.user.name ?? m.user.email}
                              >
                                <AvatarFallback className={`text-[10px] font-medium ${getAvatarColor(m.user.name ?? m.user.email)}`}>
                                  {initials(m.user.name ?? m.user.email)}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          {extra > 0 && (
                            <span className="text-xs text-muted-foreground">
                              +{extra} more
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span className="tabular-nums font-medium text-foreground">
                          {org.memberCount ?? members.length}
                        </span>{" "}
                        member(s)
                      </span>
                      <span
                        className="inline-flex items-center gap-1"
                        title={formatDate(org.createdAt)}
                      >
                        <Calendar className="h-3 w-3" />
                        {relativeTime(org.createdAt)}
                      </span>
                    </div>

                    {/* Footer for non-list OR embedded inside for list */}
                    <div className={`flex items-center justify-between ${viewMode === "list" ? "pt-1" : "border-t pt-3 w-full"}`}>
                      <div>
                        {org.userRole && (
                          <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0 h-5 capitalize">
                            {org.userRole}
                          </Badge>
                        )}
                      </div>
                      {viewMode !== "list" && (
                        <div className="flex gap-2">
                          {org.userStatus === "invited" ? (
                            <>
                              <Button variant="outline" size="sm" disabled={inviteMutation.isPending} onClick={(e) => { e.stopPropagation(); inviteMutation.mutate({ id: org.id, status: "rejected" }); }}>Decline</Button>
                              <Button size="sm" disabled={inviteMutation.isPending} onClick={(e) => { e.stopPropagation(); inviteMutation.mutate({ id: org.id, status: "active" }); }}>Accept</Button>
                            </>
                          ) : (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleOpen(org); }}>
                              Open <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sidebar actions specifically for list view */}
                {viewMode === "list" && (
                  <div className="flex flex-col items-end justify-between shrink-0 pl-4 border-l" onClick={(e) => e.stopPropagation()}>
                    {org.userStatus !== "invited" ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label="View members"
                          title="View members"
                          onClick={() => {
                            setOrganization(org.id);
                            setView("members");
                          }}
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Organization actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => setEditTarget(org)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpen(org)}>
                            <Users className="mr-2 h-4 w-4" />
                            Members
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConnectSheetsOrg(org.id)}>
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Connect to Google Sheets
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(org)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : (
                      <div />
                    )}
                    <div className="flex gap-2 mt-4">
                      {org.userStatus === "invited" ? (
                        <>
                          <Button variant="outline" size="sm" disabled={inviteMutation.isPending} onClick={() => inviteMutation.mutate({ id: org.id, status: "rejected" })}>Decline</Button>
                          <Button size="sm" disabled={inviteMutation.isPending} onClick={() => inviteMutation.mutate({ id: org.id, status: "active" })}>Accept</Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleOpen(org)}>
                          Open <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <CreateOrgDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Edit dialog */}
      <EditOrgDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              and remove all of its members, sources, datasets, and audit
              history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete organization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sheets Wizard */}
      {connectSheetsOrg && (
        <OrgSheetsWrapper
          open={!!connectSheetsOrg}
          onOpenChange={(open) => !open && setConnectSheetsOrg(null)}
          orgId={connectSheetsOrg}
        />
      )}
    </div>
  );
}

// ── Create dialog ────────────────────────────────────────────────────────

function CreateOrgDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState<Plan>("free");

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      slug: string;
      plan: string;
    }) => api.post<OrganizationDTO>("/api/organizations", payload),
    onSuccess: (o) => {
      toast.success("Organization created", { description: o.name });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setName("");
      setSlug("");
      setPlan("free");
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to create org";
      toast.error("Create failed", { description: msg });
    },
  });

  const handleNameChange = (v: string) => {
    setName(v);
    // Auto-fill slug while user has not customised it
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(v));
    }
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedSlug = (slug.trim() || slugify(trimmedName)).trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    if (!trimmedSlug) {
      toast.error("Slug is required");
      return;
    }
    createMutation.mutate({ name: trimmedName, slug: trimmedSlug, plan });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
          <DialogDescription>
            Create a workspace to group sources, datasets, and members. You
            will become the owner of the new organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="org-name"
              placeholder="e.g. Acme Intelligence"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              placeholder="acme-intelligence"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Used in URLs and as a unique identifier. Lowercase letters,
              numbers, and hyphens only.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Select
              value={plan}
              onValueChange={(v) => setPlan(v as Plan)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-2 h-3.5 w-3.5" />
            )}
            Create organization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog ──────────────────────────────────────────────────────────

function EditOrgDialog({
  target,
  onClose,
}: {
  target: OrganizationDTO | null;
  onClose: () => void;
}) {
  // We render an inner form that is keyed by the target id, so when the
  // target changes React remounts the form component and its useState
  // initialisers run with the new target's values — no useEffect required.
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {target ? (
          <EditOrgForm key={target.id} target={target} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditOrgForm({
  target,
  onClose,
}: {
  target: OrganizationDTO;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(target.name);
  const [slug, setSlug] = useState(target.slug);
  const [plan, setPlan] = useState<Plan>(target.plan);

  const editMutation = useMutation({
    mutationFn: (payload: { name?: string; slug?: string; plan?: string }) =>
      api.patch<OrganizationDTO>(`/api/organizations/${target.id}`, payload),
    onSuccess: (o) => {
      toast.success("Organization updated", { description: o.name });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update org";
      toast.error("Update failed", { description: msg });
    },
  });

  const handleSubmit = () => {
    const trimmed = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    if (!trimmedSlug) {
      toast.error("Slug is required");
      return;
    }
    editMutation.mutate({ name: trimmed, slug: trimmedSlug, plan });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit organization</DialogTitle>
        <DialogDescription>
          Update the name, slug, or plan for{" "}
          <span className="font-medium text-foreground">{target.name}</span>.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-org-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="edit-org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-org-slug">
            Slug <span className="text-destructive">*</span>
          </Label>
          <Input
            id="edit-org-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="e.g. acme-corp"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Select value={plan} onValueChange={(v) => setPlan(v as Plan)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={onClose}
          disabled={editMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!name.trim() || editMutation.isPending}
        >
          {editMutation.isPending ? (
            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Pencil className="mr-2 h-3.5 w-3.5" />
          )}
          Save changes
        </Button>
      </DialogFooter>
    </>
  );
}
