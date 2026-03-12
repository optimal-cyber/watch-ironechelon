import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  // Get entity count per country for globe markers
  const countries = await prisma.country.findMany({
    select: {
      name: true,
      alpha2: true,
      latitude: true,
      longitude: true,
      _count: {
        select: { entities: true },
      },
    },
    where: {
      entities: { some: {} },
    },
  })

  const markers = countries.map((c) => ({
    lat: c.latitude,
    lon: c.longitude,
    name: c.name,
    count: c._count.entities,
  }))

  return NextResponse.json({ markers })
}
