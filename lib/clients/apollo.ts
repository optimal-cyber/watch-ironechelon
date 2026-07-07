/**
 * Apollo.io organization enrichment — private-capital detail (total funding,
 * latest round, investors, headcount) to complement the free government-funding
 * backbone.
 *
 * IMPORTANT: `apollo_organizations_enrich` is an MCP tool bound to the agent
 * session; the deployed app cannot call it. So there are two paths:
 *   1. If APOLLO_API_KEY is set → call Apollo's REST endpoint server-side.
 *   2. Otherwise → an operator (or Claude via the MCP tool, with the required
 *      per-run credit confirmation) POSTs a payload to the admin apollo route,
 *      which normalizes it with `normalizeApolloOrg` below.
 */

import { fetchJson } from '@/lib/http/fetch-with-retry'

export interface ApolloFunding {
  totalFunding: number | null
  latestRoundStage: string | null
  latestRoundDate: string | null
  employees: number | null
  annualRevenue: number | null
  foundedYear: number | null
  rounds: { stage: string | null; date: string | null; amount: number | null; investors: string[] }[]
}

// Loosely-typed subset of Apollo's organization object.
interface ApolloOrg {
  total_funding?: number | string | null
  latest_funding_stage?: string | null
  latest_funding_round_date?: string | null
  estimated_num_employees?: number | null
  annual_revenue?: number | string | null
  founded_year?: number | null
  funding_events?: Array<{
    type?: string | null
    date?: string | null
    amount?: number | string | null
    investors?: string | string[] | null
  }> | null
}

function toNumber(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Normalize an Apollo organization object (from REST or the MCP tool). */
export function normalizeApolloOrg(org: ApolloOrg): ApolloFunding {
  const rounds = (org.funding_events ?? []).map((e) => ({
    stage: e.type ?? null,
    date: e.date ?? null,
    amount: toNumber(e.amount),
    investors: Array.isArray(e.investors)
      ? e.investors
      : e.investors
      ? String(e.investors).split(/,\s*/).filter(Boolean)
      : [],
  }))

  return {
    totalFunding: toNumber(org.total_funding),
    latestRoundStage: org.latest_funding_stage ?? null,
    latestRoundDate: org.latest_funding_round_date ?? null,
    employees: org.estimated_num_employees ?? null,
    annualRevenue: toNumber(org.annual_revenue),
    foundedYear: org.founded_year ?? null,
    rounds,
  }
}

/** Derive a company domain for enrichment: website first, then SAM entity URL. */
export function resolveVendorDomain(input: { website?: string | null; samEntityUrl?: string | null }): string | null {
  const raw = input.website || input.samEntityUrl
  if (!raw) return null
  try {
    const url = raw.startsWith('http') ? raw : `https://${raw}`
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Server-side enrichment via Apollo's REST API. Requires APOLLO_API_KEY.
 * Throws if the key is absent (use the MCP + admin-route path instead).
 */
export async function enrichByDomain(domain: string): Promise<ApolloFunding> {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY not set — enrich via the MCP tool + admin apollo route instead')
  }
  const data = await fetchJson<{ organization?: ApolloOrg }>(
    `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`,
    { method: 'POST', headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' } },
    { label: `apollo ${domain}`, cacheTtlMs: 60 * 60_000 }
  )
  if (!data.organization) throw new Error(`Apollo returned no organization for ${domain}`)
  return normalizeApolloOrg(data.organization)
}
