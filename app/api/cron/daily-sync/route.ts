import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const FEDRAMP_DATA_URL =
  'https://raw.githubusercontent.com/GSA/fedramp-automation/master/data/fedramp-marketplace.json'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const summary: Record<string, unknown> = {}

    // ── Step 1: FedRAMP sync from GitHub ──────────────────────────────
    let fedrampAdded = 0
    let fedrampUpdated = 0
    let fedrampFailed = 0

    try {
      console.log('[ATO] Fetching FedRAMP data from GitHub...')
      const response = await fetch(FEDRAMP_DATA_URL)

      if (!response.ok) {
        throw new Error(`FedRAMP fetch failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const products = Array.isArray(data) ? data : data.data || data.products || []

      console.log(`[ATO] Processing ${products.length} FedRAMP records...`)

      for (const product of products) {
        try {
          const packageId = product.id || product.packageId || product.Cloud_Service_Provider_Package
          if (!packageId) {
            fedrampFailed++
            continue
          }

          const record = {
            packageId: String(packageId),
            csoName: product.name || product.Cloud_Service_Provider_Package || 'Unknown',
            cspName: product.provider || product.Cloud_Service_Provider || 'Unknown',
            status: product.status || product.Designation || 'Unknown',
            impactLevel: product.impact_level || product.Impact_Level || null,
            serviceModel: JSON.stringify(
              Array.isArray(product.service_model || product.Service_Model)
                ? (product.service_model || product.Service_Model)
                : []
            ),
            deploymentModel: product.deployment_model || product.Deployment_Model || null,
            authorizationDate: product.authorization_date || product.Authorization_Date
              ? new Date(product.authorization_date || product.Authorization_Date)
              : null,
            expirationDate: product.expiration_date || product.Expiration_Date
              ? new Date(product.expiration_date || product.Expiration_Date)
              : null,
            sponsoringAgency: product.sponsoring_agency || product.Sponsoring_Agency || null,
            leveragingAgencies: JSON.stringify(
              Array.isArray(product.leveraging_agencies || product.Leveraging_Agencies)
                ? (product.leveraging_agencies || product.Leveraging_Agencies)
                : []
            ),
            assessorName: product.assessor || product.Independent_Assessor || null,
            authType: product.authorization_type || product.Path || null,
            serviceDescription: product.service_description || product.Service_Description || null,
            website: product.website || null,
            logo: product.logo || null,
            lastSynced: new Date(),
          }

          const existing = await prisma.fedrampAuthorization.findUnique({
            where: { packageId: record.packageId },
          })

          if (existing) {
            await prisma.fedrampAuthorization.update({
              where: { id: existing.id },
              data: record,
            })
            fedrampUpdated++
          } else {
            await prisma.fedrampAuthorization.create({ data: record })
            fedrampAdded++
          }
        } catch (err) {
          fedrampFailed++
          console.error('[ATO] FedRAMP record error:', err)
        }
      }

      // Log FedRAMP sync
      await prisma.atoSyncLog.upsert({
        where: { source: 'fedramp' },
        create: {
          source: 'fedramp',
          lastSyncAt: new Date(),
          recordsAdded: fedrampAdded,
          recordsUpdated: fedrampUpdated,
          recordsFailed: fedrampFailed,
          status: 'success',
        },
        update: {
          lastSyncAt: new Date(),
          recordsAdded: fedrampAdded,
          recordsUpdated: fedrampUpdated,
          recordsFailed: fedrampFailed,
          status: 'success',
        },
      })

      summary.fedramp = { added: fedrampAdded, updated: fedrampUpdated, failed: fedrampFailed }
    } catch (err) {
      console.error('[ATO] FedRAMP sync failed:', err)
      summary.fedramp = { error: err instanceof Error ? err.message : String(err) }

      await prisma.atoSyncLog.upsert({
        where: { source: 'fedramp' },
        create: {
          source: 'fedramp',
          lastSyncAt: new Date(),
          recordsFailed: fedrampFailed,
          status: 'failed',
        },
        update: {
          lastSyncAt: new Date(),
          recordsFailed: fedrampFailed,
          status: 'failed',
        },
      })
    }

    // ── Step 2: Generate expiration alerts ────────────────────────────
    let alertsCreated = 0

    try {
      const now = new Date()
      const thirtyDays = new Date()
      thirtyDays.setDate(thirtyDays.getDate() + 30)
      const ninetyDays = new Date()
      ninetyDays.setDate(ninetyDays.getDate() + 90)

      // Collect expiring records from all sources
      const [fedramp30, fedramp90, dod30, dod90, emass30, emass90] = await Promise.all([
        prisma.fedrampAuthorization.findMany({
          where: { expirationDate: { gte: now, lte: thirtyDays } },
        }),
        prisma.fedrampAuthorization.findMany({
          where: { expirationDate: { gt: thirtyDays, lte: ninetyDays } },
        }),
        prisma.dodProvisionalAuth.findMany({
          where: { paExpiration: { gte: now, lte: thirtyDays } },
        }),
        prisma.dodProvisionalAuth.findMany({
          where: { paExpiration: { gt: thirtyDays, lte: ninetyDays } },
        }),
        prisma.emassAuthorization.findMany({
          where: { expirationDate: { gte: now, lte: thirtyDays } },
        }),
        prisma.emassAuthorization.findMany({
          where: { expirationDate: { gt: thirtyDays, lte: ninetyDays } },
        }),
      ])

      // Create 30-day alerts
      const thirtyDayItems = [
        ...fedramp30.map((r) => ({ name: r.csoName, source: 'fedramp', date: r.expirationDate })),
        ...dod30.map((r) => ({ name: `${r.csoName} ${r.impactLevel}`, source: 'dod-pa', date: r.paExpiration })),
        ...emass30.map((r) => ({ name: r.systemName, source: 'emass', date: r.expirationDate })),
      ]

      for (const item of thirtyDayItems) {
        try {
          await prisma.atoAlert.create({
            data: {
              type: 'expiring_30d',
              title: `${item.name} expires within 30 days`,
              details: JSON.stringify({
                name: item.name,
                expirationDate: item.date,
              }),
              source: item.source,
            },
          })
          alertsCreated++
        } catch (err) {
          console.error('[ATO] Alert creation error (30d):', err)
        }
      }

      // Create 90-day alerts
      const ninetyDayItems = [
        ...fedramp90.map((r) => ({ name: r.csoName, source: 'fedramp', date: r.expirationDate })),
        ...dod90.map((r) => ({ name: `${r.csoName} ${r.impactLevel}`, source: 'dod-pa', date: r.paExpiration })),
        ...emass90.map((r) => ({ name: r.systemName, source: 'emass', date: r.expirationDate })),
      ]

      for (const item of ninetyDayItems) {
        try {
          await prisma.atoAlert.create({
            data: {
              type: 'expiring_90d',
              title: `${item.name} expires within 90 days`,
              details: JSON.stringify({
                name: item.name,
                expirationDate: item.date,
              }),
              source: item.source,
            },
          })
          alertsCreated++
        } catch (err) {
          console.error('[ATO] Alert creation error (90d):', err)
        }
      }

      summary.alerts = { created: alertsCreated }
    } catch (err) {
      console.error('[ATO] Alert generation failed:', err)
      summary.alerts = { error: err instanceof Error ? err.message : String(err) }
    }

    return NextResponse.json({
      message: 'Daily sync complete',
      summary,
    })
  } catch (error) {
    console.error('[ATO] Daily sync cron failed:', error)
    return NextResponse.json(
      { error: 'Daily sync failed' },
      { status: 500 }
    )
  }
}
