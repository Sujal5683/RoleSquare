"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Activity } from "lucide-react";
import { api } from "@/lib/api-client";
import { useActiveOrg } from "@/hooks/use-active-org";

export function GlobalProgress() {
  const activeOrgId = useActiveOrg();

  const { data: runningJobs } = useQuery({
    queryKey: ["ai-jobs", "running", activeOrgId],
    queryFn: () =>
      api.get<any[]>(`/api/ai-jobs?organizationId=${activeOrgId}&status=running`),
    enabled: !!activeOrgId,
    refetchInterval: 5000, // Poll every 5s
  });

  if (!runningJobs || runningJobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border bg-background/95 backdrop-blur shadow-lg p-3 pr-4 animate-in slide-in-from-bottom-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="h-4 w-4 text-primary animate-spin" />
      </div>
      <div>
        <p className="text-sm font-semibold">
          {runningJobs.length} {runningJobs.length === 1 ? "job" : "jobs"} running
        </p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Activity className="h-3 w-3" />
          Background processing
        </p>
      </div>
    </div>
  );
}
