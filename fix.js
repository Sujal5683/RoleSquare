const fs = require('fs');
let text = fs.readFileSync('src/components/views/usage-view.tsx', 'utf8');
text = text.replace(/<RechartsTooltip<TooltipTrigger asChild><span>\{fmt\(m.tokens\)\} tokens<\/span><\/TooltipTrigger><TooltipContent>Total tokens<\/TooltipContent><\/Tooltip>/,
  '<Tooltip><TooltipTrigger asChild><span>{fmt(m.tokens)} tokens</span></TooltipTrigger><TooltipContent>Total tokens</TooltipContent></Tooltip>');
fs.writeFileSync('src/components/views/usage-view.tsx', text, 'utf8');
console.log('Fixed usage-view');

