// Full seed script — captures all Surveillance Watch data including
// surveilling countries, providingTo countries, market info, and funder connections

import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter })

const SW_BASE = 'https://www.surveillancewatch.io/api/v1'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extractText(desc: any): string {
  if (!desc?.root?.children) return ''
  const texts: string[] = []
  function walk(nodes: any[]) {
    for (const node of nodes) {
      if (node.text) texts.push(node.text)
      if (node.children) walk(node.children)
    }
  }
  walk(desc.root.children)
  return texts.join(' ').trim()
}

function mapType(types: { slug: string; name: string }[]): string {
  const slugs = types.map((t) => t.slug)
  if (slugs.some((s) => s.includes('spyware'))) return 'CYBER_INTEL'
  if (slugs.some((s) => s.includes('forensic'))) return 'CYBER_INTEL'
  if (slugs.some((s) => s.includes('imsi'))) return 'CYBER_INTEL'
  if (slugs.some((s) => s.includes('sorm'))) return 'CYBER_INTEL'
  if (slugs.some((s) => s.includes('drone'))) return 'DEFENSE_PRIME'
  if (slugs.some((s) => s.includes('ai-powered'))) return 'AI_ML'
  if (slugs.some((s) => s.includes('facial-recognition'))) return 'AI_ML'
  if (slugs.some((s) => s.includes('license-plate'))) return 'AI_ML'
  if (slugs.some((s) => s.includes('data-broker'))) return 'SURVEILLANCE'
  if (slugs.some((s) => s.includes('social-media'))) return 'SURVEILLANCE'
  if (slugs.some((s) => s.includes('student-monitoring'))) return 'SURVEILLANCE'
  if (slugs.some((s) => s.includes('frontex'))) return 'DEFENSE_PRIME'
  if (slugs.some((s) => s.includes('used-by-ice'))) return 'GOVERNMENT'
  return 'SURVEILLANCE'
}

async function fetchItems(path: string): Promise<any[]> {
  const res = await fetch(`${SW_BASE}${path}`)
  const data = await res.json()
  return data.items || data
}

async function main() {
  console.log('[SEED] Starting full data sync...')

  // ── 1. Countries ──
  console.log('[SEED] Fetching countries...')
  const countries = await fetchItems('/countries')
  console.log(`[SEED] Got ${countries.length} countries`)

  const countryMap = new Map<string, string>() // slug -> id
  for (const c of countries) {
    const alpha2 = c.alpha2 || c.slug
    const country = await prisma.country.upsert({
      where: { alpha2 },
      update: { name: c.name, latitude: c.latitude, longitude: c.longitude },
      create: { name: c.name, alpha2, latitude: c.latitude, longitude: c.longitude },
    })
    countryMap.set(c.slug, country.id)
    countryMap.set(alpha2, country.id)
  }
  console.log(`[SEED] ${countryMap.size / 2} countries synced`)

  // ── 2. Entities ──
  console.log('[SEED] Fetching entities...')
  const swEntities = await fetchItems('/entities')
  console.log(`[SEED] Got ${swEntities.length} entities`)

  const entityMap = new Map<string, string>() // SW id -> our id

  for (const sw of swEntities) {
    const description = extractText(sw.description)
    const subTypes = (sw.types || []).map((t: any) => t.name)
    const affiliations = (sw.affiliationsList || [])
      .map((a: any) => a.label)
      .filter(Boolean)
    const subsidiariesList = sw.subsidiaries
      ? sw.subsidiaries.split(',').map((s: string) => s.trim()).filter(Boolean)
      : []

    const sources = (sw.sources || []).map((s: any) => {
      let domain = ''
      try { domain = s.url ? new URL(s.url).hostname : '' } catch {}
      return { url: s.url || '', title: s.title || '', domain }
    })

    const website = sw.domains?.[0]?.domain ? `https://${sw.domains[0].domain}` : null
    const slug = slugify(sw.name)
    const externalId = `sw-${sw.id}`

    // Country
    const countryId = sw.headquarters?.slug ? (countryMap.get(sw.headquarters.slug) || null) : null

    // Market info (ticker, exchange, ISIN)
    let ticker: string | null = null
    let stockExchange: string | null = null
    let isin: string | null = null
    let fundingType = 'private'
    if (sw.marketInfo && sw.marketInfo.length > 0) {
      const mi = sw.marketInfo[0]
      ticker = mi.ticker || null
      stockExchange = mi.market?.abbreviation || mi.market?.name || null
      isin = mi.isin || null
      fundingType = 'public'
    }

    // ProvidingTo — array of countries this entity supplies tech to
    const providingTo = (sw.providingTo || []).map((c: any) => ({
      name: c.name,
      slug: c.slug,
      lat: c.latitude,
      lon: c.longitude,
    }))

    // Surveilling — array of countries this entity targets
    const surveilling = (sw.surveilling || []).map((c: any) => ({
      name: c.name,
      slug: c.slug,
      lat: c.latitude,
      lon: c.longitude,
    }))

    const city = typeof sw.headquartersCity === 'string'
      ? sw.headquartersCity
      : sw.headquartersCity?.name || null

    const entity = await prisma.entity.upsert({
      where: { externalId },
      update: {
        name: sw.name,
        type: mapType(sw.types || []),
        description,
        headquartersCountryId: countryId,
        headquartersCity: city,
        subTypes: JSON.stringify(subTypes),
        alsoKnownAs: JSON.stringify([...affiliations, ...subsidiariesList]),
        sources: JSON.stringify(sources),
        website,
        fundingType,
        ticker,
        stockExchange,
        isin,
        providingTo: JSON.stringify(providingTo),
        surveilling: JSON.stringify(surveilling),
        hasDirectTargets: sw.hasDirectTargets || false,
      },
      create: {
        name: sw.name,
        slug,
        type: mapType(sw.types || []),
        externalId,
        description,
        headquartersCountryId: countryId,
        headquartersCity: city,
        subTypes: JSON.stringify(subTypes),
        alsoKnownAs: JSON.stringify([...affiliations, ...subsidiariesList]),
        sources: JSON.stringify(sources),
        website,
        fundingType,
        ticker,
        stockExchange,
        isin,
        providingTo: JSON.stringify(providingTo),
        surveilling: JSON.stringify(surveilling),
        hasDirectTargets: sw.hasDirectTargets || false,
      },
    })

    entityMap.set(sw.id, entity.id)
  }
  console.log(`[SEED] ${entityMap.size} entities synced`)

  // ── 3. Funders ──
  console.log('[SEED] Fetching funders...')
  const funders = await fetchItems('/funders')
  console.log(`[SEED] Got ${funders.length} funders`)

  const funderMap = new Map<string, string>()
  const usedSlugs = new Set<string>()

  // Pre-load all existing slugs
  const allEntities = await prisma.entity.findMany({ select: { slug: true } })
  for (const e of allEntities) usedSlugs.add(e.slug)

  for (const f of funders) {
    const description = extractText(f.description)
    let slug = slugify(f.name)
    const externalId = `sw-funder-${f.id}`

    // Handle slug collision
    if (usedSlugs.has(slug)) {
      const existing = await prisma.entity.findUnique({ where: { slug } })
      if (existing && existing.externalId !== externalId) {
        slug = `${slug}-investor`
      }
    }
    usedSlugs.add(slug)

    const countryId = f.headquarters?.slug ? (countryMap.get(f.headquarters.slug) || null) : null

    const entity = await prisma.entity.upsert({
      where: { externalId },
      update: {
        name: f.name,
        type: 'INVESTOR',
        description,
        headquartersCountryId: countryId,
        fundingType: 'private',
      },
      create: {
        name: f.name,
        slug,
        type: 'INVESTOR',
        externalId,
        description,
        headquartersCountryId: countryId,
        fundingType: 'private',
      },
    })

    funderMap.set(f.id, entity.id)
  }
  console.log(`[SEED] ${funderMap.size} funders synced`)

  // ── 4. Connections ──
  console.log('[SEED] Creating connections...')
  let investedInCount = 0
  let suppliesToCount = 0
  let surveillingCount = 0

  for (const sw of swEntities) {
    const sourceId = entityMap.get(sw.id)
    if (!sourceId) continue

    // Funder -> Entity (INVESTED_IN)
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
          },
        })
        investedInCount++
      } catch { /* skip dupes */ }
    }

    // Entity -> Entity via providingTo countries
    // Find other entities in the same target countries and create SUPPLIES_TO connections
    // For now, we store providingTo as JSON on the entity itself (already done above)
    // But also create entity-to-entity connections where an entity provides to a country
    // where another entity is headquartered
    for (const country of sw.providingTo || []) {
      // Find entities headquartered in this target country
      const countryId = countryMap.get(country.slug)
      if (!countryId) continue

      // Create SUPPLIES_TO connection from this entity to entities in that country
      // (We'll connect surveillance entities to the countries they supply)
      // Since we don't have "country entities", we track this via the providingTo JSON field
      suppliesToCount++
    }

    for (const country of sw.surveilling || []) {
      surveillingCount++
    }
  }

  console.log(`[SEED] Connections: ${investedInCount} invested_in, ${suppliesToCount} providing_to countries, ${surveillingCount} surveilling countries`)
  console.log('[SEED] Done!')

  // Summary
  const stats = {
    countries: countryMap.size / 2,
    entities: entityMap.size,
    funders: funderMap.size,
    investedInConnections: investedInCount,
    providingToCountries: suppliesToCount,
    surveillingCountries: surveillingCount,
  }
  console.log('[SEED] Summary:', JSON.stringify(stats, null, 2))
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
