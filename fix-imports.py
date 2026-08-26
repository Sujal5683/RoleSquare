import glob
import re

files = [
    'src/app/api/ai-jobs/[id]/cancel/route.ts',
    'src/app/api/ai-jobs/[id]/retry/route.ts',
    'src/app/api/ai/extract-wizard/route.ts',
    'src/app/api/assistant/chat/route.ts',
    'src/app/api/datasets/[id]/columns/[columnId]/route.ts',
    'src/app/api/datasets/[id]/columns/route.ts',
    'src/app/api/datasets/[id]/import/route.ts',
    'src/app/api/datasets/[id]/records/[recordId]/route.ts',
    'src/app/api/datasets/[id]/records/[recordId]/values/[valueId]/route.ts',
    'src/app/api/datasets/[id]/records/bulk/route.ts',
    'src/app/api/datasets/[id]/records/route.ts',
    'src/app/api/extraction/route.ts',
    'src/app/api/google-sheets/export/route.ts',
    'src/app/api/google-sheets/import/route.ts',
    'src/app/api/google-sheets/mappings/[id]/conflicts/[conflictId]/resolve/route.ts',
    'src/app/api/google-sheets/mappings/[id]/route.ts',
    'src/app/api/google-sheets/mappings/[id]/schema-versions/[versionId]/rollback/route.ts',
    'src/app/api/google-sheets/mappings/[id]/sync/route.ts',
    'src/app/api/google-sheets/org-export/route.ts',
    'src/app/api/schemas/[id]/test-extraction/route.ts',
    'src/app/api/sources/[id]/extract/route.ts',
    'src/app/api/sources/[id]/runs/route.ts',
    'src/app/api/sources/[id]/scan/route.ts',
    'src/app/api/sources/test-scan/route.ts'
]

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    if 'requireRole' in content and 'requireRole' not in re.search(r'import\s*\{[^}]*\}\s*from\s*["\']@/lib/auth["\']', content).group(0):
        content = re.sub(r'(import\s*\{)([^}]+)(\}\s*from\s*["\']@/lib/auth["\'])', r'\1\2, requireRole\3', content)
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)

print("Done")
