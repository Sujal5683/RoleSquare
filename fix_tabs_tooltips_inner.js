const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('src/components/views');
let replacedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  // Find <TabsTrigger ... title="..."> <Icon /> </TabsTrigger>
  const regex = /<TabsTrigger([^>]*?)title="([^"]+)"([^>]*?)>([\s\S]*?)<\/TabsTrigger>/g;
  
  content = content.replace(regex, (match, prefix, tooltipText, suffix, innerContent) => {
    return `<TabsTrigger${prefix}${suffix}>\n  <Tooltip>\n    <TooltipTrigger asChild>\n      <span className="flex h-full w-full items-center justify-center">\n        ${innerContent.trim()}\n      </span>\n    </TooltipTrigger>\n    <TooltipContent>${tooltipText}</TooltipContent>\n  </Tooltip>\n</TabsTrigger>`;
  });

  if (content !== original) {
    // ensure Tooltip imports exist
    if (!content.includes('TooltipContent')) {
      if (content.includes('@/components/ui/tooltip')) {
         content = content.replace(/import\s+{([^}]*)}\s+from\s+["']@\/components\/ui\/tooltip["'];/, (match, p1) => {
           const imports = p1.split(',').map(s => s.trim());
           if (!imports.includes('Tooltip')) imports.push('Tooltip');
           if (!imports.includes('TooltipTrigger')) imports.push('TooltipTrigger');
           if (!imports.includes('TooltipContent')) imports.push('TooltipContent');
           if (!imports.includes('TooltipProvider')) imports.push('TooltipProvider');
           return `import { ${imports.join(', ')} } from "@/components/ui/tooltip";`;
         });
      } else {
         content = `import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";\n` + content;
      }
    }
  
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
    replacedFiles++;
  }
});

console.log('Total files fixed:', replacedFiles);
