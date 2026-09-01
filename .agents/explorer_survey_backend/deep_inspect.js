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
const findings = [];

for (const r of routes) {
  const rel = path.relative('src/app/api', r).replace(/\\/g, '/');
  const code = fs.readFileSync(r, 'utf8');

  // Methods
  const methods = [];
  const methodRegex = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s*\(([^)]*)\)/g;
  let match;
  while ((match = methodRegex.exec(code)) !== null) {
    methods.push({ method: match[1], params: match[2] });
  }

  // Auth inspection
  const hasRequireOrgContext = code.includes('requireOrgContext');
  const hasRequireRole = code.includes('requireRole');
  const roleMatches = [...code.matchAll(/requireRole\s*\(\s*[^,]+,\s*["']([^"']+)["']\)/g)].map(m => m[1]);
  const hasRequireExplicitOrg = code.includes('requireExplicitOrg');
  const hasGetCurrentUser = code.includes('getCurrentUser');
  const hasVerifyDatasetAccess = code.includes('verifyDatasetAccess');
  const hasCreateClient = code.includes('createClient');
  const hasAuthErrorResponse = code.includes('authErrorResponse') || code.includes('err instanceof AuthError');

  // Tenant scoping inspection: look for db queries
  const dbCalls = [...code.matchAll(/db\.([a-zA-Z0-9_]+)\.(findUnique|findFirst|findMany|create|update|delete|deleteMany|updateMany|upsert)\s*\(\s*\{([^}]*)\}/g)];
  
  // Potential IDOR patterns: findUnique({ where: { id } }) without organizationId
  const potentialIdor = [];
  const findUniqueMatches = [...code.matchAll(/db\.([a-zA-Z0-9_]+)\.findUnique\s*\(\s*\{\s*where:\s*\{\s*id\s*\}|db\.([a-zA-Z0-9_]+)\.(update|delete)\s*\(\s*\{\s*where:\s*\{\s*id\s*\}/g)];
  if (findUniqueMatches.length > 0) {
    findUniqueMatches.forEach(m => {
      potentialIdor.push(m[0]);
    });
  }

  // Validation
  const hasZod = code.includes('z.') || code.includes('zod');
  const hasJsonParse = code.includes('JSON.parse');
  const uncheckedJsonParse = code.includes('JSON.parse(') && !code.includes('try {');

  // External APIs
  const externalAPIs = [];
  if (code.includes('googleClient') || code.includes('googleapis') || code.includes('google.auth') || code.includes('sheets.')) externalAPIs.push('Google Workspace');
  if (code.includes('GoogleGenerativeAI') || code.includes('gemini') || code.includes('modelUsed')) externalAPIs.push('Gemini AI');
  if (code.includes('enqueueJob') || code.includes('jobQueue')) externalAPIs.push('BullMQ/Redis');
  if (code.includes('dispatchWebhook')) externalAPIs.push('Webhooks');
  if (code.includes('resend') || code.includes('sendEmail')) externalAPIs.push('Resend/Email');

  findings.push({
    file: rel,
    methods,
    auth: {
      hasRequireOrgContext,
      hasRequireRole,
      roles: roleMatches,
      hasRequireExplicitOrg,
      hasGetCurrentUser,
      hasVerifyDatasetAccess,
      hasCreateClient,
      hasAuthErrorResponse
    },
    hasZod,
    hasJsonParse,
    potentialIdor,
    externalAPIs,
    codeLength: code.split('\n').length
  });
}

fs.writeFileSync(
  'c:/CDS IIT JMU/.agents/explorer_survey_backend/deep_inspection.json',
  JSON.stringify(findings, null, 2)
);

console.log('Deep inspection written to deep_inspection.json');
