import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const entityId = searchParams.get('entityId')
  const limit = parseInt(searchParams.get('limit') || '500')

  const where: Record<string, unknown> = {}

  if (entityId) {
    where.entityId = entityId
  }

  if (search) {
    where.OR = [
      { description: { contains: search } },
      { entity: { name: { contains: search } } },
    ]
  }

  const contracts = await prisma.contract.findMany({
    where,
    include: {
      entity: {
        select: { id: true, name: true, type: true },
      },
      agency: {
        select: { id: true, name: true },
      },
    },
    orderBy: { value: 'desc' },
    take: limit,
  })

  const total = await prisma.contract.count({ where })

  return NextResponse.json({ contracts, total })
}
