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

  return NextResponse.json({
    technologiesFunded: Array.from(subtypeCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    typeBreakdown: Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    totalConnections: connections.length,
  })
}
