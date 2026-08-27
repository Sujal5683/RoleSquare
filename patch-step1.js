const fs = require('fs');
let file_path = 'src/components/ai-studio/extraction-wizard.tsx';
let content = fs.readFileSync(file_path, 'utf8').replace(/\r\n/g, '\n');

const step1Old = `              {datasets?.map((d) => (
                <div
                  key={d.id}
                  onClick={() => setSourceDatasetId(d.id)}
                  className={\`cursor-pointer rounded-md border p-2.5 transition-all hover:border-primary/50 hover:bg-muted/30 \${
                    sourceDatasetId === d.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
                  }\`}
                >
                  <div className="flex items-center gap-2.5">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{d.name}</p>
                      <p className="text-[11px] text-muted-foreground">{d.recordCount} records</p>
                    </div>
                  </div>
                </div>
              ))}`;

const step1New = `              {datasets?.map((d) => {
                const isReadOnly = d.accessLevel === "read" || d.accessLevel === "comment";
                return (
                  <TooltipProvider key={d.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => !isReadOnly && setSourceDatasetId(d.id)}
                          className={\`rounded-md border p-2.5 transition-all \${
                            isReadOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50 hover:bg-muted/30"
                          } \${sourceDatasetId === d.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}\`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{d.name}</p>
                                {isReadOnly && <span className="text-[10px] text-muted-foreground">(View only)</span>}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{d.recordCount} records</p>
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      {isReadOnly && (
                        <TooltipContent>
                          <p>View only - you must be an editor to select this dataset as a source.</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}`;

if (content.includes(step1Old)) {
    content = content.replace(step1Old, step1New);
    fs.writeFileSync(file_path, content);
    console.log('Patched step 1');
} else {
    console.log('Step 1 block not found');
}
