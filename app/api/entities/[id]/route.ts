import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const entity = await prisma.entity.findFirst({
    where: {
      OR: [{ id }, { slug: id }],
    },
    include: {
      headquartersCountry: true,
      connectionsFrom: {
        include: {
          targetEntity: {
            include: { headquartersCountry: true },
          },
        },
      },
      connectionsTo: {
        include: {
          sourceEntity: {
            include: { headquartersCountry: true },
          },
        },
      },
      contracts: {
        include: { agency: true },
        orderBy: { awardDate: 'desc' },
        take: 20,
      },
    },
  })

  if (!entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
  }

  // Fetch lobbying filings for this entity
  const lobbyingFilings = await prisma.lobbyingFiling.findMany({
    where: { entityId: entity.id },
    orderBy: { filingYear: 'desc' },
    take: 20,
  })

  // Aggregate lobbying totals by year
  const lobbyingByYear: Record<number, number> = {}
  let totalLobbyingAmount = 0
  for (const filing of lobbyingFilings) {
    if (filing.amount && filing.filingYear) {
      lobbyingByYear[filing.filingYear] = (lobbyingByYear[filing.filingYear] || 0) + filing.amount
      totalLobbyingAmount += filing.amount
    }
  }

  return NextResponse.json({
    ...entity,
    subTypes: JSON.parse(entity.subTypes),
    alsoKnownAs: JSON.parse(entity.alsoKnownAs),
    sources: JSON.parse(entity.sources),
    naicsCodes: JSON.parse(entity.naicsCodes),
    providingTo: JSON.parse(entity.providingTo),
    surveilling: JSON.parse(entity.surveilling),
    connectionCount: entity.connectionsFrom.length + entity.connectionsTo.length,
    lobbying: {
      filings: lobbyingFilings.map(f => ({
        id: f.id,
        registrantName: f.registrantName,
        clientName: f.clientName,
        year: f.filingYear,
        period: f.filingPeriod,
        amount: f.amount,
        issues: JSON.parse(f.issues),
        governmentEntities: JSON.parse(f.governmentEntities),
        specificIssues: f.specificIssues,
      })),
      totalAmount: totalLobbyingAmount,
      byYear: lobbyingByYear,
    },
  })
}
