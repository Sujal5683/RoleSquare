"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Share2, Users, Download, Upload, Clock, ShieldCheck, Building2,
  User, Loader2, MoreHorizontal, Trash2, CheckCircle2, XCircle,
  Plus, Database, ArrowUpRight,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import type { DatasetAccessDTO, SharingRequestDTO, DatasetDTO } from "@/lib/types";

import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { NewShareRequestDialog } from "@/components/sharing/new-share-request-dialog";

// ── Types ────────────────────────────────────────────────────────────────

interface PermissionsResponse {
  owned: DatasetAccessDTO[];
  received: DatasetAccessDTO[];
}

// ── Level badge helper ───────────────────────────────────────────────────

function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    owner: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    read: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    comment: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    edit: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  };
  return (
    <Badge className={`capitalize ${map[level] ?? ""}`}>
      {level === "read" ? "Viewer" : level === "comment" ? "Commenter" : level === "edit" ? "Editor" : level}
    </Badge>
  );
}

function GranteeCell({ access }: { access: DatasetAccessDTO }) {
  if (access.granteeOrgId) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
          <Building2 className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-sm font-medium">{access.granteeOrgName ?? "Unknown org"}</div>
          <div className="text-xs text-muted-foreground">Organization</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <User className="h-3.5 w-3.5" />
      </div>
      <div>
        <div className="text-sm font-medium">{access.granteeUserName ?? access.granteeUserEmail ?? "Unknown user"}</div>
        <div className="text-xs text-muted-foreground">{access.granteeUserEmail}</div>
      </div>
    </div>
  );
}

// ── Main View ────────────────────────────────────────────────────────────

export function SharingView() {
  const [tab, setTab] = useState("received");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<DatasetDTO | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Sharing Center"
          description="Manage dataset sharing with users and organizations."
          icon={<Share2 className="h-5 w-5" />}
        />
        <Button onClick={() => setShareDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Share a Dataset
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="received">
            <Download className="mr-2 h-4 w-4" />
            Shared with me
          </TabsTrigger>
          <TabsTrigger value="owned">
            <Upload className="mr-2 h-4 w-4" />
            Shared by me
          </TabsTrigger>
          <TabsTrigger value="requests">
            <Clock className="mr-2 h-4 w-4" />
            Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received">
          <ReceivedTab />
        </TabsContent>

        <TabsContent value="owned">
          <OwnedTab onShare={(ds) => { setSelectedDataset(ds); setShareDialogOpen(true); }} />
        </TabsContent>

        <TabsContent value="requests">
          <RequestsTab />
        </TabsContent>
      </Tabs>

      <NewShareRequestDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        dataset={selectedDataset}
      />
    </div>
  );
}

// ── Tab: Shared with me ──────────────────────────────────────────────────

function ReceivedTab() {
  const activeOrgId = useActiveOrg();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sharing-permissions", activeOrgId, "received"],
    queryFn: () =>
      api.get<PermissionsResponse>(
        `/api/sharing/permissions?organizationId=${activeOrgId}&view=received`
      ),
    enabled: !!activeOrgId,
  });

  if (!activeOrgId) return <EmptyState icon={<Building2 className="h-5 w-5" />} title="No organization selected" description="" />;
  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load shared datasets" onRetry={() => refetch()} />;

  const received = data?.received ?? [];
  if (received.length === 0) {
    return (
      <EmptyState
        icon={<Download className="h-5 w-5" />}
        title="No datasets shared with you"
        description="When someone shares a dataset with you or your organization, it will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {received.map((access) => (
        <Card key={access.id} className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
            <Database className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{access.datasetName ?? access.datasetId}</div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {access.ownerOrgName ?? "Unknown org"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                Shared {formatDistanceToNow(new Date(access.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          <LevelBadge level={access.level} />
        </Card>
      ))}
    </div>
  );
}

// ── Tab: Shared by me ────────────────────────────────────────────────────

function OwnedTab({ onShare }: { onShare: (ds: DatasetDTO) => void }) {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sharing-permissions", activeOrgId, "owned"],
    queryFn: () =>
      api.get<PermissionsResponse>(
        `/api/sharing/permissions?organizationId=${activeOrgId}&view=owned`
      ),
    enabled: !!activeOrgId,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete("/api/sharing/permissions", { id }),
    onSuccess: () => {
      toast.success("Access revoked");
      queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] });
    },
    onError: (err: unknown) => {
      toast.error("Failed to revoke", { description: err instanceof Error ? err.message : undefined });
    },
  });

  if (!activeOrgId) return <EmptyState icon={<Building2 className="h-5 w-5" />} title="No organization selected" description="" />;
  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="Failed to load shared-out datasets" onRetry={() => refetch()} />;

  const owned = (data?.owned ?? []).filter((a) => a.status === "active");

  if (owned.length === 0) {
    return (
      <EmptyState
        icon={<Upload className="h-5 w-5" />}
        title="You haven't shared any datasets yet"
        description='Use the "Share a Dataset" button above to give others access to your data.'
      />
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dataset</TableHead>
            <TableHead>Shared with</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>Granted</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {owned.map((access) => (
            <TableRow key={access.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{access.datasetName ?? access.datasetId}</span>
                </div>
              </TableCell>
              <TableCell>
                <GranteeCell access={access} />
              </TableCell>
              <TableCell>
                <LevelBadge level={access.level} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(access.createdAt), { addSuffix: true })}
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
                      className="text-destructive focus:text-destructive"
                      onClick={() => revokeMutation.mutate(access.id)}
                      disabled={revokeMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Revoke access
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

// ── Tab: Requests ────────────────────────────────────────────────────────

function RequestsTab() {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["cross-org-shares", activeOrgId],
    queryFn: () =>
      api.get<{ outgoing: SharingRequestDTO[]; incoming: SharingRequestDTO[] }>(
        `/api/sharing/cross-org?organizationId=${activeOrgId}`
      ),
    enabled: !!activeOrgId,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/sharing/requests/${id}/approve`, {}),
    onSuccess: () => {
      toast.success("Request approved");
      queryClient.invalidateQueries({ queryKey: ["cross-org-shares"] });
      queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] });
    },
    onError: (err: unknown) => {
      toast.error("Failed to approve", { description: err instanceof Error ? err.message : undefined });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/sharing/requests/${id}/reject`, {}),
    onSuccess: () => {
      toast.success("Request rejected");
      queryClient.invalidateQueries({ queryKey: ["cross-org-shares"] });
    },
    onError: (err: unknown) => {
      toast.error("Failed to reject", { description: err instanceof Error ? err.message : undefined });
    },
  });

  if (!activeOrgId) return <EmptyState icon={<Building2 className="h-5 w-5" />} title="No organization selected" description="" />;
  if (isLoading) return <LoadingState rows={3} />;
  if (isError) return <ErrorState message="Failed to load sharing requests" onRetry={() => refetch()} />;

  const outgoing = data?.outgoing ?? [];
  const incoming = data?.incoming ?? [];
  const pendingIncoming = incoming.filter((r) => r.status === "pending");

  if (outgoing.length === 0 && incoming.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-5 w-5" />}
        title="No sharing requests"
        description="Requests to access or share datasets with other organizations appear here."
      />
    );
  }

  function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
      pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    return <Badge className={`capitalize ${map[status] ?? ""}`}>{status}</Badge>;
  }

  return (
    <div className="space-y-6">
      {pendingIncoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <Download className="h-4 w-4" /> Incoming Requests
          </h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingIncoming.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.datasetName ?? r.datasetId}</TableCell>
                    <TableCell>
                      <div className="text-sm">{r.requesterName ?? r.requestedBy}</div>
                      {r.requesterEmail && (
                        <div className="text-xs text-muted-foreground">{r.requesterEmail}</div>
                      )}
                    </TableCell>
                    <TableCell><LevelBadge level={r.level} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                          onClick={() => approveMutation.mutate(r.id)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => rejectMutation.mutate(r.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <Upload className="h-4 w-4" /> Outgoing Requests / Grants
          </h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Shared with</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outgoing.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.datasetName ?? r.datasetId}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {r.targetOrganizationName ?? r.targetOrganizationId ?? r.targetEmail ?? r.targetUserId ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell><LevelBadge level={r.level} /></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
