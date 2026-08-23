import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Building2, Database, Download, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import type { DatasetAccessDTO } from "@/lib/types";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/page-elements";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LevelBadge, GranteeCell } from "./shared-components";

interface PermissionsResponse {
  owned: DatasetAccessDTO[];
  received: DatasetAccessDTO[];
}

interface ReceivedTabProps {
  onRowClick: (access: DatasetAccessDTO) => void;
}

export function ReceivedTab({ onRowClick }: ReceivedTabProps) {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sharing-permissions", activeOrgId, "received"],
    queryFn: () =>
      api.get<PermissionsResponse>(
        `/api/sharing/permissions?organizationId=${activeOrgId}&view=received`
      ),
    enabled: !!activeOrgId,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete("/api/sharing/permissions", { id }),
    onSuccess: () => {
      toast.success("Dataset access revoked");
      queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] });
    },
    onError: (err: unknown) => {
      toast.error("Failed to revoke", { description: err instanceof Error ? err.message : undefined });
    },
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

  const toggleAll = () => {
    if (selectedIds.size === received.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(received.map(a => a.id)));
    }
  };

  const toggleOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <Card>
      {selectedIds.size > 0 && (
        <div className="bg-muted/50 border-b px-4 py-2 flex items-center justify-between">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Revoke ${selectedIds.size} datasets?`)) {
                Promise.all(Array.from(selectedIds).map(id => api.delete("/api/sharing/permissions", { id })))
                  .then(() => {
                    toast.success("Datasets revoked");
                    queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] });
                    setSelectedIds(new Set());
                  })
                  .catch(() => toast.error("Failed to revoke some datasets"));
              }
            }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Revoke Access
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox 
                checked={received.length > 0 && selectedIds.size === received.length}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead>Dataset</TableHead>
            <TableHead>Owner Organization</TableHead>
            <TableHead>My Access</TableHead>
            <TableHead>Date Shared</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {received.map((access) => (
            <TableRow 
              key={access.id} 
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => onRowClick(access)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox 
                  checked={selectedIds.has(access.id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selectedIds);
                    if (checked) next.add(access.id);
                    else next.delete(access.id);
                    setSelectedIds(next);
                  }}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{access.datasetName ?? access.datasetId}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{access.ownerOrgName ?? "Unknown org"}</div>
                    <div className="text-xs text-muted-foreground">Organization</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <LevelBadge level={access.level} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(access.createdAt), { addSuffix: true })}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
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
                      Decline / Revoke access
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
