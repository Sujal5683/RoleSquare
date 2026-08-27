"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow, isPast } from "date-fns";
import {
  MailOpen, Building2, User, RefreshCw, Send, Check, X,
  Shield, Clock, SendHorizonal, AlertCircle, ChevronRight,
  LayoutGrid, List
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import type { InvitationDTO } from "@/lib/types";

import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { InviteMemberDialog } from "./invite-member-dialog";
import { UserPlus } from "lucide-react";

export function InvitationsView() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<InvitationDTO | null>(null);
  
  const activeOrgId = useActiveOrg();

  const resendMutation = useMutation({
    mutationFn: ({ orgId, email, role }: { orgId: string; email: string; role: string }) =>
      api.post(`/api/organizations/${orgId}/invitations`, { email, role }),
    onSuccess: () => {
      toast.success("Invitation resent successfully");
      queryClient.invalidateQueries({ queryKey: ["invitations", "outgoing", activeOrgId] });
      setSelectedInvite(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to resend invitation";
      toast.error("Error", { description: msg });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (token: string) =>
      api.post("/api/invitations/accept", { token }),
    onSuccess: () => {
      toast.success("Invitation accepted! You now have access to the organization.");
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      setSelectedInvite(null);
      setTimeout(() => window.location.reload(), 800);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to accept invitation";
      toast.error("Error", { description: msg });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (token: string) =>
      api.post("/api/invitations/decline", { token }),
    onSuccess: () => {
      toast.success("Invitation declined.");
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      setSelectedInvite(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to decline invitation";
      toast.error("Error", { description: msg });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invitations"
        description="Accept or decline invitations to join organizations, and manage invitations you've sent."
        icon={<MailOpen className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["invitations"] });
              }}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </div>
        }
      />

      <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="incoming">
              <MailOpen className="mr-2 h-4 w-4" />
              Incoming
            </TabsTrigger>
            <TabsTrigger value="outgoing">
              <SendHorizonal className="mr-2 h-4 w-4" />
              Outgoing
            </TabsTrigger>
          </TabsList>
          
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="shrink-0">
            <TabsList className="h-8 p-1">
              <TabsTrigger value="card" className="h-6 w-6 p-0" title="Grid view">
                <LayoutGrid className="h-3.5 w-3.5" />
              </TabsTrigger>
              <TabsTrigger value="list" className="h-6 w-6 p-0" title="List view">
                <List className="h-3.5 w-3.5" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <TabsContent value="incoming">
          <IncomingInvites onSelect={setSelectedInvite} viewMode={viewMode} />
        </TabsContent>

        <TabsContent value="outgoing">
          <OutgoingInvites onSelect={setSelectedInvite} viewMode={viewMode} />
        </TabsContent>
      </Tabs>

      <InvitationDetailsSheet
        invitation={selectedInvite}
        open={!!selectedInvite}
        type={tab}
        onOpenChange={(o) => { if (!o) setSelectedInvite(null); }}
        onAccept={(token) => acceptMutation.mutate(token)}
        onDecline={(token) => declineMutation.mutate(token)}
        onCancel={(token) => declineMutation.mutate(token)}
        onResend={(inv) => resendMutation.mutate({ orgId: inv.organizationId, email: inv.email, role: inv.role })}
      />
    </div>
  );
}

// ── Incoming ─────────────────────────────────────────────────────────────

function IncomingInvites({ onSelect, viewMode = "card" }: { onSelect: (inv: InvitationDTO) => void, viewMode?: "card" | "list" }) {
  const queryClient = useQueryClient();

  const { data: invitations, isLoading, isError, refetch } = useQuery({
    queryKey: ["invitations", "incoming"],
    queryFn: () => api.get<InvitationDTO[]>("/api/invitations"),
  });

  if (isLoading) return <LoadingState rows={3} />;
  if (isError) return <ErrorState message="Failed to load incoming invitations" onRetry={() => refetch()} />;

  const pendingInvites = (invitations ?? []).filter((i) => i.status === "pending");

  if (pendingInvites.length === 0) {
    return (
      <EmptyState
        icon={<MailOpen className="h-5 w-5" />}
        title="No pending invitations"
        description="When someone invites you to an organization, it will appear here."
      />
    );
  }

  if (viewMode === "list") {
    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Invited By</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingInvites.map((invite) => {
              const expired = isPast(new Date(invite.expiresAt));
              return (
                <TableRow
                  key={invite.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => onSelect(invite)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="font-medium">
                        {invite.organizationName ?? "Organization"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {invite.role}
                      </Badge>
                      {expired && <Badge variant="destructive">Expired</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {invite.inviterName ?? "Someone"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {!expired ? (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
                      </div>
                    ) : (
                      "Expired"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pendingInvites.map((invite) => {
        const expired = isPast(new Date(invite.expiresAt));
        return (
          <Card
            key={invite.id}
            className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-md cursor-pointer hover:border-primary/50"
            onClick={() => onSelect(invite)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-base font-semibold leading-tight truncate">
                    {invite.organizationName ?? "Organization"}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="capitalize text-xs">
                      {invite.role}
                    </Badge>
                    {expired && (
                      <Badge variant="destructive" className="text-xs">
                        Expired
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{invite.inviterName ?? "Someone"}</span> invited
              you to join as <span className="font-medium capitalize">{invite.role}</span>.
            </div>

            {!expired && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-auto pt-2">
                <Clock className="h-3 w-3" />
                Expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Outgoing ─────────────────────────────────────────────────────────────

function OutgoingInvites({ onSelect, viewMode = "list" }: { onSelect: (inv: InvitationDTO) => void, viewMode?: "card" | "list" }) {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();

  const { data: invitations, isLoading, isError, refetch } = useQuery({
    queryKey: ["invitations", "outgoing", activeOrgId],
    queryFn: () =>
      api.get<InvitationDTO[]>(`/api/invitations?organizationId=${activeOrgId}`),
    enabled: !!activeOrgId,
  });

  const resendMutation = useMutation({
    mutationFn: ({ orgId, email, role }: { orgId: string; email: string; role: string }) =>
      api.post(`/api/organizations/${orgId}/invitations`, { email, role }),
    onSuccess: () => {
      toast.success("Invitation resent successfully");
      queryClient.invalidateQueries({ queryKey: ["invitations", "outgoing", activeOrgId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to resend invitation";
      toast.error("Error", { description: msg });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (token: string) =>
      api.post("/api/invitations/decline", { token }),
    onSuccess: () => {
      toast.success("Invitation cancelled");
      queryClient.invalidateQueries({ queryKey: ["invitations", "outgoing", activeOrgId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to cancel invitation";
      toast.error("Error", { description: msg });
    },
  });

  if (!activeOrgId) {
    return (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title="No Organization Selected"
        description="Select an organization to view its outgoing invitations."
      />
    );
  }

  if (isLoading) return <LoadingState rows={3} />;
  if (isError) return <ErrorState message="Failed to load outgoing invitations" onRetry={() => refetch()} />;

  const pending = (invitations ?? []).filter((i) => i.status === "pending");

  if (pending.length === 0) {
    return (
      <EmptyState
        icon={<Send className="h-5 w-5" />}
        title="No pending outgoing invitations"
        description="Invitations you send to new members will appear here until they accept."
      />
    );
  }

  if (viewMode === "card") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pending.map((inv) => {
          const expired = isPast(new Date(inv.expiresAt));
          return (
            <Card
              key={inv.id}
              className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-md cursor-pointer hover:border-primary/50 relative"
              onClick={() => onSelect(inv)}
            >
              <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-50 hover:opacity-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        resendMutation.mutate({
                          orgId: activeOrgId,
                          email: inv.email,
                          role: inv.role,
                        })
                      }
                      disabled={resendMutation.isPending}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Resend Invite
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => cancelMutation.mutate(inv.token)}
                      disabled={cancelMutation.isPending}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel Invite
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-start justify-between gap-2 pt-2">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 space-y-1 pr-6">
                    <div className="text-base font-semibold leading-tight truncate">
                      {inv.email}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="capitalize text-xs">
                        {inv.role}
                      </Badge>
                      {expired && (
                        <Badge variant="destructive" className="text-xs">
                          Expired
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-auto pt-2">
                <Clock className="h-3 w-3" />
                Sent {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invitee</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.map((inv) => {
            const expired = isPast(new Date(inv.expiresAt));
            return (
              <TableRow
                key={inv.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => onSelect(inv)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="font-medium">{inv.email}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="capitalize">{inv.role}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            resendMutation.mutate({
                              orgId: activeOrgId,
                              email: inv.email,
                              role: inv.role,
                            })
                          }
                          disabled={resendMutation.isPending}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Resend Invite
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => cancelMutation.mutate(inv.token)}
                          disabled={cancelMutation.isPending}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancel Invite
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function InvitationDetailsSheet({
  invitation,
  open,
  type = "incoming",
  onOpenChange,
  onAccept,
  onDecline,
  onCancel,
  onResend,
}: {
  invitation: InvitationDTO | null;
  open: boolean;
  type?: "incoming" | "outgoing";
  onOpenChange: (o: boolean) => void;
  onAccept?: (token: string) => void;
  onDecline?: (token: string) => void;
  onCancel?: (token: string) => void;
  onResend?: (inv: InvitationDTO) => void;
}) {
  if (!invitation) return null;
  
  const expired = isPast(new Date(invitation.expiresAt));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Invitation Details</SheetTitle>
          <SheetDescription>
            Detailed information about this invitation.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6 flex-1">
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-muted-foreground">Recipient Email</h4>
            <p className="text-sm font-medium">{invitation.email}</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-muted-foreground">Organization</h4>
            <p className="text-sm font-medium">{invitation.organizationName ?? invitation.organizationId}</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-muted-foreground">Role</h4>
            <Badge variant="outline" className="capitalize">{invitation.role}</Badge>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
            <Badge variant={invitation.status === "pending" ? "default" : "secondary"} className="capitalize">
              {invitation.status}
            </Badge>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-muted-foreground">Sent By</h4>
            <p className="text-sm font-medium">{invitation.inviterName ?? invitation.invitedBy}</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-muted-foreground">Created At</h4>
            <p className="text-sm font-medium">{new Date(invitation.createdAt).toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-muted-foreground">Expires At</h4>
            <p className="text-sm font-medium text-destructive">{new Date(invitation.expiresAt).toLocaleString()}</p>
          </div>
        </div>

        {invitation.status === "pending" && type === "incoming" && onAccept && onDecline && (
          <div className="mt-8 flex items-center gap-2 border-t pt-4">
            <Button
              className="flex-1"
              variant="outline"
              disabled={expired}
              onClick={() => onDecline(invitation.token)}
            >
              <X className="mr-2 h-4 w-4" />
              Decline
            </Button>
            <Button
              className="flex-1"
              disabled={expired}
              onClick={() => onAccept(invitation.token)}
            >
              <Check className="mr-2 h-4 w-4" />
              Accept
            </Button>
          </div>
        )}

        {invitation.status === "pending" && type === "outgoing" && onCancel && onResend && (
          <div className="mt-8 flex items-center gap-2 border-t pt-4">
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => onCancel(invitation.token)}
            >
              <X className="mr-2 h-4 w-4" />
              Cancel Invite
            </Button>
            <Button
              className="flex-1"
              onClick={() => onResend(invitation)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Resend Invite
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
