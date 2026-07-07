/**
 * ATO-relevance scoring for federal contract awards.
 *
 * Produces the 0–100 `atoRelevanceScore` the `/ato` "Contract Intel" tab already
 * renders as a progress bar (but which had no writer, so the tab was always
 * empty). Higher score = the award is more likely cloud / cyber / IT hosting
 * work that requires an Authorization to Operate — i.e. the vendors a security-
 * minded contracting officer cares about.
 */

import type { UsaSpendingAward } from '@/lib/clients/usaspending'
import { awardNaics } from '@/lib/clients/usaspending'

// NAICS codes strongly associated with IT / cloud / hosting / cyber work.
const HIGH_VALUE_NAICS = new Set([
  '518210', // Data Processing, Hosting, and Related Services
  '541511', // Custom Computer Programming Services
  '541512', // Computer Systems Design Services
  '541513', // Computer Facilities Management Services
  '541519', // Other Computer Related Services
  '517311', // Wired Telecommunications Carriers
  '517410', // Satellite Telecommunications
  '541690', // Other Scientific and Technical Consulting
])

interface KeywordRule {
  points: number
  test: RegExp
}

// Description keyword signals, weighted by how ATO-specific they are.
const KEYWORD_RULES: KeywordRule[] = [
  { points: 40, test: /\bfedramp\b/i },
  { points: 35, test: /authorization to operate|\bATO\b/ },
  { points: 30, test: /\bRMF\b|risk management framework/i },
  { points: 25, test: /\bIL[2-6]\b|impact level/i },
  { points: 25, test: /zero[- ]trust/i },
  { points: 20, test: /\bcloud\b|\bIaaS\b|\bPaaS\b|\bSaaS\b/i },
  { points: 20, test: /cyber\s?security|\bcyber\b/i },
  { points: 15, test: /data center|hosting|managed services/i },
  { points: 15, test: /information (system|assurance)|\bSIEM\b/i },
  { points: 10, test: /software|application development|\bDevSecOps\b/i },
  { points: 10, test: /\bENCASE\b|continuous monitoring|\bconMon\b/i },
]

/**
 * Score an award 0–100 for ATO relevance from its NAICS code and description.
 */
export function scoreAtoRelevance(award: {
  description?: string | null
  naicsCode?: string | null
}): number {
  let score = 0

  const naics = award.naicsCode
  if (naics && HIGH_VALUE_NAICS.has(naics.trim())) score += 40

  const desc = award.description || ''
  for (const rule of KEYWORD_RULES) {
    if (rule.test.test(desc)) score += rule.points
  }

  return Math.max(0, Math.min(100, score))
}

/** Convenience overload for a raw USAspending award. */
export function scoreUsaSpendingAward(award: UsaSpendingAward): number {
  return scoreAtoRelevance({
    description: award['Description'],
    naicsCode: awardNaics(award),
  })
}
