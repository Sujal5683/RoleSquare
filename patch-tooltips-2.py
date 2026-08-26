import os
import re

def add_imports(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'import { Tooltip' not in content and 'import { TooltipProvider' not in content:
        # Find the last import
        matches = list(re.finditer(r'^import .*?;\n', content, flags=re.MULTILINE))
        if matches:
            last_match = matches[-1]
            idx = last_match.end()
            content = content[:idx] + 'import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";\n' + content[idx:]
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

def patch_file(filepath, old_str, new_str):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if old_str in content:
        content = content.replace(old_str, new_str)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {filepath}")
    else:
        print(f"Skipped {filepath} - not found")

# 1. extraction-wizard.tsx
add_imports('src/components/ai-studio/extraction-wizard.tsx')
extract_old = '''                        <div key={d.id} title={isReadOnly ? "View only - you must be an editor to select this dataset" : undefined}>
                          <SelectItem value={d.id} disabled={isReadOnly}>
                            <div className="flex items-center gap-2">
                              <span>{d.name}</span>
                              {isReadOnly && <span className="text-muted-foreground text-xs">(View only)</span>}
                            </div>
                          </SelectItem>
                        </div>'''
extract_new = '''                        <TooltipProvider key={d.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <SelectItem value={d.id} disabled={isReadOnly}>
                                  <div className="flex items-center gap-2">
                                    <span>{d.name}</span>
                                    {isReadOnly && <span className="text-muted-foreground text-xs">(View only)</span>}
                                  </div>
                                </SelectItem>
                              </div>
                            </TooltipTrigger>
                            {isReadOnly && (
                              <TooltipContent>
                                <p>View only - you must be an editor to select this dataset</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>'''
patch_file('src/components/ai-studio/extraction-wizard.tsx', extract_old, extract_new)

# 2. import-wizard.tsx
add_imports('src/components/google-sheets/import-wizard.tsx')
import_old = '''                            <div key={d.id} title={isReadOnly ? "View only - you must be an editor to select this dataset" : undefined}>
                              <SelectItem value={d.id} disabled={isReadOnly}>
                                <div className="flex items-center gap-2">
                                  <span>{d.name}</span>
                                  {isReadOnly && <span className="text-muted-foreground text-xs">(View only)</span>}
                                </div>
                              </SelectItem>
                            </div>'''
import_new = '''                            <TooltipProvider key={d.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <SelectItem value={d.id} disabled={isReadOnly}>
                                      <div className="flex items-center gap-2">
                                        <span>{d.name}</span>
                                        {isReadOnly && <span className="text-muted-foreground text-xs">(View only)</span>}
                                      </div>
                                    </SelectItem>
                                  </div>
                                </TooltipTrigger>
                                {isReadOnly && (
                                  <TooltipContent>
                                    <p>View only - you must be an editor to select this dataset</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>'''
patch_file('src/components/google-sheets/import-wizard.tsx', import_old, import_new)

# 3. source-builder-view.tsx
add_imports('src/components/views/source-builder-view.tsx')
source_old = '''                            <div key={d.id} title={isReadOnly ? "View only - you must be an editor to select this dataset" : undefined}>
                              <SelectItem value={d.id} disabled={isReadOnly}>
                                <div className="flex items-center gap-2">
                                  <span>{d.name} ({d.recordCount} records)</span>
                                  {isReadOnly && <span className="text-muted-foreground text-xs">(View only)</span>}
                                </div>
                              </SelectItem>
                            </div>'''
source_new = '''                            <TooltipProvider key={d.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <SelectItem value={d.id} disabled={isReadOnly}>
                                      <div className="flex items-center gap-2">
                                        <span>{d.name} ({d.recordCount} records)</span>
                                        {isReadOnly && <span className="text-muted-foreground text-xs">(View only)</span>}
                                      </div>
                                    </SelectItem>
                                  </div>
                                </TooltipTrigger>
                                {isReadOnly && (
                                  <TooltipContent>
                                    <p>View only - you must be an editor to select this dataset</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>'''
patch_file('src/components/views/source-builder-view.tsx', source_old, source_new)

# 4. org-sheets-wizard.tsx
add_imports('src/components/google-sheets/org-sheets-wizard.tsx')
org_old = '''                  <label
                    key={d.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border bg-card/50 px-3 py-2",
                      isReadOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/40"
                    )}
                    title={isReadOnly ? "View only - you must be an editor to select this dataset" : undefined}
                  >
                    <Checkbox
                      checked={selectedDatasets.has(d.id)}
                      onCheckedChange={() => !isReadOnly && toggleDataset(d.id)}
                      disabled={isReadOnly}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {d.name}
                        {isReadOnly && <span className="text-xs text-muted-foreground font-normal">(View only)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{d.description || "No description"}</div>
                    </div>
                  </label>'''
org_new = '''                  <TooltipProvider key={d.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          className={cn(
                            "flex items-center gap-3 rounded-md border bg-card/50 px-3 py-2",
                            isReadOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={selectedDatasets.has(d.id)}
                            onCheckedChange={() => !isReadOnly && toggleDataset(d.id)}
                            disabled={isReadOnly}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {d.name}
                              {isReadOnly && <span className="text-xs text-muted-foreground font-normal">(View only)</span>}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{d.description || "No description"}</div>
                          </div>
                        </label>
                      </TooltipTrigger>
                      {isReadOnly && (
                        <TooltipContent>
                          <p>View only - you must be an editor to select this dataset</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>'''
patch_file('src/components/google-sheets/org-sheets-wizard.tsx', org_old, org_new)

