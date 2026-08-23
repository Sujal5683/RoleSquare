import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface ConflictResolverProps {
  conflict: any; // Ideally typed to SyncConflict
  onResolve: (strategy: "keep_app" | "keep_sheet" | "manual", manualData?: any) => void;
  onClose: () => void;
}

export function ConflictResolver({ conflict, onResolve, onClose }: ConflictResolverProps) {
  if (!conflict) return null;

  return (
    <Dialog open={!!conflict} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Resolve Sync Conflict</DialogTitle>
        </DialogHeader>
        <div className="py-4 text-sm">
          <p className="mb-4 text-muted-foreground">
            Both the application data and the Google Sheet data were modified before they could sync. Please choose which version to keep.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-md p-4 bg-muted/50">
              <h4 className="font-semibold mb-2">Application Data</h4>
              <pre className="text-xs overflow-auto">{JSON.stringify(conflict.appData, null, 2)}</pre>
              <Button className="mt-4 w-full" variant="secondary" onClick={() => onResolve("keep_app")}>
                Keep App Data
              </Button>
            </div>
            
            <div className="border rounded-md p-4 bg-muted/50">
              <h4 className="font-semibold mb-2">Google Sheet Data</h4>
              <pre className="text-xs overflow-auto">{JSON.stringify(conflict.sheetData, null, 2)}</pre>
              <Button className="mt-4 w-full" variant="secondary" onClick={() => onResolve("keep_sheet")}>
                Keep Sheet Data
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
