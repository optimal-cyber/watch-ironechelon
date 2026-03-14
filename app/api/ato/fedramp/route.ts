import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const status = sp.get('status') || ''
    const impactLevel = sp.get('impactLevel') || ''
    const search = sp.get('search') || ''
    const serviceModel = sp.get('serviceModel') || ''
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50')))
    const skip = (page - 1) * limit

    // Build where clause
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (impactLevel) {
      where.impactLevel = impactLevel
    }

    if (serviceModel) {
      where.serviceModel = { contains: serviceModel }
    }

    if (search) {
      where.OR = [
        { csoName: { contains: search } },
        { cspName: { contains: search } },
      ]
    }

    const [authorizations, total] = await Promise.all([
      prisma.fedrampAuthorization.findMany({
        where,
        orderBy: { authorizationDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.fedrampAuthorization.count({ where }),
    ])

    const totalPages = Math.ceil(total / limit)

    // Aggregate stats — counts by status and impact level
    const [allStatuses, allImpactLevels] = await Promise.all([
      prisma.fedrampAuthorization.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.fedrampAuthorization.groupBy({
        by: ['impactLevel'],
        _count: { impactLevel: true },
      }),
    ])

    const byStatus: Record<string, number> = {}
    for (const row of allStatuses) {
      byStatus[row.status] = row._count.status
    }

    const byImpactLevel: Record<string, number> = {}
    for (const row of allImpactLevels) {
      const key = row.impactLevel || 'Unknown'
      byImpactLevel[key] = row._count.impactLevel
    }

    return NextResponse.json({
      authorizations,
      total,
      page,
      limit,
      totalPages,
      stats: {
        byStatus,
        byImpactLevel,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[ATO-SYNC] FedRAMP GET error:', message)
    return NextResponse.json({ error: 'Failed to fetch FedRAMP data', message }, { status: 500 })
  }
}
