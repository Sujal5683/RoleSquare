import os

files = [
    'src/app/api/sharing/permissions/route.ts',
    'src/app/api/sharing/requests/route.ts',
    'src/app/api/sharing/requests/[id]/approve/route.ts',
    'src/app/api/sharing/requests/[id]/reject/route.ts',
    'src/app/api/sharing/cross-org/route.ts',
    'src/app/api/sharing/cross-org/[id]/route.ts'
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

    parts = content.split('export async function ')
    
    for i in range(1, len(parts)):
        if not parts[i].startswith('GET'):
            if 'await requireOrgContext(req)' in parts[i]:
                parts[i] = parts[i].replace('await requireOrgContext(req)', 'await requireRole(req, "member")')
                changed = True
            if 'await requireExplicitOrg(req)' in parts[i]:
                parts[i] = parts[i].replace('await requireExplicitOrg(req)', 'await requireRole(req, "member")')
                changed = True
                
    if changed:
        new_content = parts[0]
        for p in parts[1:]:
            new_content += 'export async function ' + p
            
        with open(f, 'w', encoding='utf8') as file:
            file.write(new_content)
        print('Fixed sharing in', f)
