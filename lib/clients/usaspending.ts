/**
 * USAspending.gov client — the free, live source of federal award data.
 *
 * Wraps POST /api/v2/search/spending_by_award/ (the same endpoint the seed-sbir
 * and seed-federal-contracts routes already use) behind a typed, retrying,
 * cached interface. Powers:
 *   - federal contract history per vendor
 *   - "which agencies a vendor supports" ($ + award count) — the past-
 *     performance proxy central to the vendor dossier.
 */

import { fetchJson } from '@/lib/http/fetch-with-retry'

const AWARD_SEARCH_URL =
  'https://api.usaspending.gov/api/v2/search/spending_by_award/'

// Contract award types (A/B/C/D) — excludes grants, loans, IDVs.
export const CONTRACT_AWARD_TYPES = ['A', 'B', 'C', 'D'] as const

export interface UsaSpendingAward {
  'Award ID': string
  'Recipient Name': string
  'Recipient UEI'?: string
  'Award Amount': number
  'Awarding Agency': string
  'Awarding Sub Agency': string
  'Start Date': string
  'End Date': string
  'Description': string
  'Award Type': string
  'NAICS Code'?: string
  'naics_code'?: string
  'Place of Performance State Code'?: string
  'Place of Performance Country Code'?: string
}

const DEFAULT_FIELDS = [
  'Award ID', 'Recipient Name', 'Recipient UEI', 'Award Amount',
  'Awarding Agency', 'Awarding Sub Agency',
  'Start Date', 'End Date', 'Description', 'Award Type',
  'NAICS Code',
  'Place of Performance State Code', 'Place of Performance Country Code',
]

export interface AwardSearchOptions {
  /** Text matched against recipient_search_text (legal name / DBA / UEI). */
  recipient: string
  /** Optional keyword filter (e.g. ['SBIR'] / ['STTR']). */
  keywords?: string[]
  /** Minimum award amount filter. */
  minAmount?: number
  /** Award type codes (default contracts A–D). */
  awardTypeCodes?: readonly string[]
  /** Inclusive time window. */
  timePeriod?: { start_date: string; end_date: string }
  page?: number
  limit?: number
  fields?: string[]
}

interface AwardSearchResponse {
  results?: UsaSpendingAward[]
  page_metadata?: { hasNext?: boolean; page?: number }
}

/** Single page of recipient award search. */
export async function searchAwardsByRecipient(
  opts: AwardSearchOptions
): Promise<{ results: UsaSpendingAward[]; hasNext: boolean }> {
  const body = {
    filters: {
      ...(opts.keywords?.length ? { keywords: opts.keywords } : {}),
      recipient_search_text: [opts.recipient],
      time_period: [
        opts.timePeriod ?? { start_date: '2007-10-01', end_date: '2026-12-31' },
      ],
      award_type_codes: [...(opts.awardTypeCodes ?? CONTRACT_AWARD_TYPES)],
      ...(opts.minAmount ? { award_amounts: [{ lower_bound: opts.minAmount }] } : {}),
    },
    fields: opts.fields ?? DEFAULT_FIELDS,
    limit: opts.limit ?? 100,
    page: opts.page ?? 1,
    sort: 'Award Amount',
    order: 'desc',
  }

  const data = await fetchJson<AwardSearchResponse>(
    AWARD_SEARCH_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { label: `usaspending ${opts.recipient} p${opts.page ?? 1}`, cacheTtlMs: 60_000 }
  )

  return {
    results: data.results ?? [],
    hasNext: data.page_metadata?.hasNext ?? false,
  }
}

/**
 * Collect awards for a recipient across multiple pages, de-duplicated on
 * Award ID. `maxPages` bounds work to keep serverless invocations within
 * timeout budgets.
 */
export async function collectAwardsByRecipient(
  recipient: string,
  opts: Omit<AwardSearchOptions, 'recipient' | 'page'> & { maxPages?: number } = {}
): Promise<UsaSpendingAward[]> {
  const { maxPages = 5, ...searchOpts } = opts
  const seen = new Set<string>()
  const out: UsaSpendingAward[] = []

  for (let page = 1; page <= maxPages; page++) {
    const { results, hasNext } = await searchAwardsByRecipient({
      ...searchOpts,
      recipient,
      page,
    })
    for (const award of results) {
      const id = award['Award ID']
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(award)
    }
    if (!hasNext) break
  }
  return out
}

export interface AgencyBreakdownRow {
  agency: string
  awardCount: number
  totalObligated: number
}

/**
 * Roll a set of awards up by awarding (sub-)agency — the "which agencies a
 * vendor supports" view. Pure function over already-collected awards.
 */
export function rollupAgencies(awards: UsaSpendingAward[]): AgencyBreakdownRow[] {
  const byAgency = new Map<string, AgencyBreakdownRow>()
  for (const a of awards) {
    const agency = (a['Awarding Sub Agency'] || a['Awarding Agency'] || '').trim()
    if (!agency) continue
    const row = byAgency.get(agency) ?? { agency, awardCount: 0, totalObligated: 0 }
    row.awardCount++
    row.totalObligated += a['Award Amount'] || 0
    byAgency.set(agency, row)
  }
  return Array.from(byAgency.values()).sort((x, y) => y.totalObligated - x.totalObligated)
}

/** Convenience: collect a recipient's contracts and return the agency rollup. */
export async function getRecipientAgencyBreakdown(
  recipient: string,
  opts: Omit<AwardSearchOptions, 'recipient' | 'page'> & { maxPages?: number } = {}
): Promise<{ agencies: AgencyBreakdownRow[]; totalObligated: number; awardCount: number }> {
  const awards = await collectAwardsByRecipient(recipient, opts)
  const agencies = rollupAgencies(awards)
  const totalObligated = agencies.reduce((s, a) => s + a.totalObligated, 0)
  const awardCount = awards.length
  return { agencies, totalObligated, awardCount }
}

/** Normalize the NAICS field (the API returns it under two spellings). */
export function awardNaics(award: UsaSpendingAward): string | null {
  return award['NAICS Code'] || award['naics_code'] || null
}
