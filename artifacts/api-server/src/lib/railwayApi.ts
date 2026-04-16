/**
 * Railway GraphQL API wrapper for programmatic custom-domain management.
 *
 * Railway exposes a GraphQL API at https://backboard.railway.com/graphql/v2.
 * Authentication is via a Personal Access Token in the Authorization header.
 *
 * Required env vars (RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID,
 * RAILWAY_ENVIRONMENT_ID) are injected automatically by Railway at runtime
 * for every service — we don't need the user to configure them manually.
 * Only RAILWAY_API_TOKEN must be added to the service Variables.
 *
 * Design: all functions are non-throwing (return { ok, error } or null) so
 * that a Railway outage cannot crash our endpoint handlers or cron jobs.
 */

const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2";

const RAILWAY_API_TOKEN     = process.env.RAILWAY_API_TOKEN ?? "";
const RAILWAY_SERVICE_ID    = process.env.RAILWAY_SERVICE_ID ?? "";
const RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID ?? "";
const RAILWAY_PROJECT_ID    = process.env.RAILWAY_PROJECT_ID ?? "";

// Main internal target port — where the SPA/API listens. Railway routes
// incoming requests on the custom domain to this port.
const TARGET_PORT = Number(process.env.PORT ?? 3000);

export function isRailwayApiEnabled(): boolean {
  return !!(RAILWAY_API_TOKEN && RAILWAY_SERVICE_ID && RAILWAY_ENVIRONMENT_ID);
}

interface RailwayResponse<T> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

async function railwayGraphQL<T = any>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<RailwayResponse<T>> {
  try {
    const res = await fetch(RAILWAY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RAILWAY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as RailwayResponse<T>;
    return json;
  } catch (e: any) {
    return { errors: [{ message: e?.message ?? "network_error" }] };
  }
}

// ─── addCustomDomain ───────────────────────────────────────────────────────
//
// Registers a hostname on the target Railway service. Railway then:
//  1. Verifies the CNAME record points at Railway's edge
//  2. Provisions a Let's Encrypt SSL certificate
//  3. Routes incoming traffic on that hostname to our service
//
// Returns { ok: true, id } on success, or { ok: false, error } on failure.
// Already-exists is treated as success (idempotent) so calling activate
// twice for the same domain is safe.

export interface AddDomainResult {
  ok:     boolean;
  id?:    string;
  error?: string;
}

export async function addCustomDomain(domain: string): Promise<AddDomainResult> {
  if (!isRailwayApiEnabled()) {
    return { ok: false, error: "railway_api_not_configured" };
  }

  const mutation = `
    mutation CustomDomainCreate($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        domain
      }
    }
  `;

  const response = await railwayGraphQL<{ customDomainCreate: { id: string; domain: string } }>(
    mutation,
    {
      input: {
        domain,
        environmentId: RAILWAY_ENVIRONMENT_ID,
        serviceId:     RAILWAY_SERVICE_ID,
        projectId:     RAILWAY_PROJECT_ID || undefined,
        targetPort:    TARGET_PORT,
      },
    },
  );

  if (response.data?.customDomainCreate?.id) {
    return { ok: true, id: response.data.customDomainCreate.id };
  }

  // Railway returns a specific error message when the domain is already
  // registered — treat that as success since the end state (domain attached)
  // is what we want.
  const errorMsg = response.errors?.[0]?.message ?? "unknown_error";
  if (/already|exists|duplicate/i.test(errorMsg)) {
    return { ok: true };
  }

  return { ok: false, error: errorMsg };
}

// ─── getCustomDomainStatus ─────────────────────────────────────────────────
//
// Polls Railway for the verification + SSL state of a hostname. Status
// values Railway can return (per current schema):
//   - "waiting"    — DNS not yet pointing at Railway (or still propagating)
//   - "pending"    — DNS looks right, SSL being provisioned
//   - "active"     — fully operational (SSL issued, traffic routing)
//   - anything else — treat as "pending"
//
// Returns null if the domain is not registered on Railway at all.

export type DomainStatus = "waiting" | "pending" | "active" | "unknown";

export interface DomainStatusResult {
  status:  DomainStatus;
  raw?:    unknown;
}

export async function getCustomDomainStatus(domain: string): Promise<DomainStatusResult | null> {
  if (!isRailwayApiEnabled()) return null;

  const query = `
    query CustomDomains($projectId: String!, $environmentId: String!, $serviceId: String!) {
      customDomains(
        projectId:     $projectId
        environmentId: $environmentId
        serviceId:     $serviceId
      ) {
        customDomains {
          id
          domain
          status { dnsRecords { status } cdnProvider }
        }
      }
    }
  `;

  const response = await railwayGraphQL<{
    customDomains: {
      customDomains: Array<{
        id:     string;
        domain: string;
        status: { dnsRecords: Array<{ status: string }>; cdnProvider: string | null };
      }>;
    };
  }>(query, {
    projectId:     RAILWAY_PROJECT_ID,
    environmentId: RAILWAY_ENVIRONMENT_ID,
    serviceId:     RAILWAY_SERVICE_ID,
  });

  const list = response.data?.customDomains?.customDomains ?? [];
  const match = list.find(d => d.domain.toLowerCase() === domain.toLowerCase());
  if (!match) return null;

  // Railway reports per-DNS-record status. If every record status is
  // "PROPAGATED" AND CDN provider is set, the domain is fully active.
  const records = match.status?.dnsRecords ?? [];
  const allPropagated = records.length > 0 && records.every(r => /propagated|valid|ok/i.test(r.status ?? ""));
  const cdnReady      = !!match.status?.cdnProvider;

  let status: DomainStatus = "waiting";
  if (allPropagated && cdnReady) status = "active";
  else if (allPropagated)        status = "pending";
  else if (records.length === 0) status = "unknown";

  return { status, raw: match };
}

// ─── removeCustomDomain ────────────────────────────────────────────────────
//
// Call when the business removes/changes their domain. Safe to call for a
// domain that was never registered on Railway — errors are swallowed.

export async function removeCustomDomain(domain: string): Promise<void> {
  if (!isRailwayApiEnabled()) return;

  // Resolve the domain's Railway ID first — the delete mutation needs it.
  const status = await getCustomDomainStatus(domain);
  const id = (status?.raw as any)?.id as string | undefined;
  if (!id) return;

  const mutation = `
    mutation CustomDomainDelete($id: String!) {
      customDomainDelete(id: $id)
    }
  `;
  await railwayGraphQL(mutation, { id });
}
