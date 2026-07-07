/**
 * Vendor-universe seeder — replaces the hardcoded ~50-company lists with a
 * real, broad set of vendors an acquisition officer might evaluate.
 *
 * Primary source: every distinct FedRAMP CSP already in the DB (the cohort the
 * "are they on the FedRAMP marketplace" question is about). Each becomes an
 * Entity so authorizations and on-demand enrichment always attach to a vendor.
 * SBIR winners and long-tail contractors are added on demand via syncVendor.
 */

import { prisma } from '@/lib/db'
import { slugify } from '@/lib/match/vendor-name'
import { resolveEntity } from '@/lib/match/aliases'

export interface UniverseSeedResult {
  fedrampCsps: number
  created: number
  matchedExisting: number
  errors: string[]
}

/**
 * Ensure an Entity exists for every FedRAMP CSP. Idempotent — existing vendors
 * are matched (not duplicated) via resolveEntity.
 */
export async function seedVendorUniverse(): Promise<UniverseSeedResult> {
  const errors: string[] = []

  const csps = await prisma.fedrampAuthorization.findMany({
    select: { cspName: true },
    distinct: ['cspName'],
  })

  let created = 0
  let matchedExisting = 0

  for (const { cspName } of csps) {
    const name = cspName?.trim()
    if (!name || name === 'Unknown') continue
    try {
      const existing = await resolveEntity({ name })
      if (existing) {
        matchedExisting++
        continue
      }
      await prisma.entity.create({
        data: {
          name,
          slug: slugify(name),
          type: 'CLOUD_INFRA',
          description: `${name} — FedRAMP cloud service provider`,
        },
      })
      created++
    } catch (e) {
      // Slug collisions (two CSP spellings → same slug) are expected; skip.
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await prisma.atoSyncLog.upsert({
    where: { source: 'vendor-universe' },
    create: {
      source: 'vendor-universe',
      lastSyncAt: new Date(),
      recordsAdded: created,
      recordsUpdated: matchedExisting,
      recordsFailed: errors.length,
      status: 'success',
    },
    update: {
      lastSyncAt: new Date(),
      recordsAdded: created,
      recordsUpdated: matchedExisting,
      recordsFailed: errors.length,
      status: 'success',
    },
  })

  return { fedrampCsps: csps.length, created, matchedExisting, errors: errors.slice(0, 50) }
}
