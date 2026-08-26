const fs = require('fs');
let file_path = 'src/components/views/datasets-view.tsx';
let content = fs.readFileSync(file_path, 'utf8');

if (!content.includes('import { Tooltip')) {
    content = content.replace(
        'import { Button } from "@/components/ui/button";',
        'import { Button } from "@/components/ui/button";\nimport { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";'
    );
    fs.writeFileSync(file_path, content);
}
