"use client";

import { useState } from "react";
import { Share2, Download, Upload, Clock, Plus, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { DatasetDTO, DatasetAccessDTO, SharingRequestDTO } from "@/lib/types";

import { PageHeader } from "@/components/ui/page-elements";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewShareRequestDialog } from "@/components/sharing/new-share-request-dialog";

import { ReceivedTab } from "./received-tab";
import { OwnedTab } from "./owned-tab";
import { RequestsTab } from "./requests-tab";
import { SharingDetailsSheet } from "./sharing-details-sheet";

export function SharingView() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("received");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  
  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetData, setSheetData] = useState<DatasetAccessDTO | SharingRequestDTO | null>(null);
  const [sheetType, setSheetType] = useState<"access" | "request">("access");

  const handleRowClick = (data: DatasetAccessDTO | SharingRequestDTO, type: "access" | "request") => {
    setSheetData(data);
    setSheetType(type);
    setSheetOpen(true);
  };

  const [isRefetching, setIsRefetching] = useState(false);

  const handleRefresh = async () => {
    setIsRefetching(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sharing-permissions"] }),
      queryClient.invalidateQueries({ queryKey: ["cross-org-shares"] })
    ]);
    setTimeout(() => setIsRefetching(false), 500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Sharing Center"
          description="Manage dataset sharing with users and organizations."
          icon={<Share2 className="h-5 w-5" />}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShareDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Share a Dataset
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="received">
            <Download className="mr-2 h-4 w-4" />
            Shared with me
          </TabsTrigger>
          <TabsTrigger value="owned">
            <Upload className="mr-2 h-4 w-4" />
            Shared by me
          </TabsTrigger>
          <TabsTrigger value="requests">
            <Clock className="mr-2 h-4 w-4" />
            Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received">
          <ReceivedTab onRowClick={(data) => handleRowClick(data, "access")} />
        </TabsContent>

        <TabsContent value="owned">
          <OwnedTab onRowClick={(data) => handleRowClick(data, "access")} />
        </TabsContent>

        <TabsContent value="requests">
          <RequestsTab onRowClick={(data) => handleRowClick(data, "request")} />
        </TabsContent>
      </Tabs>

      <NewShareRequestDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        dataset={null}
      />

      <SharingDetailsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        data={sheetData}
        type={sheetType}
      />
    </div>
  );
}
