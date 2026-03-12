import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || ''

  if (query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const entities = await prisma.entity.findMany({
    where: {
      OR: [
        { name: { contains: query } },
        { slug: { contains: query.toLowerCase() } },
        { alsoKnownAs: { contains: query } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      headquartersCountry: { select: { name: true, alpha2: true } },
      _count: { select: { connectionsFrom: true, connectionsTo: true } },
    },
    take: 20,
  })

  const results = entities.map((e) => ({
    ...e,
    connectionCount: e._count.connectionsFrom + e._count.connectionsTo,
    category: 'entity' as const,
  }))

  return NextResponse.json({ results })
}
