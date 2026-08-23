import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

interface SheetMappingWizardProps {
  datasetId: string;
  googleIntegrationId: string;
  organizationId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function SheetMappingWizard({ datasetId, googleIntegrationId, organizationId, onSuccess, onCancel }: SheetMappingWizardProps) {
  const [step, setStep] = useState(1);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  const handleLink = async () => {
    setIsLinking(true);
    try {
      await api.post("/api/google-sheets/link", {
        datasetId,
        googleIntegrationId,
        organizationId,
        spreadsheetId,
        sheetName,
        columnMappings: [] // In a full implementation, the UI would map headers first
      });
      toast.success("Successfully linked Google Sheet");
      onSuccess();
    } catch (error: any) {
      toast.error("Failed to link sheet", { description: error.message });
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link Google Sheet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Spreadsheet ID</label>
              <input 
                type="text" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={spreadsheetId}
                onChange={e => setSpreadsheetId(e.target.value)}
                placeholder="Enter Spreadsheet ID"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Sheet Name (Tab)</label>
              <input 
                type="text" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={sheetName}
                onChange={e => setSheetName(e.target.value)}
                placeholder="e.g. Sheet1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button onClick={() => setStep(2)} disabled={!spreadsheetId || !sheetName}>Next</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm">Confirm you want to link this sheet to the dataset.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleLink} disabled={isLinking}>
                {isLinking ? "Linking..." : "Confirm & Link"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
