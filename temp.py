import os
f = 'src/app/api/schemas/[id]/route.ts'
with open(f, 'r', encoding='utf8') as file: content = file.read()
if 'import { requireRole' not in content:
    content = content.replace('import { requireOrgContext', 'import { requireOrgContext, requireRole')
parts = content.split('export async function ')
for i in range(1, len(parts)):
    if not parts[i].startswith('GET'):
        parts[i] = parts[i].replace('await requireOrgContext(req)', 'await requireRole(req, "member")')
with open(f, 'w', encoding='utf8') as file:
    file.write(parts[0] + 'export async function '.join(parts[1:]))
print('Done schemas')
