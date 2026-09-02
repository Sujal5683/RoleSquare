-- 1. Create helper functions for RLS
CREATE OR REPLACE FUNCTION public.get_auth_email()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'email')::text;
$$;

CREATE OR REPLACE FUNCTION public.is_member_of(org_id text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public."OrganizationMember" om
    JOIN public."User" u ON u.id = om."userId"
    WHERE om."organizationId" = org_id
      AND om.status = 'active'
      AND u.email = public.get_auth_email()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_dataset_access(ds_id text, ds_org_id text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_member_of(ds_org_id)
  OR EXISTS (
    SELECT 1 
    FROM public."DatasetAccess" da
    WHERE da."datasetId" = ds_id 
      AND da.status = 'active' 
      AND da."isPaused" = false
      AND (
        (da."granteeOrgId" IS NOT NULL AND public.is_member_of(da."granteeOrgId"))
        OR 
        (da."granteeUserId" IS NOT NULL AND da."granteeUserId" = (
           SELECT id FROM public."User" WHERE email = public.get_auth_email() LIMIT 1
        ))
      )
  );
$$;

-- 2. Enable RLS on ALL tables to default-deny access
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Source" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SourceRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SourceRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Email" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Schema" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchemaField" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dataset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiOutput" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SharingRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SharingPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Webhook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrossOrgPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleSheetsAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpreadsheetConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SheetMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetSchemaVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetColumnDef" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetRowExternalId" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncConflict" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssistantSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssistantMessage" ENABLE ROW LEVEL SECURITY;

-- 3. Create SELECT policies for tables that need Realtime streaming to the frontend

-- AiJob
CREATE POLICY "Enable read access for organization members" 
ON "AiJob" FOR SELECT TO authenticated 
USING ( public.is_member_of("organizationId") );

-- Source
CREATE POLICY "Enable read access for organization members" 
ON "Source" FOR SELECT TO authenticated 
USING ( public.is_member_of("organizationId") );

-- SourceRun (joins Source to check org)
CREATE POLICY "Enable read access for organization members" 
ON "SourceRun" FOR SELECT TO authenticated 
USING ( 
  EXISTS (
    SELECT 1 FROM "Source" s 
    WHERE s.id = "SourceRun"."sourceId" 
    AND public.is_member_of(s."organizationId")
  )
);

-- Schema
CREATE POLICY "Enable read access for organization members" 
ON "Schema" FOR SELECT TO authenticated 
USING ( public.is_member_of("organizationId") );

-- Dataset (checks ownership + DatasetAccess rules)
CREATE POLICY "Enable read access for dataset members" 
ON "Dataset" FOR SELECT TO authenticated 
USING ( public.has_dataset_access(id, "organizationId") );

-- DatasetRecord (joins Dataset to check access)
CREATE POLICY "Enable read access for dataset members" 
ON "DatasetRecord" FOR SELECT TO authenticated 
USING ( 
  EXISTS (
    SELECT 1 FROM "Dataset" d 
    WHERE d.id = "DatasetRecord"."datasetId" 
    AND public.has_dataset_access(d.id, d."organizationId")
  )
);
