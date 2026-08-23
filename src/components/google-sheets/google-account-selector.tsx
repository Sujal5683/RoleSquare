import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { Plus } from "lucide-react";

interface GoogleAccountSelectorProps {
  onAccountSelect?: (accountId: string) => void;
}

export function GoogleAccountSelector({ onAccountSelect }: GoogleAccountSelectorProps) {
  const selectedOrganizationId = useAppStore(s => s.selectedOrganizationId);
  const userId = "current-user-id"; // Platform assumes alice@acme.io

  const handleConnect = () => {
    if (!selectedOrganizationId || !userId) return;
    // Redirect to the existing, pre-configured backend auth route
    window.location.href = `/api/google/authorize?organizationId=${selectedOrganizationId}`;
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-md">
      <h3 className="font-semibold text-lg">Connect Google Sheets</h3>
      <p className="text-sm text-muted-foreground">
        Connect a Google account specifically for syncing with Google Sheets. This is separate from your application login.
      </p>
      
      <div className="flex justify-end mt-4">
        <Button onClick={handleConnect}>
          <Plus className="mr-2 h-4 w-4" />
          Connect Google Account
        </Button>
      </div>
    </div>
  );
}
