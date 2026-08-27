const fs = require('fs');
let file_path = 'src/components/ai-studio/agent-logs-tab.tsx';
let content = fs.readFileSync(file_path, 'utf8').replace(/\r\n/g, '\n');

const metadataOld = `              {/* Metadata */}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <span className="text-muted-foreground break-all max-w-[200px] truncate" title={JSON.stringify(sanitizeSensitiveIds(log.metadata))}>
                  {JSON.stringify(sanitizeSensitiveIds(log.metadata))}
                </span>
              )}`;

const metadataNew = `              {/* Metadata (Confidence, Tokens, Cost) */}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {(log.metadata as any).tokensUsed !== undefined && (
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded border border-indigo-500/20 whitespace-nowrap">
                      {(log.metadata as any).tokensUsed} tokens
                    </span>
                  )}
                  {(log.metadata as any).costUsd !== undefined && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">
                      \${Number((log.metadata as any).costUsd).toFixed(5)}
                    </span>
                  )}
                  {(log.metadata as any).confidenceScore !== undefined && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 whitespace-nowrap">
                      {(log.metadata as any).confidenceScore}% conf
                    </span>
                  )}
                </div>
              )}`;

content = content.replace(metadataOld, metadataNew);
fs.writeFileSync(file_path, content);
console.log('Patched agent logs tab');
