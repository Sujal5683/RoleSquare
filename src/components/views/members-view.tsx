"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type {
  MemberDTO,
  Role,
  UserDTO,
} from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import {
  StatusBadge,
  RoleBadge,
  PlanBadge,
} from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DropdownMenuLabel,
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
import {
  Users,
  UserPlus,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Shield,
  Check,
  X,
  Crown,
  ChevronRight,
  Building2,
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

const ROLES: Role[] = ["owner", "admin", "manager", "member", "viewer"];

const CAPABILITIES = [
  { key: "create_sources", label: "Create sources" },
  { key: "edit_schemas", label: "Edit schemas" },
  { key: "approve_records", label: "Approve records" },
  { key: "share_datasets", label: "Share datasets" },
  { key: "manage_members", label: "Manage members" },
  { key: "view_audit", label: "View audit" },
  { key: "export_data", label: "Export data" },
] as const;

// Static permission matrix — rows = roles, columns = capabilities.
// `true` = granted, `false` = denied.
const PERMISSION_MATRIX: Record<Role, Record<string, boolean>> = {
  owner: {
    create_sources: true,
    edit_schemas: true,
    approve_records: true,
    share_datasets: true,
    manage_members: true,
    view_audit: true,
    export_data: true,
  },
  admin: {
    create_sources: true,
    edit_schemas: true,
    approve_records: true,
    share_datasets: true,
    manage_members: true,
    view_audit: true,
    export_data: true,
  },
  manager: {
    create_sources: true,
    edit_schemas: true,
    approve_records: true,
    share_datasets: true,
    manage_members: false,
    view_audit: true,
    export_data: true,
  },
  member: {
    create_sources: true,
    edit_schemas: false,
    approve_records: true,
    share_datasets: false,
    manage_members: false,
    view_audit: false,
    export_data: false,
  },
  viewer: {
    create_sources: false,
    edit_schemas: false,
    approve_records: false,
    share_datasets: false,
    manage_members: false,
    view_audit: false,
    export_data: false,
  },
};

// ── Main component ───────────────────────────────────────────────────────

export function MembersView() {
  const queryClient = useQueryClient();
  const selectedOrgId = useAppStore((s) => s.selectedOrganizationId);
  const setView = useAppStore((s) => s.setView);

  // Fetch session to discover orgs (fallback to first org when none selected)
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () =>
      api.get<{
        user: UserDTO;
        organizations: Array<{
          id: string;
          name: string;
          slug: string;
          plan: string;
          role: string;
          status: string;
        }>;
      }>("/api/session"),
  });

  // Resolve the active org id: prefer store (if valid), fall back to session's first org
  const isValidSelectedOrg = session?.organizations?.some(o => o.id === selectedOrgId);
  const activeOrgId =
    (selectedOrgId && isValidSelectedOrg) ? selectedOrgId : session?.organizations?.[0]?.id ?? null;

  const {
    data: members,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["organizations", activeOrgId, "members"],
    queryFn: () =>
      api.get<MemberDTO[]>(`/api/organizations/${activeOrgId}/members`),
    enabled: !!activeOrgId,
  });

  const activeOrg = session?.organizations?.find((o) => o.id === activeOrgId);

  // ── Mutations ──────────────────────────────────────────────────────────
  const changeRoleMutation = useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: Role;
    }) =>
      api.patch<MemberDTO>(
        `/api/organizations/${activeOrgId}/members/${memberId}`,
        { role }
      ),
    onSuccess: (m) => {
      toast.success("Role updated", {
        description: `${m.user.name ?? m.user.email} is now ${m.role}.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["organizations", activeOrgId, "members"],
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update role";
      toast.error("Update failed", { description: msg });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/api/organizations/${activeOrgId}/members/${memberId}`),
    onSuccess: () => {
      toast.success("Member removed");
      queryClient.invalidateQueries({
        queryKey: ["organizations", activeOrgId, "members"],
      });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setRemoveTarget(null);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to remove member";
      toast.error("Remove failed", { description: msg });
    },
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberDTO | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description={
          activeOrg
            ? `Manage members and their roles for ${activeOrg.name}. Use the permission matrix below as a reference for what each role can do.`
            : "Select an organization to manage its members."
        }
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching || !activeOrgId}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setInviteOpen(true)}
              disabled={!activeOrgId}
            >
              <UserPlus className="mr-2 h-3.5 w-3.5" />
              Invite member
            </Button>
          </div>
        }
      />

      {/* Active org context chip */}
      {activeOrg && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{activeOrg.name}</span>
              <code className="text-xs text-muted-foreground">{activeOrg.slug}</code>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <PlanBadge plan={activeOrg.plan} />
              <span className="text-xs text-muted-foreground">
                Your role:{" "}
                <RoleBadge role={activeOrg.role} />
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView("organizations")}
              >
                Switch org
                <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Permission matrix */}
      <PermissionMatrixCard />

      {/* Members table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team members</CardTitle>
          <CardDescription>
            {members
              ? `${members.length} member${members.length === 1 ? "" : "s"}`
              : "Loading members…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!activeOrgId ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="No organization selected"
              description="Pick an organization from the Organizations page to manage its members."
              action={
                <Button size="sm" onClick={() => setView("organizations")}>
                  <Building2 className="mr-2 h-3.5 w-3.5" />
                  Open organizations
                </Button>
              }
              className="mx-6 mb-6"
            />
          ) : isLoading ? (
            <div className="px-6 pb-6">
              <LoadingState rows={4} />
            </div>
          ) : isError ? (
            <div className="px-6 pb-6">
              <ErrorState
                message="Failed to load members"
                onRetry={() => refetch()}
              />
            </div>
          ) : !members || members.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No members yet"
              description="Invite your first team member to start collaborating."
              action={
                <Button size="sm" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="mr-2 h-3.5 w-3.5" />
                  Invite member
                </Button>
              }
              className="mx-6 mb-6"
            />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs font-medium">
                              {initials(m.user.name ?? m.user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium truncate">
                                {m.user.name ?? m.user.email.split("@")[0]}
                              </span>
                              {m.role === "owner" && (
                                <Crown className="h-3.5 w-3.5 text-amber-500" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {m.user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.role}
                          onValueChange={(v) =>
                            changeRoleMutation.mutate({
                              memberId: m.id,
                              role: v as Role,
                            })
                          }
                          disabled={
                            m.role === "owner" || changeRoleMutation.isPending
                          }
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r} className="capitalize">
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} />
                      </TableCell>
                      <TableCell
                        className="text-sm text-muted-foreground"
                        title={formatDate(m.createdAt)}
                      >
                        {relativeTime(m.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Member actions"
                              disabled={m.role === "owner"}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Change role</DropdownMenuLabel>
                            {ROLES.filter((r) => r !== m.role).map((r) => (
                              <DropdownMenuItem
                                key={r}
                                onClick={() =>
                                  changeRoleMutation.mutate({
                                    memberId: m.id,
                                    role: r,
                                  })
                                }
                              >
                                <span className="capitalize">{r}</span>
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setRemoveTarget(m)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <InviteMemberDialog
        orgId={activeOrgId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />

      {/* Remove confirmation */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {removeTarget?.user.name ?? removeTarget?.user.email}
              </span>{" "}
              from the organization. They will lose access to all sources,
              datasets, and audit history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMemberMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMemberMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removeTarget)
                  removeMemberMutation.mutate(removeTarget.id);
              }}
            >
              {removeMemberMutation.isPending ? "Removing…" : "Remove member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Permission matrix card ───────────────────────────────────────────────

function PermissionMatrixCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-primary" />
          Role &amp; permission matrix
        </CardTitle>
        <CardDescription>
          Reference for what each role can do within an organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="min-w-32">Role</TableHead>
              {CAPABILITIES.map((c) => (
                <TableHead key={c.key} className="text-center min-w-28">
                  <span className="text-xs leading-tight block">{c.label}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROLES.map((role) => (
              <TableRow key={role}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {role === "owner" && (
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    <RoleBadge role={role} />
                  </div>
                </TableCell>
                {CAPABILITIES.map((c) => {
                  const allowed = PERMISSION_MATRIX[role][c.key];
                  return (
                    <TableCell key={c.key} className="text-center">
                      {allowed ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <X className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Invite member dialog ─────────────────────────────────────────────────

function InviteMemberDialog({
  orgId,
  open,
  onClose,
}: {
  orgId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  const inviteMutation = useMutation({
    mutationFn: (payload: { email: string; role: Role }) =>
      api.post<MemberDTO>(
        `/api/organizations/${orgId}/members`,
        payload
      ),
    onSuccess: (m) => {
      toast.success("Invitation sent", {
        description: `${m.user.email} has been invited as ${m.role}.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "members"],
      });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setEmail("");
      setRole("member");
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to invite";
      toast.error("Invite failed", { description: msg });
    },
  });

  const handleSubmit = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }
    inviteMutation.mutate({ email: trimmed, role });
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
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Invite a teammate by email. If they don&apos;t have an account yet,
            we&apos;ll create one for them. They will start with the{" "}
            <span className="capitalize font-medium">{role}</span> role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.filter((r) => r !== "owner").map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Owners have full control. See the permission matrix above for
              what each role can do.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={inviteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!email.trim() || inviteMutation.isPending}
          >
            {inviteMutation.isPending ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-3.5 w-3.5" />
            )}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
