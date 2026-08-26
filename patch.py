import os

files = [
    'src/app/api/schemas/[id]/fields/route.ts',
    'src/app/api/schemas/[id]/fields/[fieldId]/route.ts',
    'src/app/api/schemas/[id]/fields/reorder/route.ts',
    'src/app/api/sources/[id]/route.ts',
    'src/app/api/sources/[id]/clone/route.ts',
    'src/app/api/sources/[id]/rules/route.ts',
    'src/app/api/google-connections/[id]/route.ts',
    'src/app/api/google-sheets/accounts/[id]/route.ts',
    'src/app/api/google-sheets/link/route.ts',
    'src/app/api/webhooks/[id]/route.ts',
    'src/app/api/datasets/[id]/route.ts'
]

for f in files:
    if not os.path.exists(f): continue
    with open(f, 'r', encoding='utf8') as file:
        content = file.read()
    
    changed = False
    
    if 'requireRole' not in content:
        content = content.replace('import { requireOrgContext', 'import { requireOrgContext, requireRole')
        content = content.replace('import { requireExplicitOrg', 'import { requireExplicitOrg, requireRole')
        changed = True

    if 'await requireOrgContext(req)' in content:
        content = content.replace('await requireOrgContext(req)', 'await requireRole(req, "member")')
        changed = True

    if 'await requireExplicitOrg(req)' in content:
        content = content.replace('await requireExplicitOrg(req)', 'await requireRole(req, "member")')
        changed = True
        
    if changed:
        with open(f, 'w', encoding='utf8') as file:
            file.write(content)
        print('Updated', f)
