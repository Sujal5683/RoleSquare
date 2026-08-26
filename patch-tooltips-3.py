import os

file_path = 'src/components/google-sheets/org-sheets-wizard.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'import { Tooltip' not in content and 'import { TooltipProvider' not in content:
    content = content.replace(
        'import { Checkbox } from "@/components/ui/checkbox";',
        'import { Checkbox } from "@/components/ui/checkbox";\nimport { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";'
    )

old_str = '''                  <label
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{d.name}</p>
                        {isReadOnly && <span className="text-xs text-muted-foreground">(View only)</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.recordCount} record{d.recordCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </label>'''

new_str = '''                  <TooltipProvider key={d.id}>
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
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{d.name}</p>
                              {isReadOnly && <span className="text-xs text-muted-foreground">(View only)</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {d.recordCount} record{d.recordCount !== 1 ? "s" : ""}
                            </p>
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

if old_str in content:
    content = content.replace(old_str, new_str)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched org-sheets-wizard")
else:
    print("Not found org-sheets-wizard block")
