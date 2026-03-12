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

  return NextResponse.json({
    ...entity,
    subTypes: JSON.parse(entity.subTypes),
    alsoKnownAs: JSON.parse(entity.alsoKnownAs),
    sources: JSON.parse(entity.sources),
    naicsCodes: JSON.parse(entity.naicsCodes),
    providingTo: JSON.parse(entity.providingTo),
    surveilling: JSON.parse(entity.surveilling),
    connectionCount: entity.connectionsFrom.length + entity.connectionsTo.length,
  })
}
