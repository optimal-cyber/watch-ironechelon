import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncVendor } from '@/lib/vendor/sync-vendor'
import { buildDossier } from '@/lib/vendor/build-dossier'
import { withTimeout } from '@/lib/http/fetch-with-retry'

// Allow up to 60s for an on-demand build (Pro plans); the sync is internally
// time-boxed so we return a (possibly partial) dossier rather than hang.
export const maxDuration = 60

/**
 * Vendor dossier aggregator. Resolves by slug/id/UEI. If the vendor has never
 * been enriched (vendorSyncedAt is null) it builds the profile live in-process,
 * then assembles the dossier. Pass ?name= to build a vendor that doesn't exist
 * yet (on-demand lookup from search); ?sync=0 to skip the live build.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const sp = request.nextUrl.searchParams
  const nameParam = sp.get('name') || undefined
  const allowSync = sp.get('sync') !== '0'

  let entity = await prisma.entity.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    select: { id: true, name: true, uei: true, vendorSyncedAt: true },
  })

  try {
    // Build on-demand when the vendor is unknown or has never been enriched.
    // The whole sync is time-boxed as a backstop; if it exceeds the budget we
    // fall through and serve whatever was persisted so far.
    if (!entity && nameParam && allowSync) {
      const result = await syncVendor({ name: nameParam, maxPages: 2 })
      entity = { id: result.entity.id, name: result.entity.name, uei: result.entity.uei, vendorSyncedAt: result.entity.vendorSyncedAt }
    } else if (entity && !entity.vendorSyncedAt && allowSync) {
      await withTimeout(
        syncVendor({ name: entity.name, uei: entity.uei ?? undefined, maxPages: 2 }),
        45_000
      ).catch(() => {})
    }
  } catch (err) {
    // A live-build failure shouldn't 500 the page if we already have an entity;
    // fall through and serve whatever we have.
    if (!entity) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      )
    }
  }

  if (!entity) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  const dossier = await buildDossier(entity.id)
  if (!dossier) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  return NextResponse.json(dossier)
}
