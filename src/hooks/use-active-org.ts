import { useAppStore } from "@/lib/store";

/**
 * Returns the active organization ID for the current user.
 *
 * Reads directly from the Zustand in-memory store — no useQuery(["session"])
 * needed here. The session is loaded once in app-shell.tsx which sets
 * selectedOrganizationId via setActiveOrgId. All views that depend on the
 * org ID should use this hook, which is zero-cost after app-shell initializes.
 */
export function useActiveOrg(): string | null {
  return useAppStore((s) => s.selectedOrganizationId);
}
