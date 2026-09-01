const fs = require('fs');
const path = require('path');

const domains = {
  "Auth & Session": [
    "auth/callback/route.ts",
    "auth/logout/route.ts",
    "session/route.ts",
    "debug-error/route.ts",
    "users/search/route.ts"
  ],
  "2FA": [
    "2fa/setup/route.ts",
    "2fa/verify/route.ts",
    "2fa/disable/route.ts"
  ],
  "Organizations, Members & Invitations": [
    "organizations/route.ts",
    "organizations/search/route.ts",
    "organizations/[id]/route.ts",
    "organizations/[id]/invitations/route.ts",
    "organizations/[id]/members/route.ts",
    "organizations/[id]/members/me/route.ts",
    "organizations/[id]/members/[memberId]/route.ts",
    "organizations/[id]/members/[memberId]/resend/route.ts",
    "invitations/route.ts",
    "invitations/accept/route.ts",
    "invitations/decline/route.ts"
  ],
  "Datasets, Records & Columns": [
    "datasets/route.ts",
    "datasets/[id]/route.ts",
    "datasets/[id]/columns/route.ts",
    "datasets/[id]/columns/[columnId]/route.ts",
    "datasets/[id]/records/route.ts",
    "datasets/[id]/records/bulk/route.ts",
    "datasets/[id]/records/[recordId]/route.ts",
    "datasets/[id]/records/[recordId]/values/route.ts",
    "datasets/[id]/records/[recordId]/values/[valueId]/route.ts",
    "datasets/[id]/export/route.ts",
    "datasets/[id]/import/route.ts",
    "datasets/[id]/import-history/route.ts"
  ],
  "Schemas & Fields": [
    "schemas/route.ts",
    "schemas/[id]/route.ts",
    "schemas/[id]/clone/route.ts",
    "schemas/[id]/fields/route.ts",
    "schemas/[id]/fields/reorder/route.ts",
    "schemas/[id]/fields/[fieldId]/route.ts",
    "schemas/[id]/test-extraction/route.ts"
  ],
  "Sources, Rules, Runs & Scanning": [
    "sources/route.ts",
    "sources/test-scan/route.ts",
    "sources/[id]/route.ts",
    "sources/[id]/cancel-scan/route.ts",
    "sources/[id]/clone/route.ts",
    "sources/[id]/default-dataset/route.ts",
    "sources/[id]/emails/route.ts",
    "sources/[id]/extract/route.ts",
    "sources/[id]/rules/route.ts",
    "sources/[id]/runs/route.ts",
    "sources/[id]/scan/route.ts"
  ],
  "AI Extraction, Jobs & Logs": [
    "extraction/route.ts",
    "ai/extract-wizard/route.ts",
    "ai/model-status/route.ts",
    "ai-jobs/route.ts",
    "ai-jobs/[id]/route.ts",
    "ai-jobs/[id]/cancel/route.ts",
    "ai-jobs/[id]/logs/route.ts",
    "ai-jobs/[id]/outputs/route.ts",
    "ai-jobs/[id]/retry/route.ts",
    "agent-logs/route.ts"
  ],
  "AI Assistant & Sessions": [
    "assistant/chat/route.ts",
    "assistant/confirm/route.ts",
    "assistant/undo/route.ts",
    "assistant/sessions/route.ts",
    "assistant/sessions/[id]/route.ts"
  ],
  "Google Connections & OAuth": [
    "google/authorize/route.ts",
    "google/callback/route.ts",
    "google-connections/route.ts",
    "google-connections/[id]/route.ts"
  ],
  "Google Sheets Integration": [
    "google-sheets/auth/route.ts",
    "google-sheets/auth/callback/route.ts",
    "google-sheets/accounts/route.ts",
    "google-sheets/accounts/[id]/route.ts",
    "google-sheets/spreadsheets/route.ts",
    "google-sheets/spreadsheets/[id]/tabs/route.ts",
    "google-sheets/spreadsheets/[id]/preview/route.ts",
    "google-sheets/ai-mapping/route.ts",
    "google-sheets/link/route.ts",
    "google-sheets/mappings/[id]/route.ts",
    "google-sheets/mappings/[id]/sync/route.ts",
    "google-sheets/mappings/[id]/history/route.ts",
    "google-sheets/mappings/[id]/conflicts/route.ts",
    "google-sheets/mappings/[id]/conflicts/[conflictId]/resolve/route.ts",
    "google-sheets/mappings/[id]/schema-versions/route.ts",
    "google-sheets/mappings/[id]/schema-versions/[versionId]/rollback/route.ts",
    "google-sheets/import/route.ts",
    "google-sheets/import/[id]/route.ts",
    "google-sheets/export/route.ts",
    "google-sheets/org-export/route.ts",
    "cron/sheets-sync/route.ts"
  ],
  "Sharing & Access Governance": [
    "sharing/permissions/route.ts",
    "sharing/cross-org/route.ts",
    "sharing/cross-org/[id]/route.ts",
    "sharing/requests/route.ts",
    "sharing/requests/[id]/approve/route.ts",
    "sharing/requests/[id]/reject/route.ts"
  ],
  "Audit, Usage & Dashboard": [
    "audit/route.ts",
    "usage/route.ts",
    "usage/trends/route.ts",
    "dashboard/route.ts"
  ],
  "Webhooks": [
    "webhooks/route.ts",
    "webhooks/[id]/route.ts"
  ],
  "Invoices & Billing": [
    "invoices/route.ts"
  ],
  "Search": [
    "search/route.ts"
  ],
  "System / Jobs / Misc": [
    "jobs/process/route.ts",
    "health/route.ts",
    "route.ts"
  ]
};

let totalCount = 0;
const domainReports = {};

for (const [dom, files] of Object.entries(domains)) {
  totalCount += files.length;
  domainReports[dom] = files.map(file => {
    const fullPath = path.join('src/app/api', file);
    if (!fs.existsSync(fullPath)) {
      return { file, error: "File not found" };
    }
    const code = fs.readFileSync(fullPath, 'utf8');
    
    // Extract methods
    const methods = [];
    const methodRegex = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(([^)]*)\)/g;
    let m;
    while ((m = methodRegex.exec(code)) !== null) {
      methods.push(m[1]);
    }

    // Role checks
    const roleMatches = [...code.matchAll(/requireRole\s*\(\s*[^,]+,\s*["']([^"']+)["']\)/g)].map(x => x[1]);
    const hasOrgContext = code.includes('requireOrgContext');
    const hasExplicitOrg = code.includes('requireExplicitOrg');
    const hasCurrentUser = code.includes('getCurrentUser');
    const hasVerifyDatasetAccess = code.includes('verifyDatasetAccess');
    const hasAuthError = code.includes('authErrorResponse') || code.includes('instanceof AuthError');
    const hasZod = code.includes('z.');

    return {
      file,
      methods,
      auth: {
        hasOrgContext,
        hasExplicitOrg,
        hasCurrentUser,
        roles: roleMatches,
        hasVerifyDatasetAccess,
        hasAuthError
      },
      hasZod,
      lines: code.split('\n').length
    };
  });
}

console.log('Total categorized routes:', totalCount);
fs.writeFileSync('c:/CDS IIT JMU/.agents/explorer_survey_backend/domains_summary.json', JSON.stringify(domainReports, null, 2));
console.log('Domain summary written to domains_summary.json');
