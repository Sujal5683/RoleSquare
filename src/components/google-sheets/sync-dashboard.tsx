import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SyncDashboardProps {
  sheetMappingId: string;
  status: "connected" | "warning" | "mismatch" | "error";
  lastSyncAt?: string;
  onRefresh: () => void;
}

export function SyncDashboard({ sheetMappingId, status, lastSyncAt, onRefresh }: SyncDashboardProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await api.post("/api/google-sheets/sync", { sheetMappingId });
      toast.success("Sync completed successfully");
      onRefresh();
    } catch (error: any) {
      toast.error("Sync failed", { description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Google Sheets Sync</span>
          <div className="flex items-center gap-2">
            {status === "connected" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {status !== "connected" && <AlertTriangle className="h-5 w-5 text-orange-500" />}
            <span className="text-sm font-normal text-muted-foreground capitalize">{status}</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Last synced: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"}
          </div>
          <Button onClick={handleSync} disabled={isSyncing} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
