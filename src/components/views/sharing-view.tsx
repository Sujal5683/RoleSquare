"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type {
  DatasetDTO,
  SharingPermissionDTO,
  SharingRequestDTO,
} from "@/lib/types";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui/page-elements";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Share2,
  Inbox,
  Send,
  Database,
  Network,
  Plus,
  RefreshCw,
  Check,
  X,
  Trash2,
  ChevronRight,
  Filter,
  Eye,
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

const LEVEL_OPTIONS = [
  { value: "read", label: "Read" },
  { value: "comment", label: "Comment" },
  { value: "edit", label: "Edit" },
  { value: "admin", label: "Admin" },
];

function levelBadge(level: string) {
  const variant: "default" | "secondary" | "outline" =
    level === "admin"
      ? "default"
      : level === "edit"
        ? "secondary"
        : level === "comment"
          ? "secondary"
          : "outline";
  return (
    <Badge variant={variant} className="capitalize font-medium">
      {level}
    </Badge>
  );
}

function summarizeFieldScope(
  scope: Record<string, unknown> | null
): string {
  if (!scope) return "All fields";
  if (Array.isArray(scope)) return `${scope.length} field(s) included`;
  const keys = Object.keys(scope);
  if (keys.length === 0) return "All fields";
  const excluded = scope.exclude;
  if (Array.isArray(excluded)) {
    return `Exclude: ${excluded.slice(0, 3).join(", ")}${excluded.length > 3 ? ` +${excluded.length - 3}` : ""}`;
  }
  return `${keys.length} field(s) scoped`;
}

function summarizeRowFilter(filter: Record<string, unknown> | null): string {
  if (!filter) return "All rows";
  const keys = Object.keys(filter);
  if (keys.length === 0) return "All rows";
  return keys
    .slice(0, 2)
    .map((k) => `${k}=${String(filter[k])}`)
    .join(", ") + (keys.length > 2 ? ` +${keys.length - 2}` : "");
}

import { useActiveOrg } from "@/hooks/use-active-org";

// ── Main component ───────────────────────────────────────────────────────

export function SharingView() {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();
  const [tab, setTab] = useState("incoming");
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] =
    useState<SharingPermissionDTO | null>(null);
  const [manageDataset, setManageDataset] = useState<{
    datasetId: string;
    datasetName: string;
  } | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────
  const {
    data: requests,
    isLoading: reqLoading,
    isError: reqError,
    refetch: refetchRequests,
    isFetching: reqFetching,
  } = useQuery({
    queryKey: ["sharing", "requests", activeOrgId],
    queryFn: () =>
      api.get<SharingRequestDTO[]>("/api/sharing/requests"),
    enabled: !!activeOrgId,
  });

  const {
    data: permissions,
    isLoading: permLoading,
    isError: permError,
    refetch: refetchPermissions,
    isFetching: permFetching,
  } = useQuery({
    queryKey: ["sharing", "permissions", activeOrgId],
    queryFn: () =>
      api.get<SharingPermissionDTO[]>("/api/sharing/permissions"),
    enabled: !!activeOrgId,
  });

  // Datasets list — used in the new-share dialog dropdown
  const { data: datasets } = useQuery({
    queryKey: ["datasets", activeOrgId],
    queryFn: () => api.get<DatasetDTO[]>("/api/datasets"),
    enabled: !!activeOrgId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<SharingRequestDTO>(`/api/sharing/requests/${id}/approve`),
    onSuccess: (r) => {
      toast.success("Request approved", {
        description: `Dataset share is now active at ${r.level} level.`,
      });
      queryClient.invalidateQueries({ queryKey: ["sharing"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to approve";
      toast.error("Approve failed", { description: msg });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<SharingRequestDTO>(`/api/sharing/requests/${id}/reject`),
    onSuccess: () => {
      toast.success("Request rejected");
      queryClient.invalidateQueries({ queryKey: ["sharing"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to reject";
      toast.error("Reject failed", { description: msg });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete<void>("/api/sharing/permissions", { id }),
    onSuccess: () => {
      toast.success("Share revoked");
      queryClient.invalidateQueries({ queryKey: ["sharing"] });
      setRevokeTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to revoke";
      toast.error("Revoke failed", { description: msg });
    },
  });

  // Aggregate permissions by dataset for the Shared Assets tab
  const sharedAssets = useMemo(() => {
    if (!permissions) return [];
    const map = new Map<
      string,
      { datasetId: string; datasetName: string; permissions: SharingPermissionDTO[] }
    >();
    for (const p of permissions) {
      const key = p.datasetId;
      if (!map.has(key)) {
        map.set(key, {
          datasetId: p.datasetId,
          datasetName: p.datasetName ?? "Untitled dataset",
          permissions: [],
        });
      }
      map.get(key)!.permissions.push(p);
    }
    return Array.from(map.values());
  }, [permissions]);

  // Stats
  const pendingCount = (requests ?? []).filter(
    (r) => r.status === "pending"
  ).length;
  const activeShareCount = (permissions ?? []).length;
  const datasetSharedCount = sharedAssets.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sharing Center"
        description="Govern how your datasets are shared across organizations. Approve incoming requests, manage outgoing shares, and review shared assets."
        icon={<Share2 className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchRequests();
                refetchPermissions();
              }}
              disabled={!activeOrgId || reqFetching || permFetching}
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${reqFetching || permFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!activeOrgId}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New share request
            </Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Inbox className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Pending requests
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {pendingCount}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Active shares
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {activeShareCount}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Shared datasets
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {datasetSharedCount}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList>
          <TabsTrigger value="incoming">
            <Inbox className="mr-2 h-3.5 w-3.5" />
            Incoming Requests
            {pendingCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 h-5 px-1.5 text-[10px] tabular-nums"
              >
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing">
            <Send className="mr-2 h-3.5 w-3.5" />
            Outgoing Shares
          </TabsTrigger>
          <TabsTrigger value="assets">
            <Network className="mr-2 h-3.5 w-3.5" />
            Shared Assets
          </TabsTrigger>
        </TabsList>

        {/* Incoming requests */}
        <TabsContent value="incoming" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Incoming requests</CardTitle>
              <CardDescription>
                Approve or reject requests from other organizations asking for
                access to your datasets.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {reqLoading ? (
                <div className="px-6 pb-6">
                  <LoadingState rows={3} />
                </div>
              ) : reqError ? (
                <div className="px-6 pb-6">
                  <ErrorState
                    message="Failed to load requests"
                    onRetry={() => refetchRequests()}
                  />
                </div>
              ) : !requests || requests.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="h-5 w-5" />}
                  title="No incoming requests"
                  description="When another organization requests access to one of your datasets, it will appear here for review."
                  className="mx-6 mb-6"
                />
              ) : (
                <div className="max-h-[28rem] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Dataset</TableHead>
                        <TableHead>Requester</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.datasetName ?? (
                              <span className="text-muted-foreground italic">
                                Untitled dataset
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.requesterName ?? (
                              <span className="text-muted-foreground italic">
                                Unknown
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{levelBadge(r.level)}</TableCell>
                          <TableCell
                            className="max-w-xs truncate text-sm text-muted-foreground"
                            title={r.reason ?? ""}
                          >
                            {r.reason ?? "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell
                            className="text-sm text-muted-foreground"
                            title={formatDate(r.createdAt)}
                          >
                            {relativeTime(r.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.status === "pending" ? (
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-8"
                                  onClick={() => approveMutation.mutate(r.id)}
                                  disabled={
                                    approveMutation.isPending ||
                                    rejectMutation.isPending
                                  }
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() => rejectMutation.mutate(r.id)}
                                  disabled={
                                    approveMutation.isPending ||
                                    rejectMutation.isPending
                                  }
                                >
                                  <X className="mr-1 h-3.5 w-3.5" />
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {r.decidedAt
                                  ? `Decided ${relativeTime(r.decidedAt)}`
                                  : "—"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Outgoing shares */}
        <TabsContent value="outgoing" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outgoing shares</CardTitle>
              <CardDescription>
                Active permissions you have granted to other organizations.
                Revoke to instantly withdraw access.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {permLoading ? (
                <div className="px-6 pb-6">
                  <LoadingState rows={3} />
                </div>
              ) : permError ? (
                <div className="px-6 pb-6">
                  <ErrorState
                    message="Failed to load outgoing shares"
                    onRetry={() => refetchPermissions()}
                  />
                </div>
              ) : !permissions || permissions.length === 0 ? (
                <EmptyState
                  icon={<Send className="h-5 w-5" />}
                  title="No outgoing shares"
                  description="Use the New share request button to grant another organization access to one of your datasets."
                  className="mx-6 mb-6"
                />
              ) : (
                <div className="max-h-[28rem] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Dataset</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Field scope</TableHead>
                        <TableHead>Row filter</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {permissions.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.datasetName ?? "Untitled"}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5">
                              <Network className="h-3.5 w-3.5 text-muted-foreground" />
                              {p.organizationName ?? "Unknown org"}
                            </span>
                          </TableCell>
                          <TableCell>{levelBadge(p.level)}</TableCell>
                          <TableCell
                            className="max-w-xs truncate text-sm text-muted-foreground"
                            title={summarizeFieldScope(p.fieldScope)}
                          >
                            <span className="inline-flex items-center gap-1">
                              <Filter className="h-3 w-3" />
                              {summarizeFieldScope(p.fieldScope)}
                            </span>
                          </TableCell>
                          <TableCell
                            className="max-w-xs truncate text-sm text-muted-foreground"
                            title={summarizeRowFilter(p.rowFilter)}
                          >
                            {summarizeRowFilter(p.rowFilter)}
                          </TableCell>
                          <TableCell
                            className="text-sm text-muted-foreground"
                            title={formatDate(p.createdAt)}
                          >
                            {relativeTime(p.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-destructive hover:text-destructive"
                              onClick={() => setRevokeTarget(p)}
                              disabled={revokeMutation.isPending}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shared assets */}
        <TabsContent value="assets" className="mt-4">
          {permLoading ? (
            <LoadingState rows={3} />
          ) : !sharedAssets || sharedAssets.length === 0 ? (
            <EmptyState
              icon={<Network className="h-5 w-5" />}
              title="No shared datasets"
              description="Datasets you have shared with other organizations will appear here as cards."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sharedAssets.map((a) => (
                <Card
                  key={a.datasetId}
                  className="flex flex-col gap-3 p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Database className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight truncate">
                        {a.datasetName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.permissions.length} active share
                        {a.permissions.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.permissions.slice(0, 3).map((p) => (
                      <Badge
                        key={p.id}
                        variant="outline"
                        className="text-xs font-normal"
                      >
                        {p.organizationName ?? "Unknown"} · {p.level}
                      </Badge>
                    ))}
                    {a.permissions.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{a.permissions.length - 3}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-end border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setManageDataset({
                          datasetId: a.datasetId,
                          datasetName: a.datasetName,
                        })
                      }
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      Manage
                      <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New share dialog */}
      <NewShareDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        datasets={datasets ?? []}
      />

      {/* Revoke confirmation */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke share?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately withdraw access to{" "}
              <span className="font-medium text-foreground">
                {revokeTarget?.datasetName ?? "this dataset"}
              </span>{" "}
              for{" "}
              <span className="font-medium text-foreground">
                {revokeTarget?.organizationName ?? "the recipient organization"}
              </span>
              . The recipient will no longer be able to read or query this
              dataset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (revokeTarget) revokeMutation.mutate(revokeTarget.id);
              }}
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke share"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage dialog */}
      <Dialog
        open={!!manageDataset}
        onOpenChange={(open) => {
          if (!open) setManageDataset(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              {manageDataset?.datasetName ?? "Manage shares"}
            </DialogTitle>
            <DialogDescription>
              Active shares for this dataset. Revoke individual permissions to
              withdraw access.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto -mx-2 px-2">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Field scope</TableHead>
                  <TableHead>Row filter</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(permissions ?? [])
                  .filter((p) => p.datasetId === manageDataset?.datasetId)
                  .map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.organizationName ?? "Unknown"}
                      </TableCell>
                      <TableCell>{levelBadge(p.level)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {summarizeFieldScope(p.fieldScope)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {summarizeRowFilter(p.rowFilter)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive hover:text-destructive"
                          disabled={revokeMutation.isPending}
                          onClick={() => {
                            setManageDataset(null);
                            setRevokeTarget(p);
                          }}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── New share dialog ─────────────────────────────────────────────────────

function NewShareDialog({
  open,
  onClose,
  datasets,
}: {
  open: boolean;
  onClose: () => void;
  datasets: DatasetDTO[];
}) {
  const queryClient = useQueryClient();
  const [datasetId, setDatasetId] = useState("");
  const [targetOrg, setTargetOrg] = useState("");
  const [level, setLevel] = useState("read");
  const [reason, setReason] = useState("");
  const [fieldScopeCsv, setFieldScopeCsv] = useState("");
  const [rowFilterText, setRowFilterText] = useState("");

  const createMutation = useMutation({
    mutationFn: (payload: {
      datasetId?: string;
      level: string;
      reason?: string;
      fieldScope?: Record<string, unknown>;
      rowFilter?: Record<string, unknown>;
    }) =>
      api.post<SharingRequestDTO>("/api/sharing/requests", payload),
    onSuccess: (r) => {
      toast.success("Share request submitted", {
        description: `Pending approval for ${r.datasetName ?? "dataset"} at ${r.level} level.`,
      });
      queryClient.invalidateQueries({ queryKey: ["sharing"] });
      // Reset form
      setDatasetId("");
      setTargetOrg("");
      setLevel("read");
      setReason("");
      setFieldScopeCsv("");
      setRowFilterText("");
      onClose();
    },
    onError: (err: unknown) => {
      let msg = "Failed to create share request";
      if (err instanceof ApiError || err instanceof Error) {
        msg = err.message;
      }
      toast.error("Share failed", { description: msg });
    },
  });

  const handleSubmit = () => {
    if (!datasetId) {
      toast.error("Please select a dataset");
      return;
    }
    // Parse field scope: "field1, field2, field3" -> { exclude: [...] }
    const excludedFields = fieldScopeCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fieldScope = excludedFields.length
      ? { exclude: excludedFields }
      : undefined;
    // Parse row filter: either JSON or key=value pairs (one per line)
    let rowFilter: Record<string, unknown> | undefined;
    const trimmed = rowFilterText.trim();
    if (trimmed) {
      if (trimmed.startsWith("{")) {
        try {
          rowFilter = JSON.parse(trimmed);
        } catch {
          toast.error("Row filter is not valid JSON");
          return;
        }
      } else {
        // key=value per line
        rowFilter = {};
        const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const idx = line.indexOf("=");
          if (idx === -1) {
            toast.error("Row filter lines must be key=value");
            return;
          }
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          if (k) rowFilter[k] = v;
        }
        if (Object.keys(rowFilter).length === 0) rowFilter = undefined;
      }
    }
    createMutation.mutate({
      datasetId,
      level,
      reason: reason.trim() || undefined,
      fieldScope,
      rowFilter,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New share request</DialogTitle>
          <DialogDescription>
            Request access to one of your datasets on behalf of another
            organization. The request will appear in the Incoming Requests tab
            for approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Dataset *</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {datasets.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    No datasets available — create one first.
                  </div>
                ) : (
                  datasets.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} · {d.recordCount} record(s)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target-org">Target organization</Label>
            <Input
              id="target-org"
              placeholder="org-name or recipient@email.com"
              value={targetOrg}
              onChange={(e) => setTargetOrg(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The recipient organization name or external email. (Used for
              display purposes in this demo.)
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Access level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="share-reason">Reason</Label>
            <Textarea
              id="share-reason"
              placeholder="Why is this share being requested?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="field-scope">
              Field scope (fields to exclude)
            </Label>
            <Input
              id="field-scope"
              placeholder="internal_notes, customer_email, …"
              value={fieldScopeCsv}
              onChange={(e) => setFieldScopeCsv(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of fields the recipient should{" "}
              <span className="font-medium">not</span> see. Leave blank to
              share all fields.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="row-filter">Row filter</Label>
            <Textarea
              id="row-filter"
              placeholder={"status=active\nregion=us-east"}
              value={rowFilterText}
              onChange={(e) => setRowFilterText(e.target.value)}
              rows={3}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Either JSON ({`{ "status": "active" }`}) or one{" "}
              <code>key=value</code> per line. Leave blank to share all rows.
            </p>
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
            disabled={!datasetId || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Share2 className="mr-2 h-3.5 w-3.5" />
            )}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
