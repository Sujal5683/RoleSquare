import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Building2, Clock, Download, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import type { SharingRequestDTO, DatasetDTO } from "@/lib/types";
import { EmptyState, ErrorState } from "@/components/ui/page-elements";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeletons/table-skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { LevelBadge, StatusBadge } from "./shared-components";

function ApproveRequestDialog({
  request,
  onClose,
  onApprove,
  isPending,
}: {
  request: SharingRequestDTO;
  onClose: () => void;
  onApprove: (datasetId: string) => void;
  isPending: boolean;
}) {
  const activeOrgId = useActiveOrg();
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");

  const { data: datasets } = useQuery({
    queryKey: ["datasets", activeOrgId],
    queryFn: () => api.get<DatasetDTO[]>(`/api/datasets?organizationId=${activeOrgId}`),
    enabled: !!activeOrgId,
  });

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Data Request</DialogTitle>
          <DialogDescription>
            {request.requesterName || request.requestedBy} has requested data access. Select a dataset to share.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="dataset">Dataset</Label>
            <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
              <SelectTrigger id="dataset">
                <SelectValue placeholder="Select a dataset..." />
              </SelectTrigger>
              <SelectContent>
                {datasets?.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => onApprove(selectedDatasetId)}
            disabled={!selectedDatasetId || isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve & Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RequestsTabProps {
  onRowClick: (request: SharingRequestDTO) => void;
}

export function RequestsTab({ onRowClick }: RequestsTabProps) {
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

  const [approvingRequest, setApprovingRequest] = useState<SharingRequestDTO | null>(null);

  const approveMutation = useMutation({
    mutationFn: ({ id, datasetId }: { id: string; datasetId?: string }) =>
      api.post(`/api/sharing/requests/${id}/approve`, datasetId ? { datasetId } : {}),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["cross-org-shares", activeOrgId] });
      const previous = queryClient.getQueryData(["cross-org-shares", activeOrgId]);
      queryClient.setQueryData(["cross-org-shares", activeOrgId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          incoming: old.incoming.map((r: any) => r.id === id ? { ...r, status: "approved" } : r)
        };
      });
      return { previous };
    },
    onSuccess: () => {
      toast.success("Request approved");
      setApprovingRequest(null);
    },
    onError: (err: unknown, variables, context: any) => {
      queryClient.setQueryData(["cross-org-shares", activeOrgId], context?.previous);
      toast.error("Failed to approve", { description: err instanceof Error ? err.message : undefined });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cross-org-shares"] });
      queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/sharing/requests/${id}/reject`, {}),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["cross-org-shares", activeOrgId] });
      const previous = queryClient.getQueryData(["cross-org-shares", activeOrgId]);
      queryClient.setQueryData(["cross-org-shares", activeOrgId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          incoming: old.incoming.map((r: any) => r.id === id ? { ...r, status: "rejected" } : r)
        };
      });
      return { previous };
    },
    onSuccess: () => {
      toast.success("Request rejected");
    },
    onError: (err: unknown, variables, context: any) => {
      queryClient.setQueryData(["cross-org-shares", activeOrgId], context?.previous);
      toast.error("Failed to reject", { description: err instanceof Error ? err.message : undefined });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cross-org-shares"] });
    }
  });

  const handleApprove = (e: React.MouseEvent, r: SharingRequestDTO) => {
    e.stopPropagation();
    if (r.shareType === "request" && !r.datasetId) {
      setApprovingRequest(r);
    } else {
      approveMutation.mutate({ id: r.id });
    }
  };

  const handleReject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    rejectMutation.mutate(id);
  };

  if (!activeOrgId) return <EmptyState icon={<Building2 className="h-5 w-5" />} title="No organization selected" description="" />;
  if (isLoading) return <div className="p-4"><TableSkeleton /></div>;
  if (isError) return <ErrorState message="Failed to load sharing requests" onRetry={() => refetch()} />;

  const outgoing = data?.outgoing ?? [];
  const incoming = data?.incoming ?? [];
  const pendingIncoming = incoming.filter((r) => r.status === "pending");
  const historyIncoming = incoming.filter((r) => r.status !== "pending");

  if (outgoing.length === 0 && incoming.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-5 w-5" />}
        title="No sharing requests"
        description="Requests to access or share datasets with other organizations appear here."
      />
    );
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
                  <TableHead>Type</TableHead>
                  <TableHead>Dataset</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingIncoming.map((r) => (
                  <TableRow 
                    key={r.id} 
                    className="cursor-pointer hover:bg-accent/50" 
                    onClick={() => onRowClick(r)}
                  >
                    <TableCell>
                      <Badge variant="outline" className={r.shareType === "grant" ? "border-violet-200 text-violet-700 bg-violet-50" : "border-blue-200 text-blue-700 bg-blue-50"}>
                        {r.shareType === "grant" ? "Offered Data" : "Data Request"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.datasetName ?? r.datasetId ?? "—"}</TableCell>
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
                          onClick={(e) => handleApprove(e, r)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          {r.shareType === "grant" ? "Accept" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={(e) => handleReject(e, r.id)}
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

      {historyIncoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Incoming Request History
          </h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dataset</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyIncoming.map((r) => (
                  <TableRow 
                    key={r.id} 
                    className="cursor-pointer hover:bg-muted/50" 
                    onClick={() => onRowClick(r)}
                  >
                    <TableCell>
                      <Badge variant="outline" className={r.shareType === "grant" ? "border-violet-200 text-violet-700 bg-violet-50" : "border-blue-200 text-blue-700 bg-blue-50"}>
                        {r.shareType === "grant" ? "Offered Data" : "Data Request"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.datasetName ?? r.datasetId ?? "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">{r.requesterName ?? r.requestedBy}</div>
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

      {outgoing.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <Upload className="h-4 w-4" /> Outgoing Requests / Grants
          </h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Shared with</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outgoing.map((r) => (
                  <TableRow 
                    key={r.id}
                    className="cursor-pointer hover:bg-accent/50" 
                    onClick={() => onRowClick(r)}
                  >
                    <TableCell>
                      <Badge variant="outline" className={r.shareType === "grant" ? "border-violet-200 text-violet-700 bg-violet-50" : "border-blue-200 text-blue-700 bg-blue-50"}>
                        {r.shareType === "grant" ? "Offered Data" : "Data Request"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.datasetName ?? r.datasetId ?? "—"}</TableCell>
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

      {approvingRequest && (
        <ApproveRequestDialog
          request={approvingRequest}
          onClose={() => setApprovingRequest(null)}
          onApprove={(datasetId) => approveMutation.mutate({ id: approvingRequest.id, datasetId })}
          isPending={approveMutation.isPending}
        />
      )}
    </div>
  );
}
