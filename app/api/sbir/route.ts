import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const search = sp.get('search') || ''
  const phase = sp.get('phase') || ''
  const program = sp.get('program') || ''
  const agency = sp.get('agency') || ''
  const limit = parseInt(sp.get('limit') || '500')

  // Base filter: only SBIR/STTR contracts
  const where: Record<string, unknown> = {
    sbirProgram: { not: null },
  }

  if (phase) where.sbirPhase = phase
  if (program) where.sbirProgram = program
  if (agency) where.sbirBranch = { contains: agency }

  if (search) {
    where.OR = [
      { description: { contains: search } },
      { entity: { name: { contains: search } } },
      { sbirAbstract: { contains: search } },
      { sbirTopicCode: { contains: search } },
      { sbirPiName: { contains: search } },
    ]
  }

  const [contracts, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        entity: { select: { id: true, name: true, type: true } },
        agency: { select: { id: true, name: true } },
      },
      orderBy: { value: 'desc' },
      take: limit,
    }),
    prisma.contract.count({ where }),
  ])

  // Compute aggregate stats
  const allSbir = await prisma.contract.findMany({
    where: { sbirProgram: { not: null } },
    select: {
      sbirPhase: true,
      sbirBranch: true,
      sbirAwardYear: true,
      sbirProgram: true,
      entityId: true,
      value: true,
      entity: { select: { name: true } },
    },
  })

  // By phase
  const byPhase: Record<string, { count: number; value: number }> = {}
  for (const c of allSbir) {
    const p = c.sbirPhase || 'Unknown'
    if (!byPhase[p]) byPhase[p] = { count: 0, value: 0 }
    byPhase[p].count++
    byPhase[p].value += c.value || 0
  }

  // By agency/branch
  const byAgencyMap = new Map<string, { count: number; value: number }>()
  for (const c of allSbir) {
    const a = c.sbirBranch || 'Unknown'
    const existing = byAgencyMap.get(a) || { count: 0, value: 0 }
    existing.count++
    existing.value += c.value || 0
    byAgencyMap.set(a, existing)
  }
  const byAgency = Array.from(byAgencyMap.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  // By year
  const byYearMap = new Map<number, { count: number; value: number }>()
  for (const c of allSbir) {
    if (!c.sbirAwardYear) continue
    const existing = byYearMap.get(c.sbirAwardYear) || { count: 0, value: 0 }
    existing.count++
    existing.value += c.value || 0
    byYearMap.set(c.sbirAwardYear, existing)
  }
  const byYear = Array.from(byYearMap.entries())
    .map(([year, stats]) => ({ year, ...stats }))
    .sort((a, b) => a.year - b.year)

  // Top winners
  const byEntityMap = new Map<string, { entityId: string; name: string; count: number; value: number }>()
  for (const c of allSbir) {
    const existing = byEntityMap.get(c.entityId) || { entityId: c.entityId, name: c.entity.name, count: 0, value: 0 }
    existing.count++
    existing.value += c.value || 0
    byEntityMap.set(c.entityId, existing)
  }
  const topWinners = Array.from(byEntityMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  // Program split
  let sbirCount = 0, sttrCount = 0
  for (const c of allSbir) {
    if (c.sbirProgram === 'STTR') sttrCount++
    else sbirCount++
  }

  const totalValue = allSbir.reduce((sum, c) => sum + (c.value || 0), 0)

  return NextResponse.json({
    contracts,
    total,
    stats: {
      totalAwards: allSbir.length,
      totalValue,
      sbirCount,
      sttrCount,
      byPhase,
      byAgency,
      byYear,
      topWinners,
    },
  })
}
