"use client";

// CrossOrgPanel — displays incoming and outgoing cross-org share requests/grants.
//
// Incoming: requests FROM other orgs asking access to OUR data
//           + our admin can approve / reject
// Outgoing: requests/grants WE made to other orgs (can revoke)
//
// Data source: GET /api/sharing/cross-org
// Actions:    PATCH /api/sharing/cross-org/[id] { action: "approve"|"reject"|"revoke" }

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import type { SharingRequestDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LoadingState, EmptyState } from "@/components/ui/page-elements";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  X,
  Trash2,
  Building2,
  Shield,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface CrossOrgResponse {
  incoming: SharingRequestDTO[];
  outgoing: SharingRequestDTO[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:  "bg-amber-100 text-amber-700 border-amber-200",
    approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
    revoked:  "bg-neutral-100 text-neutral-600 border-neutral-200",
  };
  return `text-[10px] px-1.5 py-0.5 rounded border font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`;
}

function levelBadge(level: string) {
  const map: Record<string, string> = {
    read:    "bg-blue-50 text-blue-600 border-blue-200",
    comment: "bg-purple-50 text-purple-600 border-purple-200",
    edit:    "bg-orange-50 text-orange-600 border-orange-200",
  };
  return `text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${map[level] ?? "bg-muted text-muted-foreground"}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CrossOrgPanel() {
  const queryClient = useQueryClient();
  const orgId = useAppStore((s) => s.selectedOrganizationId);
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");

  // No polling — cross-org share state rarely changes in real-time.
  // The mutation onSuccess invalidates the key after each action.
  const { data, isLoading } = useQuery<CrossOrgResponse>({
    queryKey: ["cross-org-shares", orgId],
    queryFn: () => api.get<CrossOrgResponse>("/api/sharing/cross-org"),
    enabled: !!orgId,
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.patch(`/api/sharing/cross-org/${id}`, { action }),
    onSuccess: (_, { action }) => {
      const labels: Record<string, string> = {
        approve: "Request approved",
        reject: "Request rejected",
        revoke: "Access revoked",
      };
      toast.success(labels[action] ?? "Done");
      queryClient.invalidateQueries({ queryKey: ["cross-org-shares", orgId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast.error(msg);
    },
  });

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const shown = tab === "incoming" ? incoming : outgoing;

  return (
    <Card>
      <CardHeader >
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Cross-Organization Sharing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tab switcher */}
        <div className="flex rounded-lg border overflow-hidden">
          {(["incoming", "outgoing"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted/40 text-muted-foreground"
              }`}
            >
              {t === "incoming" ? (
                <ArrowDownLeft className="h-3 w-3" />
              ) : (
                <ArrowUpRight className="h-3 w-3" />
              )}
              {t === "incoming" ? "Incoming" : "Outgoing"}
              {t === "incoming" && incoming.filter((r) => r.status === "pending").length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 text-white text-[9px] w-4 h-4 flex items-center justify-center">
                  {incoming.filter((r) => r.status === "pending").length}
                </span>
              )}
            </button>
          ))}
        </div>

        <Separator />

        {/* List */}
        {isLoading ? (
          <LoadingState rows={3} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-4 w-4" />}
            title={`No ${tab} share requests`}
            description={
              tab === "incoming"
                ? "When other organizations request access to your datasets, they'll appear here."
                : "Share your datasets with other organizations using the 'Share' button on any dataset."
            }
          />
        ) : (
          <div className="space-y-3">
            {shown.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {r.datasetName ?? "Unknown dataset"}
                      </p>
                      <span className={levelBadge(r.level)}>{r.level}</span>
                      <span className={statusBadge(r.status)}>{r.status}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {tab === "incoming"
                        ? `From: ${r.requesterName ?? r.requestedBy}`
                        : `To: ${r.targetOrganizationName ?? r.targetOrganizationId ?? "—"}`}
                    </p>
                    {r.reason && (
                      <p className="text-[11px] text-muted-foreground/80 italic mt-0.5">
                        "{r.reason}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {r.status === "pending" && tab === "incoming" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => actionMutation.mutate({ id: r.id, action: "approve" })}
                      disabled={actionMutation.isPending}
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => actionMutation.mutate({ id: r.id, action: "reject" })}
                      disabled={actionMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                )}
                {r.status === "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => actionMutation.mutate({ id: r.id, action: "revoke" })}
                    disabled={actionMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                    Revoke access
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
