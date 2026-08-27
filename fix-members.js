const fs = require('fs');
const content = fs.readFileSync('src/components/views/members-view.tsx', 'utf8');

const lines = content.split('\n');
let newLines = [];
let i = 0;
while(i < lines.length) {
    if (lines[i].includes('// ── Mutations ──────────────────────────────────────────────────────────')) {
        newLines.push(lines[i]);
        newLines.push('  const changeRoleMutation = useMutation({');
        newLines.push('    mutationFn: ({');
        newLines.push('      memberId,');
        newLines.push('      role,');
        newLines.push('    }: {');
        newLines.push('      memberId: string;');
        newLines.push('      role: Role;');
        newLines.push('    }) =>');
        newLines.push('      api.patch<MemberDTO>(');
        newLines.push('        `/api/organizations/${activeOrgId}/members/${memberId}`,');
        newLines.push('        { role }');
        newLines.push('      ),');
        newLines.push('    onSuccess: (m, variables) => {');
        newLines.push('      toast.success("Role updated", {');
        newLines.push('        description: `${m.user.name ?? m.user.email} is now ${m.role}.`,');
        newLines.push('      });');
        newLines.push('      queryClient.invalidateQueries({');
        newLines.push('        queryKey: ["organizations", activeOrgId, "members"],');
        newLines.push('      });');
        newLines.push('      if (variables.role === "owner") {');
        newLines.push('         fetchSession();');
        newLines.push('      }');
        newLines.push('    },');
        newLines.push('    onError: (err: unknown) => {');
        newLines.push('      toast.error("Failed to change role", {');
        newLines.push('        description: err instanceof Error ? err.message : undefined,');
        newLines.push('      });');
        newLines.push('    },');
        newLines.push('  });');
        newLines.push('');
        newLines.push('  const removeMemberMutation = useMutation({');
        newLines.push('    mutationFn: (memberId: string) =>');
        
        while(i < lines.length && !lines[i].includes('api.delete(`/api/organizations/${activeOrgId}/members/${memberId}`),')) {
            i++;
        }
        if(i < lines.length) {
            newLines.push(lines[i]);
        }
    } else {
        newLines.push(lines[i]);
    }
    i++;
}

fs.writeFileSync('src/components/views/members-view.tsx', newLines.join('\n'));
