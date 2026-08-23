import { Badge } from "@/components/ui/badge";
import { Building2, User } from "lucide-react";
import type { DatasetAccessDTO } from "@/lib/types";

export function LevelBadge({ level }: { level: string }) {
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

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return <Badge className={`capitalize ${map[status] ?? ""}`}>{status}</Badge>;
}

export function GranteeCell({ access }: { access: DatasetAccessDTO }) {
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
