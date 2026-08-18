// Workspace Intelligence Platform — Seed Data
// Run with: bun run prisma/db:seed.ts (or import in API on first load)
import { db } from "../src/lib/db";

async function main() {
  // ── Users ──────────────────────────────────────────────────────────────
  const alice = await db.user.upsert({
    where: { email: "alice@acme.io" },
    update: {},
    create: {
      email: "alice@acme.io",
      name: "Alice Chen",
      avatarUrl: "https://i.pravatar.cc/100?img=1",
      role: "admin",
    },
  });
  const bob = await db.user.upsert({
    where: { email: "bob@acme.io" },
    update: {},
    create: {
      email: "bob@acme.io",
      name: "Bob Martinez",
      avatarUrl: "https://i.pravatar.cc/100?img=2",
    },
  });
  const cara = await db.user.upsert({
    where: { email: "cara@acme.io" },
    update: {},
    create: {
      email: "cara@acme.io",
      name: "Cara Singh",
      avatarUrl: "https://i.pravatar.cc/100?img=3",
    },
  });
  const dan = await db.user.upsert({
    where: { email: "dan@partner.com" },
    update: {},
    create: {
      email: "dan@partner.com",
      name: "Dan Reyes",
      avatarUrl: "https://i.pravatar.cc/100?img=4",
    },
  });

  // ── Organization ───────────────────────────────────────────────────────
  const acme = await db.organization.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      name: "Acme Intelligence",
      slug: "acme",
      plan: "team",
      createdBy: alice.id,
    },
  });
  const partnerOrg = await db.organization.upsert({
    where: { slug: "partner-co" },
    update: {},
    create: {
      name: "Partner Co",
      slug: "partner-co",
      plan: "free",
      createdBy: dan.id,
    },
  });

  // ── Members ────────────────────────────────────────────────────────────
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: acme.id, userId: alice.id } },
    update: { role: "owner", status: "active" },
    create: { organizationId: acme.id, userId: alice.id, role: "owner", status: "active" },
  });
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: acme.id, userId: bob.id } },
    update: { role: "admin", status: "active" },
    create: { organizationId: acme.id, userId: bob.id, role: "admin", status: "active", invitedBy: alice.id },
  });
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: acme.id, userId: cara.id } },
    update: { role: "member", status: "active" },
    create: { organizationId: acme.id, userId: cara.id, role: "member", status: "active", invitedBy: alice.id },
  });
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: partnerOrg.id, userId: dan.id } },
    update: { role: "owner", status: "active" },
    create: { organizationId: partnerOrg.id, userId: dan.id, role: "owner", status: "active" },
  });

  // ── Google Connections (simulated acquisition layer) ───────────────────
  const conn1 = await db.googleConnection.create({
    data: {
      userId: alice.id,
      organizationId: acme.id,
      googleEmail: "alice@acme.io",
      scopes: "gmail.readonly,drive.metadata.readonly,docs.readonly",
      status: "active",
      watchExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  });
  const conn2 = await db.googleConnection.create({
    data: {
      userId: bob.id,
      organizationId: acme.id,
      googleEmail: "ops@acme.io",
      scopes: "gmail.readonly",
      status: "degraded",
      watchExpiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      lastSyncAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
    },
  });

  // ── Schemas ────────────────────────────────────────────────────────────
  const placementSchema = await db.schema.create({
    data: {
      organizationId: acme.id,
      createdBy: alice.id,
      name: "Placement Records",
      description: "Schema for extracting placement/internship opportunities from emails.",
      version: 2,
      promptTemplate:
        "Extract structured placement fields from the email bundle. Require explicit evidence for each value.",
      fields: {
        create: [
          { name: "company", type: "text", description: "Hiring company name", instructions: "Use the legal entity name when available.", required: true, position: 0 },
          { name: "role", type: "text", description: "Job title or role", required: true, position: 1 },
          { name: "location", type: "text", description: "Work location", position: 2 },
          { name: "ctc", type: "number", description: "Annual compensation in INR lakhs", position: 3 },
          { name: "eligibility", type: "array", description: "Eligibility criteria (degrees, branches, GPA)", position: 4 },
          { name: "deadline", type: "date", description: "Application deadline", required: true, position: 5 },
          { name: "jobType", type: "enum", description: "Full-time / Internship / Co-op", options: JSON.stringify(["full-time", "internship", "co-op"]), position: 6 },
          { name: "remoteFriendly", type: "boolean", description: "Whether remote work is allowed", position: 7 },
        ],
      },
    },
    include: { fields: true },
  });

  const invoiceSchema = await db.schema.create({
    data: {
      organizationId: acme.id,
      createdBy: bob.id,
      name: "Vendor Invoices",
      description: "Extract structured invoice data from vendor emails and PDFs.",
      version: 1,
      fields: {
        create: [
          { name: "vendor", type: "text", description: "Vendor name", required: true, position: 0 },
          { name: "invoiceNumber", type: "text", description: "Invoice number", required: true, position: 1 },
          { name: "amount", type: "number", description: "Invoice total", required: true, position: 2 },
          { name: "currency", type: "enum", options: JSON.stringify(["USD", "EUR", "INR", "GBP"]), position: 3 },
          { name: "dueDate", type: "date", description: "Payment due date", position: 4 },
          { name: "lineItems", type: "array", description: "Line item descriptions", position: 5 },
        ],
      },
    },
    include: { fields: true },
  });

  const supportSchema = await db.schema.create({
    data: {
      organizationId: acme.id,
      createdBy: cara.id,
      name: "Support Tickets",
      description: "Customer support tickets extracted from Gmail.",
      version: 1,
      fields: {
        create: [
          { name: "customer", type: "text", description: "Customer name", required: true, position: 0 },
          { name: "email", type: "text", description: "Customer email", required: true, position: 1 },
          { name: "priority", type: "enum", options: JSON.stringify(["low", "medium", "high", "urgent"]), position: 2 },
          { name: "category", type: "text", description: "Issue category", position: 3 },
          { name: "summary", type: "text", description: "One-line summary", position: 4 },
          { name: "tags", type: "multiselect", options: JSON.stringify(["billing", "bug", "feature", "account", "security"]), position: 5 },
        ],
      },
    },
    include: { fields: true },
  });

  // ── Datasets ───────────────────────────────────────────────────────────
  const placementDs = await db.dataset.create({
    data: {
      organizationId: acme.id,
      schemaId: placementSchema.id,
      createdBy: alice.id,
      name: "Placement Opportunities 2025",
      description: "All placement opportunities received in 2025 batch.",
      recordCount: 3,
    },
  });
  const invoiceDs = await db.dataset.create({
    data: {
      organizationId: acme.id,
      schemaId: invoiceSchema.id,
      createdBy: bob.id,
      name: "Q3 Vendor Invoices",
      recordCount: 2,
    },
  });
  const supportDs = await db.dataset.create({
    data: {
      organizationId: acme.id,
      schemaId: supportSchema.id,
      createdBy: cara.id,
      name: "Open Support Tickets",
      recordCount: 2,
    },
  });

  // ── Sources ────────────────────────────────────────────────────────────
  const source1 = await db.source.create({
    data: {
      organizationId: acme.id,
      ownerUserId: alice.id,
      googleConnectionId: conn1.id,
      schemaId: placementSchema.id,
      datasetId: placementDs.id,
      name: "Placement Cell Gmail",
      description: "Monitors placement@acme.io for opportunities.",
      sourceType: "gmail",
      status: "active",
      runState: "idle",
      scheduleMode: "interval",
      scheduleExpr: "6h",
      lastRunAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      nextRunAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      rules: {
        create: [
          { filterType: "sender", operator: "domain", value: JSON.stringify(["acme.io", "placements.edu"]), position: 0 },
          { filterType: "subject", operator: "contains", value: JSON.stringify(["placement", "opportunity", "internship", "job"]), position: 1 },
          { filterType: "attachment", operator: "required", value: JSON.stringify(true), position: 2 },
        ],
      },
    },
  });
  const source2 = await db.source.create({
    data: {
      organizationId: acme.id,
      ownerUserId: bob.id,
      googleConnectionId: conn2.id,
      schemaId: invoiceSchema.id,
      datasetId: invoiceDs.id,
      name: "Vendor Invoice Inbox",
      description: "Monitors billing@acme.io for vendor invoices.",
      sourceType: "gmail",
      status: "paused",
      runState: "idle",
      scheduleMode: "cron",
      scheduleExpr: "0 9 * * *",
      lastRunAt: new Date(Date.now() - 28 * 60 * 60 * 1000),
      rules: {
        create: [
          { filterType: "sender", operator: "domain", value: JSON.stringify(["vendor.com", "supplier.co"]), position: 0 },
          { filterType: "subject", operator: "contains", value: JSON.stringify(["invoice", "bill", "statement"]), position: 1 },
          { filterType: "attachment", operator: "fileType", value: JSON.stringify(["pdf", "xlsx"]), position: 2 },
        ],
      },
    },
  });
  const source3 = await db.source.create({
    data: {
      organizationId: acme.id,
      ownerUserId: cara.id,
      googleConnectionId: conn1.id,
      schemaId: supportSchema.id,
      datasetId: supportDs.id,
      name: "Customer Support Inbox",
      description: "Monitors support@acme.io for incoming tickets.",
      sourceType: "gmail",
      status: "active",
      runState: "extracting",
      scheduleMode: "interval",
      scheduleExpr: "15m",
      lastRunAt: new Date(Date.now() - 12 * 60 * 1000),
      nextRunAt: new Date(Date.now() + 3 * 60 * 1000),
      rules: {
        create: [
          { filterType: "sender", operator: "domain", value: JSON.stringify(["*"]), position: 0 },
          { filterType: "subject", operator: "contains", value: JSON.stringify(["help", "issue", "support", "ticket"]), position: 1 },
        ],
      },
    },
  });

  // ── Source Runs ────────────────────────────────────────────────────────
  await db.sourceRun.create({
    data: {
      sourceId: source1.id,
      status: "success",
      mode: "incremental",
      progress: 100,
      startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000 + 90 * 1000),
      stats: JSON.stringify({ emailsMatched: 12, attachmentsFound: 14, driveLinksDiscovered: 3, recordsExtracted: 11 }),
    },
  });
  await db.sourceRun.create({
    data: {
      sourceId: source1.id,
      status: "partial",
      mode: "historical",
      progress: 100,
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 18 * 60 * 1000),
      stats: JSON.stringify({ emailsMatched: 187, attachmentsFound: 203, recordsExtracted: 165, validationFailures: 22 }),
      errorMessage: "2 attachments exceeded size limit",
    },
  });
  await db.sourceRun.create({
    data: {
      sourceId: source2.id,
      status: "failed",
      mode: "incremental",
      progress: 34,
      startedAt: new Date(Date.now() - 28 * 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 28 * 60 * 60 * 1000 + 5 * 60 * 1000),
      errorMessage: "Token refresh failed — connection degraded",
    },
  });
  await db.sourceRun.create({
    data: {
      sourceId: source3.id,
      status: "running",
      mode: "incremental",
      progress: 64,
      startedAt: new Date(Date.now() - 4 * 60 * 1000),
      stats: JSON.stringify({ emailsMatched: 8, attachmentsFound: 2, recordsExtracted: 5 }),
    },
  });

  // ── Emails (sample matched) ────────────────────────────────────────────
  const e1 = await db.email.create({
    data: {
      sourceId: source1.id,
      googleMessageId: "msg-001",
      threadId: "thread-001",
      fromAddress: "placements@techcorp.com",
      toAddress: "placement@acme.io",
      ccAddresses: "students-batch2025@acme.io",
      subject: "[Placement] Software Engineer Intern — TechCorp (CTC 28 LPA, Remote)",
      snippet: "TechCorp is hiring Software Engineer Interns for Summer 2025. Open to CS/IT/EE students with CGPA 7.5+.",
      bodyText: "TechCorp is hiring Software Engineer Interns for Summer 2025.\n\nLocation: Bangalore (Remote-friendly)\nCTC: 28 LPA\nEligibility: B.Tech CS/IT/EE, CGPA 7.5+\nDeadline: 15 Oct 2025\n\nApply with resume and transcript. Refer attached JD.",
      receivedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      dedupHash: "hash-001",
      processingStatus: "extracted",
      attachments: {
        create: [
          { filename: "TechCorp_JD.pdf", mimeType: "application/pdf", size: 184320, status: "parsed" },
          { filename: "application_form.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 42189, status: "parsed" },
        ],
      },
      links: {
        create: [
          { url: "https://docs.google.com/document/d/abc123/edit", resourceType: "docs", resourceId: "abc123", resolved: true },
          { url: "https://forms.gle/xyz789", resourceType: "forms", resourceId: "xyz789", resolved: true },
        ],
      },
    },
  });
  const e2 = await db.email.create({
    data: {
      sourceId: source1.id,
      googleMessageId: "msg-002",
      threadId: "thread-002",
      fromAddress: "hr@finovate.io",
      toAddress: "placement@acme.io",
      subject: "[Internship] Quant Analyst Intern — Finovate (Mumbai, 45k stipend)",
      snippet: "Finovate is looking for a Quant Analyst Intern in Mumbai. Stipend 45k/month. Apply by 20 Oct 2025.",
      bodyText: "Finovate is hiring a Quant Analyst Intern.\n\nLocation: Mumbai (Onsite)\nStipend: 45,000 INR/month\nEligibility: B.Tech/M.Tech Math/Stats/CS\nDeadline: 20 Oct 2025",
      receivedAt: new Date(Date.now() - 28 * 60 * 60 * 1000),
      dedupHash: "hash-002",
      processingStatus: "extracted",
      attachments: { create: [{ filename: "Finovate_Intern.pdf", mimeType: "application/pdf", size: 92116, status: "parsed" }] },
    },
  });
  const e3 = await db.email.create({
    data: {
      sourceId: source3.id,
      googleMessageId: "msg-003",
      fromAddress: "john.customer@gmail.com",
      toAddress: "support@acme.io",
      subject: "URGENT: Cannot login to my account since yesterday",
      snippet: "Hi, I cannot login to my account since yesterday. Tried resetting password but email never arrives. Please help ASAP.",
      bodyText: "Hi support,\n\nI cannot login to my account since yesterday. I tried resetting my password but the email never arrives. This is urgent because I have a demo tomorrow.\n\nPlease help ASAP.\n\nJohn",
      receivedAt: new Date(Date.now() - 25 * 60 * 1000),
      dedupHash: "hash-003",
      processingStatus: "extracted",
    },
  });

  // ── Dataset Records (with evidence) ────────────────────────────────────
  const r1 = await db.datasetRecord.create({
    data: {
      datasetId: placementDs.id,
      sourceEmailId: e1.id,
      status: "approved",
      confidence: 0.94,
      values: {
        create: [
          { fieldId: placementSchema.fields[0].id, value: JSON.stringify("TechCorp"), confidence: 0.98, evidence: "From: placements@techcorp.com; Subject line: TechCorp", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[1].id, value: JSON.stringify("Software Engineer Intern"), confidence: 0.96, evidence: "Subject: Software Engineer Intern — TechCorp", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[2].id, value: JSON.stringify("Bangalore (Remote-friendly)"), confidence: 0.91, evidence: "Body: 'Location: Bangalore (Remote-friendly)'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[3].id, value: JSON.stringify(28), confidence: 0.93, evidence: "Body: 'CTC: 28 LPA'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[4].id, value: JSON.stringify(["B.Tech CS", "B.Tech IT", "B.Tech EE", "CGPA 7.5+"]), confidence: 0.88, evidence: "Body: 'Eligibility: B.Tech CS/IT/EE, CGPA 7.5+'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[5].id, value: JSON.stringify("2025-10-15"), confidence: 0.95, evidence: "Body: 'Deadline: 15 Oct 2025'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[6].id, value: JSON.stringify("internship"), confidence: 0.97, evidence: "Subject contains 'Intern'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[7].id, value: JSON.stringify(true), confidence: 0.89, evidence: "Location string contains 'Remote-friendly'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
        ],
      },
    },
  });
  const r2 = await db.datasetRecord.create({
    data: {
      datasetId: placementDs.id,
      sourceEmailId: e2.id,
      status: "valid",
      confidence: 0.91,
      values: {
        create: [
          { fieldId: placementSchema.fields[0].id, value: JSON.stringify("Finovate"), confidence: 0.96, evidence: "From: hr@finovate.io", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[1].id, value: JSON.stringify("Quant Analyst Intern"), confidence: 0.94, evidence: "Subject: Quant Analyst Intern — Finovate", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[2].id, value: JSON.stringify("Mumbai (Onsite)"), confidence: 0.92, evidence: "Body: 'Location: Mumbai (Onsite)'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[3].id, value: JSON.stringify(5.4), confidence: 0.79, evidence: "Body: 'Stipend: 45,000 INR/month' (annualized: 5.4 LPA)", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[4].id, value: JSON.stringify(["B.Tech Math", "B.Tech Stats", "B.Tech CS", "M.Tech Math/Stats/CS"]), confidence: 0.86, evidence: "Body: 'Eligibility: B.Tech/M.Tech Math/Stats/CS'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[5].id, value: JSON.stringify("2025-10-20"), confidence: 0.93, evidence: "Body: 'Deadline: 20 Oct 2025'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[6].id, value: JSON.stringify("internship"), confidence: 0.97, evidence: "Subject contains 'Internship'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[7].id, value: JSON.stringify(false), confidence: 0.84, evidence: "Location: 'Mumbai (Onsite)' — no remote mention", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
        ],
      },
    },
  });
  const r3 = await db.datasetRecord.create({
    data: {
      datasetId: placementDs.id,
      status: "needs_review",
      confidence: 0.62,
      values: {
        create: [
          { fieldId: placementSchema.fields[0].id, value: JSON.stringify("Unknown Corp"), confidence: 0.55, evidence: "Subject contained partial match 'Corp' — sender domain was generic", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[1].id, value: JSON.stringify("Data Engineer"), confidence: 0.48, evidence: "Subject: 'Data Engineer opening' — inferred from keywords only", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
          { fieldId: placementSchema.fields[5].id, value: JSON.stringify(null), confidence: 0.1, evidence: "No deadline mentioned in source material", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v2" },
        ],
      },
    },
  });

  // ── Invoice Dataset Records ────────────────────────────────────────────
  await db.datasetRecord.create({
    data: {
      datasetId: invoiceDs.id,
      status: "approved",
      confidence: 0.96,
      values: {
        create: [
          { fieldId: invoiceSchema.fields[0].id, value: JSON.stringify("CloudServe Inc"), confidence: 0.97, evidence: "From: billing@cloudserve.com", sourceFile: "invoice_4821.pdf", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: invoiceSchema.fields[1].id, value: JSON.stringify("INV-4821"), confidence: 0.99, evidence: "PDF header: 'Invoice #INV-4821'", sourceFile: "invoice_4821.pdf", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: invoiceSchema.fields[2].id, value: JSON.stringify(12450.00), confidence: 0.98, evidence: "PDF total row: '$12,450.00'", sourceFile: "invoice_4821.pdf", pageNumber: 2, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: invoiceSchema.fields[3].id, value: JSON.stringify("USD"), confidence: 0.95, evidence: "Currency symbol '$' on total", sourceFile: "invoice_4821.pdf", pageNumber: 2, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: invoiceSchema.fields[4].id, value: JSON.stringify("2025-11-30"), confidence: 0.93, evidence: "PDF: 'Due: 30 Nov 2025'", sourceFile: "invoice_4821.pdf", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
        ],
      },
    },
  });
  await db.datasetRecord.create({
    data: {
      datasetId: invoiceDs.id,
      status: "needs_review",
      confidence: 0.71,
      values: {
        create: [
          { fieldId: invoiceSchema.fields[0].id, value: JSON.stringify("Vendor X"), confidence: 0.65, evidence: "Inferred from sender domain 'vendorx.co'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: invoiceSchema.fields[1].id, value: JSON.stringify("VX-0922"), confidence: 0.82, evidence: "Subject: 'Invoice VX-0922 attached'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: invoiceSchema.fields[2].id, value: JSON.stringify(8200), confidence: 0.61, evidence: "Attachment was image-only; OCR confidence low", sourceFile: "VX-0922.png", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
        ],
      },
    },
  });

  // ── Support Dataset Records ────────────────────────────────────────────
  await db.datasetRecord.create({
    data: {
      datasetId: supportDs.id,
      sourceEmailId: e3.id,
      status: "valid",
      confidence: 0.92,
      values: {
        create: [
          { fieldId: supportSchema.fields[0].id, value: JSON.stringify("John Customer"), confidence: 0.89, evidence: "From: john.customer@gmail.com; signature: 'John'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: supportSchema.fields[1].id, value: JSON.stringify("john.customer@gmail.com"), confidence: 0.99, evidence: "From header", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: supportSchema.fields[2].id, value: JSON.stringify("urgent"), confidence: 0.95, evidence: "Subject: 'URGENT: Cannot login...'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: supportSchema.fields[3].id, value: JSON.stringify("account"), confidence: 0.87, evidence: "Body: 'cannot login to my account'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: supportSchema.fields[4].id, value: JSON.stringify("User cannot login; password reset email not arriving"), confidence: 0.91, evidence: "Body summary", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
          { fieldId: supportSchema.fields[5].id, value: JSON.stringify(["account", "bug"]), confidence: 0.84, evidence: "Inferred from 'cannot login' + 'email never arrives'", sourceFile: "email-body", pageNumber: 1, modelUsed: "gemini-1.5-pro", promptVersion: "v1" },
        ],
      },
    },
  });

  // ── AI Jobs ────────────────────────────────────────────────────────────
  await db.aiJob.createMany({
    data: [
      { organizationId: acme.id, userId: alice.id, type: "GMAIL_SCAN", status: "success", progress: 100, payload: JSON.stringify({ sourceId: source1.id }), result: JSON.stringify({ matched: 12 }), startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), finishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000 + 90 * 1000) },
      { organizationId: acme.id, userId: alice.id, type: "AI_EXTRACTION", status: "success", progress: 100, payload: JSON.stringify({ sourceId: source1.id, schemaId: placementSchema.id }), result: JSON.stringify({ recordsExtracted: 11, avgConfidence: 0.89 }), startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000 + 100 * 1000), finishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000 + 240 * 1000) },
      { organizationId: acme.id, userId: bob.id, type: "GMAIL_SCAN", status: "failed", progress: 34, payload: JSON.stringify({ sourceId: source2.id }), errorMessage: "Token refresh failed", attempts: 3, startedAt: new Date(Date.now() - 28 * 60 * 60 * 1000), finishedAt: new Date(Date.now() - 28 * 60 * 60 * 1000 + 5 * 60 * 1000) },
      { organizationId: acme.id, userId: cara.id, type: "AI_EXTRACTION", status: "running", progress: 64, payload: JSON.stringify({ sourceId: source3.id, schemaId: supportSchema.id }), startedAt: new Date(Date.now() - 4 * 60 * 1000) },
      { organizationId: acme.id, type: "DOCUMENT_PARSE", status: "queued", progress: 0, payload: JSON.stringify({ emailId: e1.id, attachment: "TechCorp_JD.pdf" }) },
      { organizationId: acme.id, type: "DRIVE_DISCOVERY", status: "success", progress: 100, payload: JSON.stringify({ emailId: e1.id }), result: JSON.stringify({ docsFound: 1, formsFound: 1 }) },
      { organizationId: acme.id, type: "AI_VALIDATION", status: "dlq", progress: 100, attempts: 5, payload: JSON.stringify({ recordIds: [r3.id] }), errorMessage: "Schema validation failed repeatedly", startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000), finishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
      { organizationId: acme.id, type: "EXPORT", status: "success", progress: 100, payload: JSON.stringify({ datasetId: placementDs.id, format: "csv" }), result: JSON.stringify({ rows: 3, file: "placement_export.csv" }), startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), finishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 8 * 1000) },
    ],
  });

  // ── AI Outputs ─────────────────────────────────────────────────────────
  const jobs = await db.aiJob.findMany({ where: { organizationId: acme.id } });
  for (const job of jobs.slice(0, 4)) {
    await db.aiOutput.create({
      data: {
        jobId: job.id,
        modelUsed: "gemini-1.5-pro",
        promptHash: "ph_" + job.id.slice(0, 8),
        rawResponse: JSON.stringify({ extracted: true, tokensIn: 1240, tokensOut: 380 }),
        tokensUsed: 1620,
      },
    });
  }

  // ── Audit Logs ─────────────────────────────────────────────────────────
  await db.auditLog.createMany({
    data: [
      { organizationId: acme.id, actorType: "user", actorId: alice.id, action: "create", entity: "source", entityId: source1.id, after: JSON.stringify({ name: "Placement Cell Gmail" }), reason: "Created new Gmail source" },
      { organizationId: acme.id, actorType: "ai", action: "extract", entity: "record", entityId: r1.id, after: JSON.stringify({ confidence: 0.94, fields: 8 }), reason: "AI extraction completed" },
      { organizationId: acme.id, actorType: "user", actorId: alice.id, action: "approve", entity: "record", entityId: r1.id, before: JSON.stringify({ status: "valid" }), after: JSON.stringify({ status: "approved" }), reason: "Reviewed and approved" },
      { organizationId: acme.id, actorType: "system", action: "fail", entity: "job", entityId: jobs[2]?.id, after: JSON.stringify({ error: "Token refresh failed" }), reason: "Gmail connection degraded" },
      { organizationId: acme.id, actorType: "user", actorId: bob.id, action: "update", entity: "source", entityId: source2.id, before: JSON.stringify({ status: "active" }), after: JSON.stringify({ status: "paused" }), reason: "Paused during vendor transition" },
      { organizationId: acme.id, actorType: "user", actorId: alice.id, action: "export", entity: "dataset", entityId: placementDs.id, after: JSON.stringify({ format: "csv", rows: 3 }), reason: "Exported placement dataset" },
    ],
  });

  // ── Sharing ────────────────────────────────────────────────────────────
  await db.sharingPermission.create({
    data: {
      datasetId: placementDs.id,
      organizationId: partnerOrg.id,
      level: "read",
      fieldScope: JSON.stringify({ exclude: ["ctc"] }),
      rowFilter: JSON.stringify({ jobType: ["internship"] }),
    },
  });
  await db.sharingRequest.create({
    data: {
      organizationId: acme.id,
      datasetId: invoiceDs.id,
      requestedBy: dan.id,
      status: "pending",
      level: "read",
      reason: "Need to reconcile Q3 invoices for partner billing.",
    },
  });

  // ── Usage Metrics ──────────────────────────────────────────────────────
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  await db.usageMetric.createMany({
    data: [
      { organizationId: acme.id, metricType: "ai_tokens", value: 482300, periodStart: startOfMonth, periodEnd: endOfMonth },
      { organizationId: acme.id, metricType: "emails_scanned", value: 1847, periodStart: startOfMonth, periodEnd: endOfMonth },
      { organizationId: acme.id, metricType: "documents_parsed", value: 312, periodStart: startOfMonth, periodEnd: endOfMonth },
      { organizationId: acme.id, metricType: "exports", value: 18, periodStart: startOfMonth, periodEnd: endOfMonth },
      { organizationId: acme.id, metricType: "storage", value: 1280, periodStart: startOfMonth, periodEnd: endOfMonth },
    ],
  });

  console.log("✅ Seed complete");
  console.log({ alice: alice.id, acme: acme.id, placementSchema: placementSchema.id, placementDs: placementDs.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
