import re

with open('src/components/views/members-view.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update canAssignRole
content = re.sub(
    r'function canAssignRole\(actorRole: Role \| undefined, roleToAssign: Role\): boolean \{\n  if \(\!actorRole\) return false;\n  // Actors can only assign roles strictly below their own rank\n  return ROLE_RANK\[actorRole\] > ROLE_RANK\[roleToAssign\];\n\}',
    r'function canAssignRole(actorRole: Role | undefined, roleToAssign: Role): boolean {\n  if (!actorRole) return false;\n  if (actorRole === "owner" && roleToAssign === "owner") return true;\n  // Actors can only assign roles strictly below their own rank\n  return ROLE_RANK[actorRole] > ROLE_RANK[roleToAssign];\n}',
    content
)

# 2. Update changeRoleMutation onSuccess
content = content.replace(
    '''    onSuccess: (m) => {
      toast.success("Role updated", {
        description: `${m.user.name ?? m.user.email} is now ${m.role}.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["organizations", activeOrgId, "members"],
      });
    },''',
    '''    onSuccess: (m, variables) => {
      toast.success("Role updated", {
        description: `${m.user.name ?? m.user.email} is now ${m.role}.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["organizations", activeOrgId, "members"],
      });
      if (variables.role === "owner") {
         useAppStore.getState().fetchSession();
      }
    },'''
)

# 3. Update AlertDialog block
content = content.replace(
    '''      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeTarget?.user.id === currentUserId ? "Leave organization?" : "Remove member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.user.id === currentUserId ? (
                <>
                  Are you sure you want to leave this organization? You will lose access to all sources,
                  datasets, and audit history. This action cannot be undone.
                </>
              ) : (
                <>
                  This will remove{" "}
                  <span className="font-medium text-foreground">
                    {removeTarget?.user.name ?? removeTarget?.user.email}
                  </span>{" "}
                  from the organization. They will lose access to all sources,
                  datasets, and audit history. This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMemberMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMemberMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (removeTarget)
                  removeMemberMutation.mutate(removeTarget.id);
              }}
            >
              {removeMemberMutation.isPending 
                ? (removeTarget?.user.id === currentUserId ? "Leaving…" : "Removing…") 
                : (removeTarget?.user.id === currentUserId ? "Leave organization" : "Remove member")
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>''',
    '''      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeTarget?.user.id === currentUserId 
                ? (myRole === "owner" ? "Cannot leave organization" : "Leave organization?") 
                : "Remove member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.user.id === currentUserId ? (
                myRole === "owner" ? (
                  <>
                    You cannot leave the organization because you are the owner. 
                    Please transfer your ownership to another member or delete the organization first.
                  </>
                ) : (
                  <>
                    Are you sure you want to leave this organization? You will lose access to all sources,
                    datasets, and audit history. This action cannot be undone.
                  </>
                )
              ) : (
                <>
                  This will remove{" "}
                  <span className="font-medium text-foreground">
                    {removeTarget?.user.name ?? removeTarget?.user.email}
                  </span>{" "}
                  from the organization. They will lose access to all sources,
                  datasets, and audit history. This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {removeTarget?.user.id === currentUserId && myRole === "owner" ? (
              <AlertDialogAction onClick={() => setRemoveTarget(null)}>
                Got it
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={removeMemberMutation.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={removeMemberMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    if (removeTarget)
                      removeMemberMutation.mutate(removeTarget.id);
                  }}
                >
                  {removeMemberMutation.isPending 
                    ? (removeTarget?.user.id === currentUserId ? "Leaving…" : "Removing…") 
                    : (removeTarget?.user.id === currentUserId ? "Leave organization" : "Remove member")
                  }
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>'''
)

with open('src/components/views/members-view.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
