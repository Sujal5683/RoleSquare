import { format } from "date-fns";
import { ExternalLink, Info, Database, MessageSquare, Shield } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DatasetAccessDTO, SharingRequestDTO } from "@/lib/types";
import { LevelBadge, StatusBadge } from "./shared-components";

interface SharingDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DatasetAccessDTO | SharingRequestDTO | null;
  type: "access" | "request";
}

export function SharingDetailsSheet({ open, onOpenChange, data, type }: SharingDetailsSheetProps) {
  const openDataset = useAppStore((s) => s.openDataset);

  if (!data) return null;

  const isRequest = type === "request";
  const req = data as SharingRequestDTO;
  const access = data as DatasetAccessDTO;

  const title = isRequest
    ? (req.shareType === "grant" ? "Offered Dataset" : "Data Request")
    : "Dataset Access";

  const datasetId = isRequest ? req.datasetId : access.datasetId;
  const datasetName = isRequest ? req.datasetName : access.datasetName;
  const level = isRequest ? req.level : access.level;
  const createdAt = new Date(data.createdAt);
  const reason = isRequest ? req.reason : null;
  const status = isRequest ? req.status : access.status;

  const handleOpenDataset = () => {
    if (datasetId) {
      openDataset(datasetId);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader className="pb-6">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-muted-foreground" />
                {datasetName || datasetId || "Unknown Dataset"}
              </SheetTitle>
              <SheetDescription className="mt-1">
                {title} Details
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-6">
          <Card>
            <CardHeader >
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" /> Status & Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-muted-foreground mb-1">Access Level</div>
                <LevelBadge level={level} />
              </div>
              <div>
                <div className="font-medium text-muted-foreground mb-1">Status</div>
                <StatusBadge status={status} />
              </div>
              <div>
                <div className="font-medium text-muted-foreground mb-1">Created At</div>
                <div>{format(createdAt, "PPp")}</div>
              </div>
              {isRequest && req.decidedAt && (
                <div>
                  <div className="font-medium text-muted-foreground mb-1">Decided At</div>
                  <div>{format(new Date(req.decidedAt), "PPp")}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader >
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Info className="h-4 w-4" /> Participants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {isRequest ? (
                <>
                  <div className="flex flex-col sm:flex-row gap-1 sm:gap-4">
                    <span className="text-muted-foreground sm:w-1/3">Target Org:</span>
                    <span className="font-medium sm:w-2/3 break-words">{req.targetOrganizationName || req.targetOrganizationId}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1 sm:gap-4">
                    <span className="text-muted-foreground sm:w-1/3">Requester:</span>
                    <span className="font-medium sm:w-2/3 break-words">
                      {req.shareType === "request" 
                        ? (req.requesterName || req.requestedBy) 
                        : (req.targetOrganizationName || "Unknown Org")}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-1 sm:gap-4">
                    <span className="text-muted-foreground sm:w-1/3">Owner Org:</span>
                    <span className="font-medium sm:w-2/3 break-words">{access.ownerOrgName || access.ownerOrgId}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1 sm:gap-4">
                    <span className="text-muted-foreground sm:w-1/3">Grantee:</span>
                    <span className="font-medium sm:w-2/3 break-words">
                      {access.granteeOrgId
                        ? access.granteeOrgName || "Unknown Org"
                        : access.granteeUserName || access.granteeUserEmail || "Unknown User"}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {reason && (
            <Card>
              <CardHeader >
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Request Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                  {reason}
                </div>
              </CardContent>
            </Card>
          )}
        </SheetBody>

        {datasetId && status === "active" && !isRequest && (
          <SheetFooter>
            <Button onClick={handleOpenDataset} className="w-full">
              Open Dataset <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
