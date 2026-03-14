import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const component = sp.get('component')
    const authorizationType = sp.get('authorizationType')
    const impactLevel = sp.get('impactLevel')
    const search = sp.get('search') || ''
    const page = Math.max(1, parseInt(sp.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50')))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}

    if (component) where.component = component
    if (authorizationType) where.authorizationType = authorizationType
    if (impactLevel) where.impactLevel = impactLevel

    if (search) {
      where.systemName = { contains: search }
    }

    const [authorizations, total] = await Promise.all([
      prisma.emassAuthorization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.emassAuthorization.count({ where }),
    ])

    return NextResponse.json({ authorizations, total, page, limit })
  } catch (error) {
    console.error('[ATO] Error fetching eMASS records:', error)
    return NextResponse.json(
      { error: 'Failed to fetch eMASS authorizations' },
      { status: 500 }
    )
  }
}
