import { prisma } from '@/lib/db'
import {
  fetchEntities,
  fetchCountries,
  fetchFunders,
  extractTextFromLexical,
  type SWEntity,
  type SWFunder,
} from '@/lib/api/surveillance-watch'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Map SW entity types to our type system
function mapEntityType(types: { name: string; slug: string }[]): string {
  const typeNames = types.map((t) => t.slug)

  if (typeNames.some((t) => t.includes('spyware'))) return 'CYBER_INTEL'
  if (typeNames.some((t) => t.includes('ai'))) return 'AI_ML'
  if (typeNames.some((t) => t.includes('data-broker'))) return 'SURVEILLANCE'
  if (typeNames.some((t) => t.includes('drone'))) return 'DEFENSE_PRIME'

  // Default most SW entities to SURVEILLANCE
  return 'SURVEILLANCE'
}

export async function syncCountries() {
  console.log('[SYNC] Fetching countries...')
  const countries = await fetchCountries()
  console.log(`[SYNC] Got ${countries.length} countries`)

  let upserted = 0
  for (const country of countries) {
    await prisma.country.upsert({
      where: { alpha2: country.alpha2 || country.slug },
      update: {
        name: country.name,
        latitude: country.latitude,
        longitude: country.longitude,
      },
      create: {
        name: country.name,
        alpha2: country.alpha2 || country.slug,
        latitude: country.latitude,
        longitude: country.longitude,
      },
    })
    upserted++
  }
  console.log(`[SYNC] Upserted ${upserted} countries`)
  return upserted
}

async function upsertEntity(
  name: string,
  slug: string,
  type: string,
  externalId: string,
  data: Partial<{
    description: string
    headquartersCountrySlug: string
    headquartersCity: string | null
    subTypes: string[]
    alsoKnownAs: string[]
    sources: Array<{ url: string; title: string; domain: string }>
    website: string | null
    fundingType: string | null
  }>
) {
  // Find country by slug
  let countryId: string | null = null
  if (data.headquartersCountrySlug) {
    const country = await prisma.country.findUnique({
      where: { alpha2: data.headquartersCountrySlug },
    })
    countryId = country?.id || null
  }

  return prisma.entity.upsert({
    where: { externalId },
    update: {
      name,
      type,
      description: data.description || '',
      headquartersCountryId: countryId,
      headquartersCity: data.headquartersCity,
      subTypes: JSON.stringify(data.subTypes || []),
      alsoKnownAs: JSON.stringify(data.alsoKnownAs || []),
      sources: JSON.stringify(data.sources || []),
      website: data.website,
      fundingType: data.fundingType,
    },
    create: {
      name,
      slug,
      type,
      externalId,
      description: data.description || '',
      headquartersCountryId: countryId,
      headquartersCity: data.headquartersCity,
      subTypes: JSON.stringify(data.subTypes || []),
      alsoKnownAs: JSON.stringify(data.alsoKnownAs || []),
      sources: JSON.stringify(data.sources || []),
      website: data.website,
      fundingType: data.fundingType,
    },
  })
}

export async function syncEntities() {
  console.log('[SYNC] Fetching entities...')
  const swEntities = await fetchEntities()
  console.log(`[SYNC] Got ${swEntities.length} entities`)

  const entityMap = new Map<string, string>() // SW id -> our id

  let upserted = 0
  for (const sw of swEntities) {
    const description = extractTextFromLexical(sw.description)
    const subTypes = sw.types?.map((t) => t.name) || []
    const affiliations = sw.affiliationsList?.map((a) => a.label) || []
    const subsidiariesList = sw.subsidiaries
      ? sw.subsidiaries.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    const sources = (sw.sources || []).map((s) => ({
      url: s.url,
      title: s.title || '',
      domain: s.url ? new URL(s.url).hostname : '',
    }))

    const website = sw.domains?.[0]?.domain
      ? `https://${sw.domains[0].domain}`
      : null

    // headquartersCity can be a string or an object { id, name, country }
    const hqCity = typeof sw.headquartersCity === 'string'
      ? sw.headquartersCity
      : (sw.headquartersCity as { name?: string } | null)?.name || null

    const entity = await upsertEntity(
      sw.name,
      slugify(sw.name),
      mapEntityType(sw.types || []),
      `sw-${sw.id}`,
      {
        description,
        headquartersCountrySlug: sw.headquarters?.slug || undefined,
        headquartersCity: hqCity,
        subTypes,
        alsoKnownAs: [...affiliations, ...subsidiariesList],
        sources,
        website,
        fundingType: 'private',
      }
    )

    entityMap.set(sw.id, entity.id)
    upserted++
  }
  console.log(`[SYNC] Upserted ${upserted} entities`)

  return { entityMap, swEntities }
}

export async function syncFunders() {
  console.log('[SYNC] Fetching funders...')
  const swFunders = await fetchFunders()
  console.log(`[SYNC] Got ${swFunders.length} funders`)

  const funderMap = new Map<string, string>()

  let upserted = 0
  for (const funder of swFunders) {
    const description = extractTextFromLexical(funder.description)

    const entity = await upsertEntity(
      funder.name,
      slugify(funder.name),
      'INVESTOR',
      `sw-funder-${funder.id}`,
      {
        description,
        headquartersCountrySlug: funder.headquarters?.slug || undefined,
        fundingType: 'private',
      }
    )

    funderMap.set(funder.id, entity.id)
    upserted++
  }
  console.log(`[SYNC] Upserted ${upserted} funders`)
  return funderMap
}

export async function syncConnections(
  swEntities: SWEntity[],
  entityMap: Map<string, string>,
  funderMap: Map<string, string>
) {
  console.log('[SYNC] Creating connections...')
  let created = 0

  for (const sw of swEntities) {
    const sourceId = entityMap.get(sw.id)
    if (!sourceId) continue

    // providingTo -> SUPPLIES_TO connections (entity -> country entities)
    // We'll create connections to any entity in that country
    for (const target of sw.providingTo || []) {
      // Find entities headquartered in that country
      const country = await prisma.country.findUnique({
        where: { alpha2: target.slug },
      })
      if (!country) continue

      // Create a "provides to country" style connection
      // We'll represent this as a connection to a country placeholder
      // For now, just skip if we can't map it
    }

    // funders -> FUNDED_BY connections
    for (const funder of sw.funders || []) {
      const funderId = funderMap.get(funder.id)
      if (!funderId) continue

      try {
        await prisma.connection.upsert({
          where: {
            sourceEntityId_targetEntityId_connectionType: {
              sourceEntityId: funderId,
              targetEntityId: sourceId,
              connectionType: 'INVESTED_IN',
            },
          },
          update: {},
          create: {
            sourceEntityId: funderId,
            targetEntityId: sourceId,
            connectionType: 'INVESTED_IN',
            confidence: 'confirmed',
            sources: JSON.stringify([]),
          },
        })
        created++
      } catch (e) {
        // Skip duplicates
        console.warn(`[SYNC] Skipping duplicate connection: ${funder.name} -> ${sw.name}`)
      }
    }
  }

  console.log(`[SYNC] Created ${created} connections`)
  return created
}

export async function runFullSync() {
  console.log('[SYNC] Starting full sync...')
  const start = Date.now()

  await syncCountries()
  const { entityMap, swEntities } = await syncEntities()
  const funderMap = await syncFunders()
  await syncConnections(swEntities, entityMap, funderMap)

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[SYNC] Full sync completed in ${elapsed}s`)

  return {
    elapsed,
    entities: entityMap.size,
    funders: funderMap.size,
  }
}
