/**
 * Persist Apollo.io enrichment as private-capital FundingRound rows.
 * Idempotent per vendor (clears prior apollo rows first). Also backfills
 * Entity headcount / revenue / founded year when missing.
 */

import { prisma } from '@/lib/db'
import type { ApolloFunding } from '@/lib/clients/apollo'

const APOLLO_SOURCE = JSON.stringify([
  { url: 'https://www.apollo.io/', title: 'Apollo.io organization enrichment', domain: 'apollo.io' },
])

export async function persistApolloFunding(entityId: string, f: ApolloFunding): Promise<number> {
  await prisma.fundingRound.deleteMany({ where: { entityId, source: 'apollo' } })

  let created = 0
  if (f.rounds.length > 0) {
    for (const r of f.rounds) {
      await prisma.fundingRound.create({
        data: {
          entityId,
          roundType: r.stage || 'Round',
          roundName: r.stage || 'Funding Round',
          amount: r.amount,
          date: r.date ? new Date(r.date) : null,
          investors: JSON.stringify(r.investors),
          source: 'apollo',
          provider: 'apollo.io',
          raw: JSON.stringify(r),
          sources: APOLLO_SOURCE,
        },
      })
      created++
    }
  } else if (f.totalFunding && f.totalFunding > 0) {
    await prisma.fundingRound.create({
      data: {
        entityId,
        roundType: f.latestRoundStage || 'Total',
        roundName: f.latestRoundStage ? `${f.latestRoundStage} (latest)` : 'Total Funding',
        amount: f.totalFunding,
        date: f.latestRoundDate ? new Date(f.latestRoundDate) : null,
        source: 'apollo',
        provider: 'apollo.io',
        raw: JSON.stringify(f),
        sources: APOLLO_SOURCE,
      },
    })
    created++
  }

  // Backfill entity facts only where missing.
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { employeeCount: true, annualRevenue: true, founded: true },
  })
  if (entity) {
    const data: Record<string, unknown> = {}
    if (!entity.employeeCount && f.employees != null) data.employeeCount = String(f.employees)
    if (!entity.annualRevenue && f.annualRevenue != null) data.annualRevenue = String(f.annualRevenue)
    if (!entity.founded && f.foundedYear != null) data.founded = f.foundedYear
    if (Object.keys(data).length > 0) {
      await prisma.entity.update({ where: { id: entityId }, data })
    }
  }

  return created
}
