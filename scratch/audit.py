import os
import re

def analyze_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    issues = []
    
    # Check for mutations (POST, PUT, PATCH, DELETE) missing requireRole
    methods = re.findall(r'export async function (POST|PUT|PATCH|DELETE)\b', content)
    if methods:
        if 'requireRole' not in content:
            issues.append(f"Missing requireRole for mutation methods: {', '.join(methods)}")
        
        # Also check if requireOrgContext is used instead of requireRole inside mutations
        for method in methods:
            # Simple heuristic: find the function body
            method_match = re.search(r'export async function ' + method + r'.*?\{(.*?)\nexport async function', content, re.DOTALL)
            if method_match:
                body = method_match.group(1)
                if 'requireOrgContext' in body and 'requireRole' not in body:
                    issues.append(f"Method {method} uses requireOrgContext instead of requireRole")

    # Check for missing organizationId in Prisma queries (excluding dataset sharing checks)
    queries = re.findall(r'db\.\w+\.(findUnique|findFirst|findMany|update|delete|create)\s*\(\s*\{.*?(?:where\s*:\s*\{([^}]*)\})?', content, re.DOTALL)
    for op, where_clause in queries:
        if where_clause and 'organizationId' not in where_clause:
            # This is a potential issue if it's querying by ID only
            pass # A bit too noisy, maybe refine

    return issues

api_dir = os.path.join("src", "app", "api")
for root, _, files in os.walk(api_dir):
    for file in files:
        if file == 'route.ts':
            path = os.path.join(root, file)
            issues = analyze_file(path)
            if issues:
                print(f"--- {path} ---")
                for issue in issues:
                    print(f"  - {issue}")
