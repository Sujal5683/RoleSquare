import os

files = [
    'src/app/api/google/authorize/route.ts',
    'src/app/api/google/callback/route.ts'
]

for f in files:
    if not os.path.exists(f): continue
    with open(f, 'r', encoding='utf8') as file:
        content = file.read()
    
    changed = False
    
    if 'requireRole' not in content:
        content = content.replace('import { requireOrgContext', 'import { requireOrgContext, requireRole')
        changed = True

    if 'await requireOrgContext(req)' in content:
        content = content.replace('await requireOrgContext(req)', 'await requireRole(req, "member")')
        changed = True
        
    if changed:
        with open(f, 'w', encoding='utf8') as file:
            file.write(content)
        print('Fixed google in', f)
