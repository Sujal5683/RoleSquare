import os
import re

api_dir = os.path.join("src", "app", "api")

# Files that need specific roles instead of "member" can be handled manually, but generally "member" is the standard mutation role for this app.
# The script targets POST, PUT, PATCH, DELETE

for root, _, files in os.walk(api_dir):
    for file in files:
        if file == 'route.ts':
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()

            original_content = content
            
            # Find all mutation endpoints
            methods = re.findall(r'export async function (POST|PUT|PATCH|DELETE)\b', content)
            
            if methods:
                # We need to replace `await requireOrgContext(req)` with `await requireRole(req, "member")`
                # but ONLY inside those functions.
                # Actually, a simpler way is to just look for requireOrgContext(req) in the file. 
                # If the file has a mutation method, it shouldn't be using requireOrgContext for mutation.
                # However, GET methods might still need requireOrgContext(req). 
                
                # Let's replace requireOrgContext with requireRole within the function blocks.
                for method in set(methods):
                    # Regex to match the function block roughly (up to the next export or end of file)
                    pattern = r'(export async function ' + method + r'\b.*?)(?=\nexport async function|\Z)'
                    
                    def replacer(match):
                        block = match.group(1)
                        # Replace requireOrgContext with requireRole(req, "member")
                        # Watch out for variables, usually it's `await requireOrgContext(req)`
                        block = re.sub(r'await requireOrgContext\((.*?)\)', r'await requireRole(\1, "member")', block)
                        return block
                        
                    content = re.sub(pattern, replacer, content, flags=re.DOTALL)
                
                if content != original_content:
                    # Update imports to include requireRole if it's not there
                    if 'requireRole' not in content:
                        content = re.sub(r'import \{([^}]*?requireOrgContext[^}]*?)\} from "@/lib/auth";', 
                                         lambda m: f'import {{{m.group(1)}, requireRole}} from "@/lib/auth";' if 'requireRole' not in m.group(1) else m.group(0), 
                                         content)
                        # If requireOrgContext is no longer used, we could remove it, but leaving it is fine (eslint might complain).
                        
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Patched {path}")
