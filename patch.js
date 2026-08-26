const fs = require('fs');
let file_path = 'src/components/google-sheets/org-sheets-wizard.tsx';
let content = fs.readFileSync(file_path, 'utf8');

if (!content.includes('import { Tooltip')) {
    content = content.replace(
        'import { Checkbox } from "@/components/ui/checkbox";',
        'import { Checkbox } from "@/components/ui/checkbox";\nimport { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";'
    );
}

const pattern = /<label[\s\S]*?key=\{d\.id\}[\s\S]*?<\/label>/;
const newStr = `                  <TooltipProvider key={d.id}>
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
                  </TooltipProvider>`;

if(pattern.test(content)) {
    content = content.replace(pattern, newStr);
    fs.writeFileSync(file_path, content);
    console.log('Patched');
} else {
    console.log('Not found');
}
