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

  // Background processing indicator disabled per user request.
  // Job progress is shown inline in the AI Studio Extraction Runs section.
  return null;
}

