import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";

export function useActiveOrg() {
  const selectedOrgId = useAppStore((s) => s.selectedOrganizationId);
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<{ organizations: Array<{ id: string }> }>("/api/session"),
  });
  const isValidSelectedOrg = session?.organizations?.some((o) => o.id === selectedOrgId);
  return (selectedOrgId && isValidSelectedOrg) ? selectedOrgId : session?.organizations?.[0]?.id ?? null;
}
