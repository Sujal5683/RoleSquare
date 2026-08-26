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
    'src/app/api/datasets/[id]/route.ts',
    'src/app/api/schemas/route.ts',
    'src/app/api/sources/route.ts',
    'src/app/api/google-connections/route.ts',
    'src/app/api/google-sheets/ai-mapping/route.ts',
    'src/app/api/google-sheets/auth/route.ts',
    'src/app/api/webhooks/route.ts',
    'src/app/api/datasets/route.ts',
    'src/app/api/schemas/[id]/route.ts'
]

for f in files:
    if not os.path.exists(f): continue
    with open(f, 'r', encoding='utf8') as file:
        content = file.read()

    changed = False
    
    parts = content.split('export async function ')
    
    for i in range(1, len(parts)):
        if parts[i].startswith('GET'):
            if 'requireRole(req, "member")' in parts[i]:
                parts[i] = parts[i].replace('requireRole(req, "member")', 'requireOrgContext(req)')
                changed = True
                
    if changed:
        new_content = parts[0]
        for p in parts[1:]:
            new_content += 'export async function ' + p
            
        with open(f, 'w', encoding='utf8') as file:
            file.write(new_content)
        print('Fixed GET in', f)
