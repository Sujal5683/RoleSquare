const fs = require('fs');
let file_path = 'src/components/ai-studio/extraction-runs-tab.tsx';
let content = fs.readFileSync(file_path, 'utf8').replace(/\r\n/g, '\n');

// 1. Job ID -> Job Name
content = content.replace(
    `<span className="font-mono text-xs text-muted-foreground">
                    Job: {selectedJob.id}
                  </span>`,
    `<span className="font-medium text-xs text-foreground">
                    {(() => {
                      const payload = selectedJob.payload as any;
                      const targetDs = datasets?.find(d => d.id === payload?.targetDatasetId);
                      const sourceDs = datasets?.find(d => d.id === payload?.sourceDatasetId);
                      const targetName = String(payload?.targetDatasetName || targetDs?.name || (payload?.targetDatasetId ? String(payload.targetDatasetId).slice(0, 8) + "…" : "New"));
                      return \`Ext: \${sourceDs?.name?.slice(0, 10) ?? 'Src'} → \${targetName.slice(0, 10)}\`;
                    })()}
                  </span>`
);

// 2. Hide Source Dataset ID
content = content.replace(
    /<CollapsibleContent className="pl-4 pt-1 text-muted-foreground font-mono">\s*ID: \{\(selectedJob\.payload as any\)\.sourceDatasetId\}\s*<\/CollapsibleContent>/,
    ''
);

// 3. Hide Target Dataset ID
content = content.replace(
    /<CollapsibleContent className="pl-4 pt-1 text-muted-foreground font-mono">\s*ID: \{\(selectedJob\.payload as any\)\.targetDatasetId\}\s*<\/CollapsibleContent>/,
    ''
);

// 4. Hide Schema ID
content = content.replace(
    /<p className="font-mono text-muted-foreground">ID: \{\(selectedJob\.payload as any\)\.schemaId\}<\/p>/,
    ''
);

// 5. Hide Raw JSON output
content = content.replace(
    /\{rawParsed !== null && rawParsed !== undefined && \([\s\S]*?<\/div>\s*\)\}/,
    ''
);

// 6. Hide internal ID in AI outputs headers
content = content.replace(
    /<p className="text-\[10px\] text-muted-foreground font-mono">\{output\.id\.slice\(0, 10\)\}…<\/p>/g,
    '<p className="text-[10px] text-muted-foreground">AI Generation</p>'
);

fs.writeFileSync(file_path, content);
console.log('Patched extraction runs tab');
