import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { GoogleAccountSelector } from "./google-account-selector";

interface BulkSheetLinkWizardProps {
  organizationId: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function BulkSheetLinkWizard({ organizationId, onComplete, onCancel }: BulkSheetLinkWizardProps) {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  // In a real app, we would authenticate and fetch the sheet tabs here.
  // We'll simulate the linking for now.

  const handleLink = async () => {
    setIsLinking(true);
    try {
      // Fake API call to simulate bulk linking
      await new Promise(r => setTimeout(r, 1000));
      toast.success("Successfully created datasets from Google Sheet");
      onComplete();
    } catch (error: any) {
      toast.error("Failed to link spreadsheet", { description: error.message });
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 py-4">
      <GoogleAccountSelector />
      
      <div className="space-y-4 border p-4 rounded-md mt-4">
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Spreadsheet ID</Label>
          <Input 
            value={spreadsheetId}
            onChange={e => setSpreadsheetId(e.target.value)}
            placeholder="Enter Google Spreadsheet ID"
          />
          <p className="text-xs text-muted-foreground mt-1">
            We will scan this spreadsheet and suggest datasets for each tab.
          </p>
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleLink} disabled={!spreadsheetId || isLinking}>
            {isLinking ? "Scanning..." : "Scan Spreadsheet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
