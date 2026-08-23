"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow, isPast } from "date-fns";
import {
  MailOpen, Building2, User, RefreshCw, Send, Check, X,
  Shield, Clock, SendHorizonal, AlertCircle, ChevronRight,
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

export function InvitationsView() {
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invitations"
        description="Accept or decline invitations to join organizations, and manage invitations you've sent."
        icon={<MailOpen className="h-5 w-5" />}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
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

        <TabsContent value="incoming">
          <IncomingInvites />
        </TabsContent>

        <TabsContent value="outgoing">
          <OutgoingInvites />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Incoming ─────────────────────────────────────────────────────────────

function IncomingInvites() {
  const queryClient = useQueryClient();

  const { data: invitations, isLoading, isError, refetch } = useQuery({
    queryKey: ["invitations", "incoming"],
    queryFn: () => api.get<InvitationDTO[]>("/api/invitations"),
  });

  const acceptMutation = useMutation({
    mutationFn: (token: string) =>
      api.post("/api/invitations/accept", { token }),
    onSuccess: () => {
      toast.success("Invitation accepted! You now have access to the organization.");
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      // Reload page so new org context is available
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
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to decline invitation";
      toast.error("Error", { description: msg });
    },
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

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pendingInvites.map((invite) => {
        const expired = isPast(new Date(invite.expiresAt));
        return (
          <Card key={invite.id} className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-md">
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
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
              </div>
            )}

            <div className="mt-auto flex items-center gap-2 border-t pt-3">
              <Button
                className="flex-1"
                variant="outline"
                size="sm"
                disabled={declineMutation.isPending || acceptMutation.isPending || expired}
                onClick={() => declineMutation.mutate(invite.token)}
              >
                <X className="mr-2 h-4 w-4" />
                Decline
              </Button>
              <Button
                className="flex-1"
                size="sm"
                disabled={declineMutation.isPending || acceptMutation.isPending || expired}
                onClick={() => acceptMutation.mutate(invite.token)}
              >
                <Check className="mr-2 h-4 w-4" />
                Accept
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Outgoing ─────────────────────────────────────────────────────────────

function OutgoingInvites() {
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
              <TableRow key={inv.id}>
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
                          {expired ? (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}
                            </>
                          )}
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
