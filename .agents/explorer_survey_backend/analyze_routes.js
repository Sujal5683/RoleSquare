const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (file === 'route.ts' || file === 'route.js') {
      results.push(fullPath);
    }
  });
  return results;
}

const routes = getFiles('src/app/api');
const details = [];

for (const r of routes) {
  const rel = path.relative('src/app/api', r).replace(/\\/g, '/');
  const code = fs.readFileSync(r, 'utf8');

  // Methods and their lines
  const methodMatches = [];
  const lines = code.split('\n');
  lines.forEach((l, idx) => {
    const match = l.match(/export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/);
    if (match) {
      methodMatches.push({ method: match[1], line: idx + 1 });
    }
  });

  // Extract auth calls
  const authCalls = [];
  const roleMatches = [...code.matchAll(/requireRole\s*\(\s*[^,]+,\s*["']([^"']+)["']\)/g)];
  if (roleMatches.length > 0) {
    authCalls.push('requireRole(' + roleMatches.map(m => m[1]).join(', ') + ')');
  }
  if (/requireOrgContext/.test(code)) authCalls.push('requireOrgContext');
  if (/requireExplicitOrg/.test(code)) authCalls.push('requireExplicitOrg');
  if (/getCurrentUser/.test(code)) authCalls.push('getCurrentUser');
  if (/verifyDatasetAccess/.test(code)) authCalls.push('verifyDatasetAccess');
  if (/createClient/.test(code)) authCalls.push('createClient');

  // Input validation
  const zodMatches = code.match(/z\.[a-zA-Z]+/g) || [];
  const hasZod = zodMatches.length > 0;
  const hasManualValidation = /if\s*\(![a-zA-Z0-9_.]+\)/.test(code);

  // External services
  const extServices = [];
  if (/googleClient|googleapis|google\.auth|oauth2Client|sheets\./i.test(code)) extServices.push('Google APIs');
  if (/gemini|GoogleGenerativeAI|aiModel/i.test(code)) extServices.push('Gemini AI');
  if (/enqueueJob|jobQueue|bullmq/i.test(code)) extServices.push('BullMQ/Redis');
  if (/dispatchWebhook/i.test(code)) extServices.push('Webhooks');
  if (/resend/i.test(code)) extServices.push('Resend/Email');
  if (/prisma|db\./.test(code)) extServices.push('Prisma/Postgres');

  details.push({
    file: rel,
    methods: methodMatches,
    authCalls: authCalls.length ? authCalls : ['NONE/CUSTOM'],
    hasZod,
    zodCount: zodMatches.length,
    hasManualValidation,
    hasTryCatch: /try\s*\{/.test(code),
    catchesAuthError: /AuthError|authErrorResponse/.test(code),
    extServices,
    lines: lines.length
  });
}

fs.writeFileSync(
  'c:/CDS IIT JMU/.agents/explorer_survey_backend/routes_summary.json',
  JSON.stringify(details, null, 2)
);

console.log('Processed', details.length, 'routes.');
const noAuth = details.filter(d => d.authCalls.includes('NONE/CUSTOM'));
console.log('Routes with NONE/CUSTOM auth (' + noAuth.length + '):');
noAuth.forEach(n => console.log(' - ' + n.file + ' [' + n.methods.map(m=>m.method).join(',') + ']'));
