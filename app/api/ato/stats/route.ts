import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_request: NextRequest) {
  try {
    const now = new Date()
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

    // Run all queries in parallel
    const [
      fedrampByStatus,
      fedrampExpiringCount,
      dodPaCount,
      emassCount,
      federalContractCount,
      lastSync,
    ] = await Promise.all([
      // FedRAMP counts by status
      prisma.fedrampAuthorization.groupBy({
        by: ['status'],
        _count: { status: true },
      }),

      // FedRAMP expiring within 90 days
      prisma.fedrampAuthorization.count({
        where: {
          expirationDate: {
            gte: now,
            lte: ninetyDaysFromNow,
          },
        },
      }),

      // DoD Provisional Authorizations
      prisma.dodProvisionalAuth.count(),

      // eMASS Authorizations
      prisma.emassAuthorization.count(),

      // Federal contracts with ATO relevance > 30
      prisma.federalContract.count({
        where: {
          atoRelevanceScore: { gt: 30 },
        },
      }),

      // Last sync info
      prisma.atoSyncLog.findMany({
        orderBy: { lastSyncAt: 'desc' },
      }),
    ])

    // Map FedRAMP status counts
    const fedrampStatus: Record<string, number> = {}
    let fedrampTotal = 0
    for (const row of fedrampByStatus) {
      fedrampStatus[row.status] = row._count.status
      fedrampTotal += row._count.status
    }

    // Build sync log map
    const syncLogs: Record<string, { lastSyncAt: string; status: string; recordsAdded: number; recordsUpdated: number; recordsFailed: number }> = {}
    for (const log of lastSync) {
      syncLogs[log.source] = {
        lastSyncAt: log.lastSyncAt.toISOString(),
        status: log.status,
        recordsAdded: log.recordsAdded,
        recordsUpdated: log.recordsUpdated,
        recordsFailed: log.recordsFailed,
      }
    }

    return NextResponse.json({
      fedramp: {
        total: fedrampTotal,
        byStatus: fedrampStatus,
        expiringWithin90Days: fedrampExpiringCount,
      },
      dodPa: {
        total: dodPaCount,
      },
      emass: {
        total: emassCount,
      },
      federalContracts: {
        totalRelevant: federalContractCount,
      },
      syncLogs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[ATO-SYNC] Stats GET error:', message)
    return NextResponse.json({ error: 'Failed to fetch ATO stats', message }, { status: 500 })
  }
}
