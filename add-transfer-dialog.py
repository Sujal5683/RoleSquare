import re

with open('src/components/views/members-view.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state and handleRoleChange
state_addition = """  const [removeTarget, setRemoveTarget] = useState<MemberDTO | null>(null);
  const [transferTarget, setTransferTarget] = useState<MemberDTO | null>(null);
  const [transferInput, setTransferInput] = useState("");
  
  const handleRoleChange = (member: MemberDTO, newRole: Role) => {
    if (newRole === "owner") {
      setTransferTarget(member);
      setTransferInput("");
    } else {
      changeRoleMutation.mutate({ memberId: member.id, role: newRole });
    }
  };"""
content = content.replace('  const [removeTarget, setRemoveTarget] = useState<MemberDTO | null>(null);', state_addition)

# 2. Replace changeRoleMutation.mutate with handleRoleChange
content = re.sub(
    r'changeRoleMutation\.mutate\(\{\s*memberId:\s*m\.id,\s*role:\s*r,?\s*\}\)',
    r'handleRoleChange(m, r)',
    content
)

content = re.sub(
    r'changeRoleMutation\.mutate\(\{\s*memberId:\s*m\.id,\s*role:\s*v\s*as\s*Role,?\s*\}\)',
    r'handleRoleChange(m, v as Role)',
    content
)

# 3. Add AlertDialog for transferTarget
transfer_dialog = """
      {/* Transfer ownership confirmation */}
      <AlertDialog
        open={!!transferTarget}
        onOpenChange={(open) => {
          if (!open) setTransferTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer Ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-4">
                <p>
                  You are about to transfer ownership of this organization to{" "}
                  <span className="font-medium text-foreground">
                    {transferTarget?.user.name ?? transferTarget?.user.email}
                  </span>
                  .
                </p>
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive font-medium">
                  Warning: You will be demoted to an Admin and lose owner privileges. This action cannot be reversed unless the new owner transfers it back to you.
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-confirm">
                    Type <strong>transfer</strong> to confirm
                  </Label>
                  <Input
                    id="transfer-confirm"
                    value={transferInput}
                    onChange={(e) => setTransferInput(e.target.value)}
                    placeholder="transfer"
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={changeRoleMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={changeRoleMutation.isPending || transferInput.trim().toLowerCase() !== "transfer"}
              onClick={(e) => {
                e.preventDefault();
                if (transferTarget && transferInput.trim().toLowerCase() === "transfer") {
                  changeRoleMutation.mutate({ memberId: transferTarget.id, role: "owner" });
                  setTransferTarget(null);
                }
              }}
            >
              {changeRoleMutation.isPending ? "Transferring…" : "Transfer Ownership"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
"""

content = content.replace('      {/* Remove confirmation */}', transfer_dialog + '\n      {/* Remove confirmation */}')

with open('src/components/views/members-view.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
