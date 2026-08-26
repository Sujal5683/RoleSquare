import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Building2, Database, Upload, MoreHorizontal, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import type { DatasetAccessDTO, DatasetDTO } from "@/lib/types";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/page-elements";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface OwnedTabProps {
  onRowClick: (access: DatasetAccessDTO) => void;
}

export function OwnedTab({ onRowClick }: OwnedTabProps) {
  const queryClient = useQueryClient();
  const activeOrgId = useActiveOrg();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const owned = data?.owned ?? [];

  if (owned.length === 0) {
    return (
      <EmptyState
        icon={<Upload className="h-5 w-5" />}
        title="You haven't shared any datasets yet"
        description='Use the "Share a Dataset" button above to give others access to your data.'
      />
    );
  }

  const toggleAll = () => {
    if (selectedIds.size === owned.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(owned.map(a => a.id)));
    }
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
              if (window.confirm(`Revoke ${selectedIds.size} permissions?`)) {
                selectedIds.forEach((id) => revokeMutation.mutate(id));
                setSelectedIds(new Set());
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Revoke Selected
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox 
                checked={selectedIds.size > 0 && selectedIds.size === owned.length}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead>Dataset</TableHead>
            <TableHead>Shared With</TableHead>
            <TableHead>Access Level</TableHead>
            <TableHead>Shared</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {owned.map((access) => (
            <TableRow 
              key={access.id} 
              className="cursor-pointer hover:bg-muted/50"
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
                <GranteeCell access={access} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="focus:outline-none flex items-center group cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <LevelBadge level={access.level} />
                      <ChevronDown className="ml-1 h-3 w-3 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                      {["read", "comment", "edit"].map((lvl) => (
                        <DropdownMenuItem
                          key={lvl}
                          onClick={() => {
                            api.patch('/api/sharing/permissions', { id: access.id, level: lvl })
                               .then(() => queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] }))
                               .catch(() => toast.error("Failed to change level"));
                          }}
                        >
                          Change to {lvl === "read" ? "Viewer" : lvl === "comment" ? "Commenter" : "Editor"}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {access.status === "pending" && (
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      Pending Accept
                    </Badge>
                  )}
                  {access.isPaused && (
                    <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      Paused
                    </Badge>
                  )}
                </div>
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
                      onClick={() => {
                        api.patch('/api/sharing/permissions', { id: access.id, isPaused: !access.isPaused })
                           .then(() => queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] }))
                           .catch(() => toast.error("Failed to update status"));
                      }}
                    >
                      {access.isPaused ? "Resume access" : "Pause access"}
                    </DropdownMenuItem>
                    {["read", "comment", "edit"].map((lvl) => (
                      <DropdownMenuItem
                        key={lvl}
                        onClick={() => {
                          api.patch('/api/sharing/permissions', { id: access.id, level: lvl })
                             .then(() => queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] }))
                             .catch(() => toast.error("Failed to change level"));
                        }}
                      >
                        Change to {lvl === "read" ? "Viewer" : lvl === "comment" ? "Commenter" : "Editor"}
                      </DropdownMenuItem>
                    ))}
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
