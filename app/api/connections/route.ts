import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const entityId = searchParams.get('entityId')
  const type = searchParams.get('type')

  const where: Record<string, unknown> = {}

  if (entityId) {
    where.OR = [
      { sourceEntityId: entityId },
      { targetEntityId: entityId },
    ]
  }

  if (type) {
    where.connectionType = type
  }

  const connections = await prisma.connection.findMany({
    where,
    include: {
      sourceEntity: {
        include: { headquartersCountry: true },
      },
      targetEntity: {
        include: { headquartersCountry: true },
      },
    },
  })

  return NextResponse.json({ connections })
}
