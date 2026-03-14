import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.SYNC_API_KEY
    if (apiKey) {
      const authHeader = request.headers.get('Authorization')
      if (authHeader !== `Bearer ${apiKey}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const [sources, fedramp, dodPa, emass, contracts, companies] = await Promise.all([
      prisma.atoSyncLog.findMany({
        orderBy: { lastSyncAt: 'desc' },
      }),
      prisma.fedrampAuthorization.count(),
      prisma.dodProvisionalAuth.count(),
      prisma.emassAuthorization.count(),
      prisma.federalContract.count(),
      prisma.atoCompany.count(),
    ])

    return NextResponse.json({
      sources,
      counts: {
        fedramp,
        dodPa,
        emass,
        contracts,
        companies,
      },
    })
  } catch (error) {
    console.error('[ATO] Error fetching sync status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    )
  }
}
