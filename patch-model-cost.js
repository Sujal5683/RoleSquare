const fs = require('fs');
let file_path = 'src/components/ai-studio/model-cost-tab.tsx';
let content = fs.readFileSync(file_path, 'utf8').replace(/\r\n/g, '\n');

const modelOld = `<td className="py-2 pr-3">
                          <p className="font-medium">{m.displayName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{m.model}</p>
                        </td>`;

const modelNew = `<td className="py-2 pr-3">
                          <p className="font-medium">{m.displayName}</p>
                        </td>`;

content = content.replace(modelOld, modelNew);
fs.writeFileSync(file_path, content);
console.log('Patched model cost tab');
