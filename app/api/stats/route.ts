import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const [
    totalEntities,
    totalConnections,
    totalCountries,
    typeCounts,
    mostConnected,
  ] = await Promise.all([
    prisma.entity.count(),
    prisma.connection.count(),
    prisma.country.count(),
    prisma.entity.groupBy({
      by: ['type'],
      _count: { _all: true },
      orderBy: { _count: { type: 'desc' } },
    }),
    prisma.entity.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        _count: {
          select: {
            connectionsFrom: true,
            connectionsTo: true,
          },
        },
      },
      orderBy: {
        connectionsFrom: { _count: 'desc' },
      },
      take: 10,
    }),
  ])

  return NextResponse.json({
    totalEntities,
    totalConnections,
    totalCountries,
    typeCounts: typeCounts.map((t) => ({
      type: t.type,
      count: t._count._all,
    })),
    mostConnected: mostConnected.map((e) => ({
      ...e,
      connectionCount: e._count.connectionsFrom + e._count.connectionsTo,
    })),
  })
}
