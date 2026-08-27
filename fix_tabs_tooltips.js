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
  
  // Replace <Tooltip><TooltipTrigger asChild><TabsTrigger ...> <Icon /> </TabsTrigger></TooltipTrigger><TooltipContent>...</TooltipContent></Tooltip>
  // with <TabsTrigger ... title="..."> <Icon /> </TabsTrigger>
  const regex = /<Tooltip>\s*<TooltipTrigger asChild>\s*(<TabsTrigger[^>]*>)\s*([\s\S]*?)\s*<\/TabsTrigger>\s*<\/TooltipTrigger>\s*<TooltipContent>(.*?)<\/TooltipContent>\s*<\/Tooltip>/g;
  
  content = content.replace(regex, (match, openingTag, innerContent, tooltipText) => {
    // Add title attribute to the opening tag if it doesn't already have one
    if (!openingTag.includes('title=')) {
      openingTag = openingTag.replace('>', ` title="${tooltipText}">`);
    }
    return `${openingTag}\n  ${innerContent}\n</TabsTrigger>`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
    replacedFiles++;
  }
});

console.log('Total files fixed:', replacedFiles);
