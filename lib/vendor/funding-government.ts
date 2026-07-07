/**
 * Government-funding backbone. Turns a vendor's SBIR/STTR awards and federal
 * contract obligations into real FundingRound rows (source: "government"), so
 * every vendor shows a funding story even without private-capital data.
 *
 * Idempotent: clears this vendor's existing government rows and rewrites them,
 * so re-runs (weekly cron, on-demand) never duplicate.
 */

import { prisma } from '@/lib/db'

export interface GovernmentFundingResult {
  rows: number
  total: number
}

export async function buildGovernmentFunding(entityId: string): Promise<GovernmentFundingResult> {
  const contracts = await prisma.contract.findMany({
    where: { entityId },
    select: { value: true, awardDate: true, sbirProgram: true, sbirPhase: true },
  })

  // Aggregate SBIR/STTR by program+phase.
  const sbirGroups = new Map<string, { amount: number; latest: Date | null; program: string; phase: string | null }>()
  let federalTotal = 0
  let federalLatest: Date | null = null

  for (const c of contracts) {
    const amount = c.value || 0
    if (c.sbirProgram) {
      const program = c.sbirProgram.toUpperCase().includes('STTR') ? 'STTR' : 'SBIR'
      const phase = c.sbirPhase || null
      const key = `${program}|${phase ?? 'NA'}`
      const g = sbirGroups.get(key) ?? { amount: 0, latest: null, program, phase }
      g.amount += amount
      if (c.awardDate && (!g.latest || c.awardDate > g.latest)) g.latest = c.awardDate
      sbirGroups.set(key, g)
    } else {
      federalTotal += amount
      if (c.awardDate && (!federalLatest || c.awardDate > federalLatest)) federalLatest = c.awardDate
    }
  }

  // Rewrite government funding rows idempotently.
  await prisma.fundingRound.deleteMany({ where: { entityId, source: 'government' } })

  const rows: {
    entityId: string
    roundType: string
    roundName: string
    amount: number
    date: Date | null
    source: string
    provider: string
    sources: string
  }[] = []

  for (const g of sbirGroups.values()) {
    if (g.amount <= 0) continue
    rows.push({
      entityId,
      roundType: 'SBIR',
      roundName: g.phase ? `${g.program} Phase ${g.phase}` : `${g.program} Awards`,
      amount: g.amount,
      date: g.latest,
      source: 'government',
      provider: 'sbir.gov',
      sources: JSON.stringify([{ url: 'https://www.sbir.gov/', title: 'SBIR/STTR awards', domain: 'sbir.gov' }]),
    })
  }

  if (federalTotal > 0) {
    rows.push({
      entityId,
      roundType: 'GOVERNMENT_CONTRACT',
      roundName: 'Federal Contract Awards',
      amount: federalTotal,
      date: federalLatest,
      source: 'government',
      provider: 'usaspending.gov',
      sources: JSON.stringify([{ url: 'https://www.usaspending.gov/', title: 'Federal contract obligations', domain: 'usaspending.gov' }]),
    })
  }

  for (const r of rows) {
    await prisma.fundingRound.create({ data: r })
  }

  const total = rows.reduce((s, r) => s + r.amount, 0)
  return { rows: rows.length, total }
}
