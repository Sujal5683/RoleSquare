"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { MemberDTO, OrganizationDTO, Role } from "@/lib/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Send } from "lucide-react";
import { useAppStore } from "@/lib/store";

export function InviteMemberDialog({
  fixedOrgId,
  open,
  onClose,
}: {
  fixedOrgId?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  
  const { data: orgs } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<OrganizationDTO[]>("/api/organizations"),
  });
  
  const selectedOrganizationId = useAppStore((s) => s.selectedOrganizationId);
  const [selectedOrg, setSelectedOrg] = useState<string>(fixedOrgId || selectedOrganizationId || "");

  useEffect(() => {
    if (fixedOrgId) setSelectedOrg(fixedOrgId);
    else if (!selectedOrg && selectedOrganizationId) setSelectedOrg(selectedOrganizationId);
  }, [fixedOrgId, selectedOrganizationId, selectedOrg]);

  const inviteMutation = useMutation({
    mutationFn: (payload: { email: string; role: Role; orgId: string }) =>
      api.post<MemberDTO>(
        `/api/organizations/${payload.orgId}/members`,
        { email: payload.email, role: payload.role }
      ),
    onSuccess: (m) => {
      toast.success("Invitation sent", {
        description: `${m.user.email} has been invited as ${m.role}.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["organizations", selectedOrg, "members"],
      });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setEmail("");
      setRole("member");
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to invite";
      toast.error("Invite failed", { description: msg });
    },
  });

  const handleSubmit = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!selectedOrg) {
      toast.error("Please select an organization");
      return;
    }
    inviteMutation.mutate({ email: trimmed, role, orgId: selectedOrg });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Invite a teammate by email. If they don't have an account yet,
            we'll create one for them. They will start with the{" "}
            <span className="capitalize font-medium">{role}</span> role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!fixedOrgId && orgs && orgs.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                Organization <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={inviteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!email.trim() || inviteMutation.isPending || !selectedOrg}
          >
            {inviteMutation.isPending ? (
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-2 h-3.5 w-3.5" />
            )}
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
