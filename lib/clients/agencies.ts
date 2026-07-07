/**
 * Shared federal-agency resolver. Agencies are stored as Entity rows of
 * type GOVERNMENT and linked from Contract.agencyId. Extracted from the
 * duplicated `findOrCreateAgency` in the seed-* routes so every ingester
 * shares one implementation.
 */

import { prisma } from '@/lib/db'
import { slugify } from '@/lib/match/vendor-name'

let usCountryIdCache: string | null | undefined

async function getUsCountryId(): Promise<string | null> {
  if (usCountryIdCache !== undefined) return usCountryIdCache
  const us = await prisma.country.findUnique({ where: { alpha2: 'US' } })
  usCountryIdCache = us?.id ?? null
  return usCountryIdCache
}

/**
 * Find (or create) the GOVERNMENT Entity for a federal agency/sub-agency name.
 * Returns the entity id, or null for an empty name.
 */
export async function findOrCreateAgency(agencyName: string): Promise<string | null> {
  const name = agencyName?.trim()
  if (!name) return null

  const slug = slugify(name)
  const existing = await prisma.entity.findUnique({ where: { slug } })
  if (existing) return existing.id

  const usCountryId = await getUsCountryId()
  const entity = await prisma.entity.create({
    data: {
      name,
      slug,
      type: 'GOVERNMENT',
      description: `U.S. federal agency: ${name}`,
      headquartersCountryId: usCountryId,
    },
  })
  return entity.id
}
