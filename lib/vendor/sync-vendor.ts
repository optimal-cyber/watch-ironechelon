/**
 * On-demand vendor enrichment — the heart of "any vendor a CO searches gets a
 * dossier." Given a name and/or UEI it resolves (or creates) an Entity and
 * pulls live from every free source, persisting idempotently:
 *   - SAM.gov      → SamRegistration + Entity size/CAGE/UEI/city/set-asides
 *   - USAspending  → Contract + FederalContract (relevance-scored) + agency rollup
 *   - SBIR.gov     → SBIR Contract rows (R&D pedigree)
 * then computes vendor risk flags and stamps vendorSyncedAt.
 *
 * Everything upserts on a natural key so re-runs (and the weekly cron) converge.
 */

import { prisma } from '@/lib/db'
import { slugify } from '@/lib/match/vendor-name'
import {
  resolveEntity,
  findAlias,
  usaspendingSearchTerms,
  entityTypeFor,
  hqAlpha2For,
} from '@/lib/match/aliases'
import { findOrCreateAgency } from '@/lib/clients/agencies'
import {
  collectAwardsByRecipient,
  rollupAgencies,
  awardNaics,
  type UsaSpendingAward,
} from '@/lib/clients/usaspending'
import { getEntityByName, getEntityByUei, parseBusinessSize, getSamApiKey, type SamEntity } from '@/lib/clients/sam'
import { searchAwardsByFirm, normalizeSbirPhase, sbirAmount, type SbirAward } from '@/lib/clients/sbir'
import { scoreAtoRelevance } from '@/lib/vendor/relevance'
import { buildGovernmentFunding } from '@/lib/vendor/funding-government'
import { withTimeout } from '@/lib/http/fetch-with-retry'

type EntityRecord = NonNullable<Awaited<ReturnType<typeof prisma.entity.findFirst>>>

export interface SyncVendorInput {
  name?: string
  uei?: string
  /** Re-sync even if vendorSyncedAt is recent. */
  force?: boolean
  /** Skip vendors synced within this many ms (default 7 days). */
  maxAgeMs?: number
  /** Pages of USAspending awards to pull (default 3 ≈ 300 awards). */
  maxPages?: number
}

export interface SyncVendorResult {
  entity: EntityRecord
  created: boolean
  skipped: boolean
  counts: {
    samRegistrations: number
    federalContracts: number
    sbirAwards: number
    agencies: number
  }
  riskFlags: string[]
  errors: string[]
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

// ── Entity resolution ──────────────────────────────────────────────
async function ensureEntity(
  input: SyncVendorInput
): Promise<{ entity: EntityRecord; created: boolean; canonical: string }> {
  const canonical = (input.name && findAlias(input.name)?.canonical) || input.name || ''
  const existing = await resolveEntity({ name: input.name, uei: input.uei })
  if (existing) {
    // Self-heal mistyped vendors: some majors arrive from upstream data tagged
    // INVESTOR/GOVERNMENT (e.g. Lockheed Martin as INVESTOR), which hides them
    // from the vendor directory. If the alias registry has an authoritative
    // vendor type, correct it.
    const aliasType = findAlias(canonical || existing.name)?.entityType
    if (aliasType && aliasType !== existing.type && (existing.type === 'INVESTOR' || existing.type === 'GOVERNMENT')) {
      await prisma.entity.update({ where: { id: existing.id }, data: { type: aliasType } })
      existing.type = aliasType
    }
    return { entity: existing, created: false, canonical: canonical || existing.name }
  }

  if (!canonical) throw new Error('syncVendor requires a name (or a UEI that matches an existing entity)')

  const alpha2 = hqAlpha2For(canonical)
  const country = await prisma.country.findUnique({ where: { alpha2 } })
  const entity = await prisma.entity.create({
    data: {
      name: canonical,
      slug: slugify(canonical),
      type: entityTypeFor(canonical),
      description: `${canonical} — federal vendor`,
      headquartersCountryId: country?.id ?? null,
      uei: input.uei ?? null,
    },
  })
  return { entity, created: true, canonical }
}

// ── SAM enrichment ─────────────────────────────────────────────────
async function enrichFromSam(
  entity: EntityRecord,
  canonical: string
): Promise<{ count: number; sam: SamEntity | null }> {
  if (!getSamApiKey()) return { count: 0, sam: null }

  const results = entity.uei
    ? await getEntityByUei(entity.uei)
    : await getEntityByName(canonical)
  if (results.length === 0) return { count: 0, sam: null }

  // Prefer an exact UEI match, else the first active result.
  const sam = results[0]
  const { businessSize, setAsides } = parseBusinessSize(sam)

  const naicsCodes = (sam.naicsList ?? []).map((n) => ({
    code: n.naicsCode, description: n.naicsDescription, primary: n.isPrimary,
  }))
  const pscCodes = (sam.pscList ?? []).map((p) => ({ code: p.pscCode, description: p.pscDescription }))
  const businessTypes = (sam.businessTypes?.businessTypeList ?? []).map((b) => ({
    code: b.businessTypeCode, description: b.businessTypeDescription,
  }))

  const regData = {
    entityName: sam.legalBusinessName,
    cageCode: sam.cageCode ?? null,
    duns: sam.duns ?? null,
    physicalAddress: sam.physicalAddress ? JSON.stringify(sam.physicalAddress) : null,
    mailingAddress: sam.mailingAddress ? JSON.stringify(sam.mailingAddress) : null,
    congressionalDistrict: sam.congressionalDistrict ?? null,
    naicsCodes: JSON.stringify(naicsCodes),
    pscCodes: JSON.stringify(pscCodes),
    businessTypes: JSON.stringify(businessTypes),
    entityStructure: sam.entityStructure ?? null,
    stateOfIncorp: sam.stateOfIncorporation ?? null,
    fiscalYearEnd: sam.fiscalYearEndCloseDate ?? null,
    entityUrl: sam.entityURL ?? null,
    registrationDate: parseDate(sam.registrationDate),
    expirationDate: parseDate(sam.registrationExpirationDate),
    activeStatus: sam.activeRegistrationStatus ?? null,
    entityId: entity.id,
    lastSynced: new Date(),
  }

  await prisma.samRegistration.upsert({
    where: { uei: sam.ueiSAM },
    create: { uei: sam.ueiSAM, ...regData },
    update: regData,
  })

  // Backfill entity identity + size fields.
  const city = sam.physicalAddress?.city
    ? `${sam.physicalAddress.city}${sam.physicalAddress.stateOrProvinceCode ? ', ' + sam.physicalAddress.stateOrProvinceCode : ''}`
    : null
  await prisma.entity.update({
    where: { id: entity.id },
    data: {
      cageCode: entity.cageCode ?? sam.cageCode ?? null,
      uei: entity.uei ?? sam.ueiSAM,
      headquartersCity: entity.headquartersCity ?? city,
      businessSize,
      setAsides: JSON.stringify(setAsides),
      website: entity.website ?? sam.entityURL ?? null,
    },
  })

  return { count: 1, sam }
}

// ── USAspending contracts + agency rollup ──────────────────────────
async function ingestUsaspending(
  entity: EntityRecord,
  canonical: string,
  maxPages: number
): Promise<{ federalContracts: number; agencies: number }> {
  const terms = usaspendingSearchTerms(canonical)
  const seen = new Set<string>()
  const allAwards: UsaSpendingAward[] = []

  for (const term of terms) {
    const awards = await collectAwardsByRecipient(term, { maxPages })
    for (const a of awards) {
      const id = a['Award ID']
      if (!id || seen.has(id)) continue
      seen.add(id)
      allAwards.push(a)
    }
  }

  let written = 0
  for (const award of allAwards) {
    const rawId = award['Award ID']
    const agencyName = award['Awarding Sub Agency'] || award['Awarding Agency'] || ''
    const agencyId = await findOrCreateAgency(agencyName)
    const naics = awardNaics(award)
    const relevance = scoreAtoRelevance({ description: award['Description'], naicsCode: naics })
    const placeOfPerformance = [
      award['Place of Performance State Code'],
      award['Place of Performance Country Code'],
    ].filter(Boolean).join(', ') || null

    // Contract row (powers /api/contracts, EntityDetail, agency relationships).
    const contractAwardId = `FED-USA-${rawId}`
    const contractData = {
      entityId: entity.id,
      agencyId,
      description: award['Description'] || null,
      value: award['Award Amount'] || null,
      awardDate: parseDate(award['Start Date']),
      endDate: parseDate(award['End Date']),
      naicsCode: naics,
      placeOfPerformance,
      sources: JSON.stringify([{
        url: `https://www.usaspending.gov/award/${rawId}`,
        title: `Federal Contract: ${(award['Description'] || '').slice(0, 80)}`,
        domain: 'usaspending.gov',
      }]),
    }
    await prisma.contract.upsert({
      where: { awardId: contractAwardId },
      create: { awardId: contractAwardId, ...contractData },
      update: contractData,
    })

    // FederalContract row (powers the ATO "Contract Intel" tab + relevance).
    const fedData = {
      recipientName: award['Recipient Name'] || canonical,
      recipientUei: award['Recipient UEI'] || entity.uei || null,
      awardingAgency: award['Awarding Agency'] || null,
      awardingSubAgency: award['Awarding Sub Agency'] || null,
      awardAmount: award['Award Amount'] || null,
      description: award['Description'] || null,
      startDate: parseDate(award['Start Date']),
      endDate: parseDate(award['End Date']),
      naicsCode: naics,
      psc: null as string | null,
      entityId: entity.id,
      atoRelevanceScore: relevance,
      lastSynced: new Date(),
    }
    await prisma.federalContract.upsert({
      where: { awardId: contractAwardId },
      create: { awardId: contractAwardId, ...fedData },
      update: fedData,
    })
    written++
  }

  // Agency breakdown cache (the "which agencies a vendor supports" view).
  const agencies = rollupAgencies(allAwards)
  const totalObligated = agencies.reduce((s, a) => s + a.totalObligated, 0)
  await prisma.entity.update({
    where: { id: entity.id },
    data: {
      agencyBreakdown: JSON.stringify(agencies.slice(0, 20)),
      primaryAgency: agencies[0]?.agency ?? null,
      totalFederalObligated: totalObligated || null,
    },
  })

  return { federalContracts: written, agencies: agencies.length }
}

// ── SBIR/STTR ──────────────────────────────────────────────────────
async function ingestSbir(
  entity: EntityRecord,
  canonical: string,
  timeoutMs = 8000
): Promise<number> {
  let awards: SbirAward[] = []
  try {
    // Time-box SBIR so its aggressive 429 backoff can't hang the request path.
    awards = await withTimeout(searchAwardsByFirm(canonical), timeoutMs, () => [])
  } catch {
    return 0 // SBIR API is flaky; a miss shouldn't fail the whole sync.
  }

  let written = 0
  for (const a of awards) {
    const contractNum = a.contract || a.agency_tracking_number
    if (!contractNum) continue
    const awardId = `SBIR-${contractNum}`
    const agencyName = a.branch || a.agency || ''
    const agencyId = agencyName ? await findOrCreateAgency(agencyName) : null
    const year =
      a.award_year != null ? parseInt(String(a.award_year)) || null : null

    const data = {
      entityId: entity.id,
      agencyId,
      description: a.award_title || null,
      value: sbirAmount(a),
      awardDate: parseDate(a.proposal_award_date),
      endDate: parseDate(a.contract_end_date),
      sbirProgram: (a.program || 'SBIR').toUpperCase().includes('STTR') ? 'STTR' : 'SBIR',
      sbirPhase: normalizeSbirPhase(a.phase),
      sbirTopicCode: a.topic_code || null,
      sbirAgency: a.agency || null,
      sbirBranch: a.branch || null,
      sbirAwardYear: year,
      sbirAbstract: a.abstract || null,
      sbirKeywords: a.research_keywords || null,
      sbirPiName: a.pi_name || null,
      sources: JSON.stringify([{ url: 'https://www.sbir.gov/', title: `SBIR/STTR Award: ${(a.award_title || awardId).slice(0, 80)}`, domain: 'sbir.gov' }]),
    }
    await prisma.contract.upsert({
      where: { awardId },
      create: { awardId, ...data },
      update: data,
    })
    written++
  }
  return written
}

// ── Risk flags ─────────────────────────────────────────────────────
async function computeRiskFlags(entity: EntityRecord, sam: SamEntity | null): Promise<string[]> {
  const flags = new Set<string>()

  // Foreign HQ.
  let alpha2 = hqAlpha2For(entity.name)
  if (entity.headquartersCountryId) {
    const country = await prisma.country.findUnique({
      where: { id: entity.headquartersCountryId },
      select: { alpha2: true },
    })
    if (country?.alpha2) alpha2 = country.alpha2
  }
  if (alpha2 && alpha2 !== 'US') flags.add('FOREIGN_HQ')

  // Surveillance ties (existing watchdog signal → supply-chain risk).
  const surveilling = safeJsonArray(entity.surveilling)
  if (entity.type === 'SURVEILLANCE' || surveilling.length > 0) flags.add('SURVEILLANCE_TIES')

  // SAM inactive / expired.
  if (sam) {
    const status = (sam.activeRegistrationStatus || '').toLowerCase()
    const exp = parseDate(sam.registrationExpirationDate)
    if ((status && status !== 'active') || (exp && exp.getTime() < Date.now())) {
      flags.add('SAM_INACTIVE')
    }
  }

  // Expiring authorization within 90 days (FedRAMP or DoD PA matched by name).
  const in90 = new Date()
  in90.setDate(in90.getDate() + 90)
  const [fed, dod] = await Promise.all([
    prisma.fedrampAuthorization.findFirst({
      where: { cspName: { contains: entity.name }, expirationDate: { gte: new Date(), lte: in90 } },
      select: { id: true },
    }),
    prisma.dodProvisionalAuth.findFirst({
      where: { cspName: { contains: entity.name }, paExpiration: { gte: new Date(), lte: in90 } },
      select: { id: true },
    }),
  ])
  if (fed || dod) flags.add('EXPIRING_AUTH')

  return Array.from(flags)
}

function safeJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ── Orchestrator ───────────────────────────────────────────────────
export async function syncVendor(input: SyncVendorInput): Promise<SyncVendorResult> {
  const errors: string[] = []
  const { entity, created, canonical } = await ensureEntity(input)

  const maxAge = input.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000
  if (!input.force && !created && entity.vendorSyncedAt) {
    const age = Date.now() - new Date(entity.vendorSyncedAt).getTime()
    if (age < maxAge) {
      return {
        entity, created, skipped: true,
        counts: { samRegistrations: 0, federalContracts: 0, sbirAwards: 0, agencies: 0 },
        riskFlags: safeJsonArray(entity.riskFlags) as string[],
        errors,
      }
    }
  }

  const maxPages = input.maxPages ?? 3

  let samCount = 0
  let sam: SamEntity | null = null
  try {
    const r = await enrichFromSam(entity, canonical)
    samCount = r.count
    sam = r.sam
  } catch (e) {
    errors.push(`SAM: ${e instanceof Error ? e.message : String(e)}`)
  }

  let fed = { federalContracts: 0, agencies: 0 }
  try {
    fed = await ingestUsaspending(entity, canonical, maxPages)
  } catch (e) {
    errors.push(`USAspending: ${e instanceof Error ? e.message : String(e)}`)
  }

  let sbir = 0
  try {
    sbir = await ingestSbir(entity, canonical)
  } catch (e) {
    errors.push(`SBIR: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Government-funding backbone (SBIR + federal awards → FundingRound rows).
  try {
    await buildGovernmentFunding(entity.id)
  } catch (e) {
    errors.push(`funding: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Reload entity (SAM/USAspending steps mutated it) before computing flags.
  const refreshed = (await prisma.entity.findUnique({ where: { id: entity.id } })) ?? entity
  let riskFlags: string[] = []
  try {
    riskFlags = await computeRiskFlags(refreshed, sam)
  } catch (e) {
    errors.push(`riskFlags: ${e instanceof Error ? e.message : String(e)}`)
  }

  const finalEntity = await prisma.entity.update({
    where: { id: entity.id },
    data: { riskFlags: JSON.stringify(riskFlags), vendorSyncedAt: new Date() },
  })

  return {
    entity: finalEntity,
    created,
    skipped: false,
    counts: {
      samRegistrations: samCount,
      federalContracts: fed.federalContracts,
      sbirAwards: sbir,
      agencies: fed.agencies,
    },
    riskFlags,
    errors,
  }
}
