/**
 * SBIR.gov awards API client — America's Seed Fund R&D awards, a strong signal
 * of a small vendor's technical maturity and government R&D pedigree.
 *
 * Endpoint: https://api.www.sbir.gov/public/api/awards (JSON). Rate-limits
 * aggressively (429) — all calls go through fetchJson's backoff. For bulk
 * universe seeding, prefer the CSV path in prisma/seed-sbir.ts.
 */

import { fetchJson } from '@/lib/http/fetch-with-retry'

const AWARDS_URL = 'https://api.www.sbir.gov/public/api/awards'

export interface SbirAward {
  firm?: string
  award_title?: string
  agency?: string
  branch?: string
  phase?: string
  program?: string
  contract?: string
  agency_tracking_number?: string
  proposal_award_date?: string
  contract_end_date?: string
  solicitation_year?: number | string
  topic_code?: string
  award_year?: number | string
  award_amount?: number | string
  uei?: string
  duns?: string
  pi_name?: string
  research_keywords?: string
  abstract?: string
  women_owned?: string | boolean
  hubzone_owned?: string | boolean
  socially_economically_disadvantaged?: string | boolean
}

export interface SbirSearchOptions {
  agency?: string
  year?: number
  start?: number
  rows?: number
  /** Retry budget override (default 2). The weekly cron can pass more. */
  retries?: number
}

/**
 * Fetch SBIR/STTR awards for a firm. The API matches the firm name loosely;
 * callers should still verify results against their canonical vendor name.
 */
export async function searchAwardsByFirm(
  firm: string,
  opts: SbirSearchOptions = {}
): Promise<SbirAward[]> {
  const params = new URLSearchParams({
    firm,
    format: 'json',
    rows: String(opts.rows ?? 100),
    start: String(opts.start ?? 0),
  })
  if (opts.agency) params.set('agency', opts.agency)
  if (opts.year) params.set('year', String(opts.year))

  // Fail fast: SBIR rate-limits hard (429). A short retry budget keeps this
  // off the request-path critical section; the weekly cron backfills misses.
  const data = await fetchJson<SbirAward[] | { results?: SbirAward[] }>(
    `${AWARDS_URL}?${params.toString()}`,
    {},
    {
      label: `sbir ${firm}`,
      cacheTtlMs: 10 * 60_000,
      retries: opts.retries ?? 2,
      baseDelayMs: 400,
      maxDelayMs: 3000,
      timeoutMs: 8000,
    }
  )
  // The API returns a bare array; guard for a wrapped shape just in case.
  return Array.isArray(data) ? data : data.results ?? []
}

/** Normalize a phase string ("Phase II" / "2") to "I" | "II" | "III". */
export function normalizeSbirPhase(phase: string | undefined | null): string | null {
  if (!phase) return null
  const p = String(phase).toUpperCase()
  if (/\bIII\b|\b3\b/.test(p)) return 'III'
  if (/\bII\b|\b2\b/.test(p)) return 'II'
  if (/\bI\b|\b1\b/.test(p)) return 'I'
  return null
}

/** Coerce the award amount (which the API returns as string or number). */
export function sbirAmount(award: SbirAward): number | null {
  if (award.award_amount == null) return null
  const n =
    typeof award.award_amount === 'number'
      ? award.award_amount
      : parseFloat(String(award.award_amount).replace(/[",$]/g, ''))
  return Number.isFinite(n) ? n : null
}
