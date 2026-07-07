import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  // Get all investment connections with target entity subtypes
  const connections = await prisma.connection.findMany({
    where: { connectionType: 'INVESTED_IN' },
    include: {
      targetEntity: {
        select: { subTypes: true, type: true },
      },
    },
  })

  // Count subtypes (technologies funded)
  const subtypeCounts = new Map<string, number>()
  const typeCounts = new Map<string, number>()

  for (const conn of connections) {
    // Count entity type
    const type = conn.targetEntity.type
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1)

    // Count subtypes
    const subTypes: string[] = JSON.parse(conn.targetEntity.subTypes)
    for (const st of subTypes) {
      if (st) subtypeCounts.set(st, (subtypeCounts.get(st) || 0) + 1)
    }
  }

  // Real funding amounts from FundingRound rows (government backbone + Apollo).
  const rounds = await prisma.fundingRound.findMany({
    select: { entityId: true, amount: true, source: true },
  })

  let governmentTotal = 0
  let privateTotal = 0
  const byEntity = new Map<string, { gov: number; priv: number }>()
  for (const r of rounds) {
    const amt = r.amount || 0
    const e = byEntity.get(r.entityId) || { gov: 0, priv: 0 }
    if (r.source === 'government') {
      governmentTotal += amt
      e.gov += amt
    } else {
      privateTotal += amt
      e.priv += amt
    }
    byEntity.set(r.entityId, e)
  }

  const topIds = Array.from(byEntity.entries())
    .sort((a, b) => b[1].gov + b[1].priv - (a[1].gov + a[1].priv))
    .slice(0, 15)
  const topEntities = await prisma.entity.findMany({
    where: { id: { in: topIds.map(([id]) => id) } },
    select: { id: true, name: true, slug: true },
  })
  const nameById = new Map(topEntities.map((e) => [e.id, e]))
  const topFunded = topIds
    .map(([id, v]) => {
      const e = nameById.get(id)
      return e ? { name: e.name, slug: e.slug, government: v.gov, private: v.priv, total: v.gov + v.priv } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return NextResponse.json({
    technologiesFunded: Array.from(subtypeCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    typeBreakdown: Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    totalConnections: connections.length,
    funding: {
      governmentTotal,
      privateTotal,
      totalFunding: governmentTotal + privateTotal,
      fundedVendorCount: byEntity.size,
      topFunded,
    },
  })
}
