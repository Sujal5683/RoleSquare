const fs = require('fs');

function getFiles(dir, exts) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file, exts));
    } else {
      if (exts.some(ext => file.endsWith(ext))) results.push(file);
    }
  });
  return results;
}

const targetDirs = [
  'src/app/api/schemas',
  'src/app/api/sources',
  'src/app/api/google-connections',
  'src/app/api/google-sheets/accounts',
  'src/app/api/google-sheets',
  'src/app/api/webhooks',
  'src/app/api/datasets'
];

targetDirs.forEach(dir => {
  const files = getFiles(dir, ['.ts']);
  files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    let lines = content.split('\n');
    let inMutative = false;
    let bracketCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(lines[i])) {
        // Exclude dataset records endpoints because they use verifyDatasetAccess
        if (file.includes('records') || file.includes('columns') || file.includes('export') || file.includes('import') || file.includes('runs') || file.includes('scan') || file.includes('extract') || file.includes('link')) {
          continue;
        }
        inMutative = true;
        bracketCount = 0;
      }
      
      if (inMutative) {
        bracketCount += (lines[i].match(/\{/g) || []).length;
        bracketCount -= (lines[i].match(/\}/g) || []).length;
        
        if (lines[i].includes('requireOrgContext(req)')) {
          lines[i] = lines[i].replace('requireOrgContext(req)', 'requireRole(req, \"member\")');
          changed = true;
        }
        if (lines[i].includes('requireExplicitOrg(req)')) {
          lines[i] = lines[i].replace('requireExplicitOrg(req)', 'requireRole(req, \"member\")');
          changed = true;
        }
        
        if (bracketCount <= 0 && lines[i].includes('}')) {
          inMutative = false;
        }
      }
    }

    if (changed) {
      let finalContent = lines.join('\n');
      if (finalContent.includes('requireRole(') && !finalContent.includes('requireRole,')) {
        if (finalContent.includes('requireOrgContext,')) {
          finalContent = finalContent.replace('requireOrgContext,', 'requireOrgContext, requireRole,');
        } else if (finalContent.includes('requireExplicitOrg,')) {
          finalContent = finalContent.replace('requireExplicitOrg,', 'requireExplicitOrg, requireRole,');
        } else {
          finalContent = finalContent.replace('import {', 'import { requireRole,');
        }
      }
      fs.writeFileSync(file, finalContent);
      console.log('Updated', file);
    }
  });
});
