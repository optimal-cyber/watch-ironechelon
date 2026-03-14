import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const agency = sp.get('agency')
    const minScore = parseInt(sp.get('minScore') || '30')
    const search = sp.get('search') || ''
    const sortBy = sp.get('sortBy') || 'atoRelevanceScore'
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50')))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      atoRelevanceScore: { gte: minScore },
    }

    if (agency) {
      where.awardingAgency = { contains: agency }
    }

    if (search) {
      where.OR = [
        { recipientName: { contains: search } },
        { description: { contains: search } },
      ]
    }

    const orderBy =
      sortBy === 'awardAmount'
        ? { awardAmount: 'desc' as const }
        : { atoRelevanceScore: 'desc' as const }

    const [contracts, total] = await Promise.all([
      prisma.federalContract.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.federalContract.count({ where }),
    ])

    return NextResponse.json({ contracts, total, page, limit })
  } catch (error) {
    console.error('[ATO] Error fetching ATO-relevant contracts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ATO-relevant contracts' },
      { status: 500 }
    )
  }
}
