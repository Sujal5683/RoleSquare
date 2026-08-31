/**
 * Centralized Query Key Factory
 *
 * IMPORTANT: Every useQuery and useMutation in the app MUST use these keys.
 * This ensures that invalidateQueries({ queryKey: qk.sources(orgId) }) always
 * matches the correct queries -- no more silent cache mismatches due to
 * inconsistent key shapes.
 *
 * React Query matches keys by PREFIX. So:
 *   qk.sources(orgId)  -> ["sources", orgId]   -- exact match
 *   ["sources"]         -> prefix match hitting ALL sources queries
 *
 * Use the exact orgId-scoped key in queries, and the prefix (no orgId) in
 * invalidateQueries when you want to bust all orgs (e.g. after switching org).
 */

// -- Sources ------------------------------------------------------------------

export const qk = {
  sources:        (orgId: string)                      => ["sources", orgId] as const,
  source:         (sourceId: string)                   => ["source", sourceId] as const,
  sourceRuns:     (sourceId: string)                   => ["source-runs", sourceId] as const,

  // -- Datasets ----------------------------------------------------------------

  datasets:       (orgId: string)                      => ["datasets", orgId] as const,
  dataset:        (datasetId: string)                  => ["dataset", datasetId] as const,
  records:        (datasetId: string, params?: object) => ["dataset-records", datasetId, params] as const,

  // -- Schemas -----------------------------------------------------------------

  schemas:        (orgId: string)                      => ["schemas", orgId] as const,
  schema:         (schemaId: string)                   => ["schema", schemaId] as const,

  // -- AI Jobs -----------------------------------------------------------------

  jobs:           ()                                   => ["ai-jobs"] as const,
  job:            (jobId: string)                      => ["ai-job", jobId] as const,
  jobOutputs:     (jobId: string)                      => ["ai-outputs", jobId] as const,

  // -- Dashboard ---------------------------------------------------------------

  dashboard:      (orgId: string, dateRange?: string)  => ["dashboard", orgId, dateRange] as const,
  activity:       (orgId: string)                      => ["dashboard-activity", orgId] as const,

  // -- Auth / Session ----------------------------------------------------------

  session:        ()                                   => ["session"] as const,
  connections:    ()                                   => ["google-connections"] as const,

  // -- Members / Invitations ---------------------------------------------------

  members:        (orgId: string)                      => ["members", orgId] as const,
  invitations:    (orgId: string)                      => ["invitations", orgId] as const,

  // -- Usage -------------------------------------------------------------------

  usage:          (orgId: string)                      => ["usage", orgId] as const,
  usageTrends:    ()                                   => ["usage-trends"] as const,

  // -- Settings ----------------------------------------------------------------

  webhooks:       (orgId: string)                      => ["webhooks", orgId] as const,
  sharing:        (orgId: string)                      => ["sharing", orgId] as const,
} as const;

/**
 * Prefix keys for broad invalidations (hits all sub-keys).
 * Use these in invalidateQueries when you want to bust ALL queries for a
 * resource regardless of org/id.
 */
export const qkPrefix = {
  sources:    ["sources"]         as const,
  datasets:   ["datasets"]        as const,
  schemas:    ["schemas"]         as const,
  jobs:       ["ai-jobs"]         as const,
  dashboard:  ["dashboard"]       as const,
  records:    ["dataset-records"] as const,
  sourceRuns: ["source-runs"]     as const,
} as const;
