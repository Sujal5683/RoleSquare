"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { MailOpen, Building2, User, RefreshCw, Send, Check, X, Shield, Clock, SendHorizonal } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useActiveOrg } from "@/hooks/use-active-org";
import type { OrganizationDTO, MemberDTO } from "@/lib/types";

import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function InvitationsView() {
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invitations"
        description="Manage your incoming organization invites and track outgoing invites sent to others."
        icon={<MailOpen className="h-5 w-5" />}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-6">
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

  const { data: orgs, isLoading, isError, refetch } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<OrganizationDTO[]>("/api/organizations"),
  });

  const inviteMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "rejected" }) =>
      api.patch(`/api/organizations/${id}/members/me`, { status }),
    onSuccess: (_, variables) => {
      toast.success(`Invitation ${variables.status === "active" ? "accepted" : "declined"}`);
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update invitation";
      toast.error("Error", { description: msg });
    },
  });

  if (isLoading) return <LoadingState rows={3} />;
  if (isError) return <ErrorState message="Failed to load incoming invitations" onRetry={() => refetch()} />;

  const invites = orgs?.filter((o) => o.userStatus === "invited") ?? [];

  if (invites.length === 0) {
    return (
      <EmptyState
        icon={<MailOpen className="h-5 w-5" />}
        title="No incoming invitations"
        description="When someone invites you to an organization, it will appear here."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {invites.map((org) => (
        <Card key={org.id} className="flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="block text-left text-base font-semibold leading-tight truncate">
                  {org.name}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {org.slug}
                  </code>
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground mt-2">
            You have been invited to join this workspace.
          </div>

          <div className="mt-auto flex items-center gap-2 border-t pt-3">
            <Button
              className="flex-1"
              variant="outline"
              size="sm"
              disabled={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate({ id: org.id, status: "rejected" })}
            >
              <X className="mr-2 h-4 w-4" />
              Decline
            </Button>
            <Button
              className="flex-1"
              size="sm"
              disabled={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate({ id: org.id, status: "active" })}
            >
              <Check className="mr-2 h-4 w-4" />
              Accept
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Outgoing ─────────────────────────────────────────────────────────────

function OutgoingInvites() {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();

  const { data: members, isLoading, isError, refetch } = useQuery({
    queryKey: ["members", activeOrgId],
    queryFn: () => api.get<MemberDTO[]>(`/api/organizations/${activeOrgId}/members`),
    enabled: !!activeOrgId,
  });

  const revokeMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/api/organizations/${activeOrgId}/members/${memberId}`),
    onSuccess: () => {
      toast.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: ["members", activeOrgId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to revoke invitation";
      toast.error("Error", { description: msg });
    },
  });

  const resendMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.post(`/api/organizations/${activeOrgId}/members/${memberId}/resend`),
    onSuccess: () => {
      toast.success("Invitation resent successfully");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to resend invitation";
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

  const invites = members?.filter((m) => m.status === "invited") ?? [];

  if (invites.length === 0) {
    return (
      <EmptyState
        icon={<Send className="h-5 w-5" />}
        title="No outgoing invitations"
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
            <TableHead>Status</TableHead>
            <TableHead>Invited</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium leading-none">{m.user.name || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground mt-1">{m.user.email}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-sm">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="capitalize">{m.role}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100/80 dark:bg-amber-900/30 dark:text-amber-400">
                  Pending
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                </div>
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
                      onClick={() => resendMutation.mutate(m.id)}
                      disabled={resendMutation.isPending}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Resend Invite
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => revokeMutation.mutate(m.id)}
                      disabled={revokeMutation.isPending}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Revoke
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
