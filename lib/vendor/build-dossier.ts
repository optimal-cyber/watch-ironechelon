/**
 * Vendor dossier assembler — the acquisition-facing aggregation of every signal
 * we hold about a vendor, organized for a contracting officer's market research
 * (FAR Part 10) and responsibility determination (FAR 9.104):
 *
 *   Identity & Registration · Authorizations · SBIR/STTR Pedigree ·
 *   Federal Past Performance (by agency) · Funding & Investors · Ownership Risk
 *
 * Pure read layer — no external fetches (syncVendor does those). Safe to call
 * from the API route or a server component.
 */

import { prisma } from '@/lib/db'

type EntityRecord = NonNullable<Awaited<ReturnType<typeof prisma.entity.findUnique>>>

function jsonArray<T = unknown>(value: string | null | undefined): T[] {
  if (!value) return []
  try {
    const p = JSON.parse(value)
    return Array.isArray(p) ? (p as T[]) : []
  } catch {
    return []
  }
}

export interface AgencyBreakdownRow {
  agency: string
  awardCount: number
  totalObligated: number
}

export interface VendorDossier {
  identity: {
    id: string
    name: string
    slug: string
    type: string
    description: string
    website: string | null
    headquartersCity: string | null
    headquartersCountry: { name: string; alpha2: string } | null
    founded: number | null
    cageCode: string | null
    uei: string | null
    ticker: string | null
    stockExchange: string | null
    fundingType: string | null
    businessSize: string | null
    setAsides: string[]
    vendorSyncedAt: string | null
  }
  responsibility: {
    samRegistered: boolean
    samStatus: string | null
    samExpiration: string | null
    naics: { code: string; description: string; primary?: boolean }[]
    psc: { code: string; description: string }[]
    activeAuthorizations: number
  }
  riskFlags: { flag: string; label: string; detail: string }[]
  authorizations: {
    fedramp: {
      csoName: string
      status: string
      impactLevel: string | null
      serviceModel: string[]
      authorizationDate: string | null
      expirationDate: string | null
      sponsoringAgency: string | null
    }[]
    dodPa: { csoName: string; impactLevel: string; paExpiration: string | null; sponsorComponent: string | null }[]
    emass: { systemName: string; component: string; authorizationType: string; expirationDate: string | null }[]
  }
  pastPerformance: {
    totalObligated: number
    primaryAgency: string | null
    agencyBreakdown: AgencyBreakdownRow[]
    topContracts: { id: string; description: string | null; value: number | null; agency: string | null; awardDate: string | null }[]
    contractCount: number
  }
  sbir: {
    totalAwards: number
    totalValue: number
    byPhase: Record<string, { count: number; value: number }>
    recent: { id: string; title: string | null; program: string | null; phase: string | null; agency: string | null; year: number | null; value: number | null }[]
  }
  funding: {
    rounds: { id: string; roundName: string | null; roundType: string | null; amount: number | null; date: string | null; source: string | null; provider: string | null }[]
    governmentTotal: number
    privateTotal: number
    fundedBy: { id: string | undefined; name: string; country?: string }[]
  }
  lobbying: { totalAmount: number; filingCount: number; byYear: Record<number, number> }
}

const RISK_LABELS: Record<string, { label: string; detail: string }> = {
  FOREIGN_HQ: { label: 'Foreign Headquarters', detail: 'Vendor is headquartered outside the United States — review foreign ownership, control, or influence (FOCI) and supply-chain risk.' },
  SURVEILLANCE_TIES: { label: 'Surveillance Ties', detail: 'Vendor is associated with surveillance technology or targeting activity — review for reputational and supply-chain risk.' },
  SAM_INACTIVE: { label: 'SAM Registration Inactive/Expired', detail: 'Vendor is not currently active in SAM.gov — a firm must be actively registered to receive a federal award (FAR 4.1102).' },
  EXPIRING_AUTH: { label: 'Authorization Expiring', detail: 'A FedRAMP or DoD provisional authorization expires within 90 days — confirm continuity before award.' },
}

/** Loose name key for matching authorization tables (which use CSP legal names). */
function matchName(entity: EntityRecord): string {
  return entity.name.replace(/\b(Inc|LLC|Corp|Corporation|Technologies|Systems|Government Solutions)\b/gi, '').trim()
}

export async function buildDossier(entityId: string): Promise<VendorDossier | null> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    include: { headquartersCountry: true },
  })
  if (!entity) return null

  const nameKey = matchName(entity)

  const [
    sam,
    fedramp,
    dodPa,
    emass,
    contracts,
    sbirContracts,
    fundingRounds,
    fundedByConnections,
    lobbyingFilings,
  ] = await Promise.all([
    prisma.samRegistration.findFirst({
      where: { OR: [{ entityId: entity.id }, ...(entity.uei ? [{ uei: entity.uei }] : [])] },
      orderBy: { lastSynced: 'desc' },
    }),
    prisma.fedrampAuthorization.findMany({
      where: { cspName: { contains: nameKey } },
      orderBy: { expirationDate: 'asc' },
      take: 25,
    }),
    prisma.dodProvisionalAuth.findMany({
      where: { cspName: { contains: nameKey } },
      orderBy: { paExpiration: 'asc' },
      take: 25,
    }),
    prisma.emassAuthorization.findMany({
      where: { systemName: { contains: nameKey } },
      take: 25,
    }),
    prisma.contract.findMany({
      where: { entityId: entity.id, sbirProgram: null },
      include: { agency: { select: { name: true } } },
      orderBy: { value: 'desc' },
      take: 10,
    }),
    prisma.contract.findMany({
      where: { entityId: entity.id, sbirProgram: { not: null } },
      include: { agency: { select: { name: true } } },
      orderBy: { awardDate: 'desc' },
      take: 200,
    }),
    prisma.fundingRound.findMany({ where: { entityId: entity.id }, orderBy: { date: 'desc' } }),
    prisma.connection.findMany({
      where: { targetEntityId: entity.id, connectionType: { in: ['INVESTED_IN', 'FUNDED_BY'] } },
      include: { sourceEntity: { include: { headquartersCountry: { select: { name: true } } } } },
    }),
    prisma.lobbyingFiling.findMany({ where: { entityId: entity.id } }),
  ])

  // SBIR rollup
  const byPhase: Record<string, { count: number; value: number }> = {}
  let sbirValue = 0
  for (const c of sbirContracts) {
    const phase = c.sbirPhase || 'Unknown'
    byPhase[phase] ??= { count: 0, value: 0 }
    byPhase[phase].count++
    byPhase[phase].value += c.value || 0
    sbirValue += c.value || 0
  }

  // Lobbying rollup
  const byYear: Record<number, number> = {}
  let lobbyTotal = 0
  for (const f of lobbyingFilings) {
    if (f.filingYear) byYear[f.filingYear] = (byYear[f.filingYear] || 0) + (f.amount || 0)
    lobbyTotal += f.amount || 0
  }

  // Funding split
  let govTotal = 0
  let privTotal = 0
  for (const r of fundingRounds) {
    if (r.source === 'government') govTotal += r.amount || 0
    else privTotal += r.amount || 0
  }

  const activeAuths =
    fedramp.filter((f) => f.status?.toLowerCase().includes('authorized')).length +
    dodPa.length +
    emass.length

  const riskFlags = jsonArray<string>(entity.riskFlags).map((flag) => ({
    flag,
    label: RISK_LABELS[flag]?.label ?? flag,
    detail: RISK_LABELS[flag]?.detail ?? '',
  }))

  const samStatus = sam?.activeStatus ?? null
  const samActive = Boolean(samStatus && samStatus.toLowerCase() === 'active')

  return {
    identity: {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      type: entity.type,
      description: entity.description,
      website: entity.website,
      headquartersCity: entity.headquartersCity,
      headquartersCountry: entity.headquartersCountry
        ? { name: entity.headquartersCountry.name, alpha2: entity.headquartersCountry.alpha2 }
        : null,
      founded: entity.founded,
      cageCode: entity.cageCode,
      uei: entity.uei,
      ticker: entity.ticker,
      stockExchange: entity.stockExchange,
      fundingType: entity.fundingType,
      businessSize: entity.businessSize,
      setAsides: jsonArray<string>(entity.setAsides),
      vendorSyncedAt: entity.vendorSyncedAt ? entity.vendorSyncedAt.toISOString() : null,
    },
    responsibility: {
      samRegistered: Boolean(sam),
      samStatus,
      samExpiration: sam?.expirationDate ? sam.expirationDate.toISOString() : null,
      naics: sam ? jsonArray(sam.naicsCodes) : [],
      psc: sam ? jsonArray(sam.pscCodes) : [],
      activeAuthorizations: activeAuths,
    },
    riskFlags,
    authorizations: {
      fedramp: fedramp.map((f) => ({
        csoName: f.csoName,
        status: f.status,
        impactLevel: f.impactLevel,
        serviceModel: jsonArray<string>(f.serviceModel),
        authorizationDate: f.authorizationDate ? f.authorizationDate.toISOString() : null,
        expirationDate: f.expirationDate ? f.expirationDate.toISOString() : null,
        sponsoringAgency: f.sponsoringAgency,
      })),
      dodPa: dodPa.map((d) => ({
        csoName: d.csoName,
        impactLevel: d.impactLevel,
        paExpiration: d.paExpiration ? d.paExpiration.toISOString() : null,
        sponsorComponent: d.sponsorComponent,
      })),
      emass: emass.map((e) => ({
        systemName: e.systemName,
        component: e.component,
        authorizationType: e.authorizationType,
        expirationDate: e.expirationDate ? e.expirationDate.toISOString() : null,
      })),
    },
    pastPerformance: {
      totalObligated: entity.totalFederalObligated || 0,
      primaryAgency: entity.primaryAgency,
      agencyBreakdown: jsonArray<AgencyBreakdownRow>(entity.agencyBreakdown),
      topContracts: contracts.map((c) => ({
        id: c.id,
        description: c.description,
        value: c.value,
        agency: c.agency?.name ?? null,
        awardDate: c.awardDate ? c.awardDate.toISOString() : null,
      })),
      contractCount: contracts.length,
    },
    sbir: {
      totalAwards: sbirContracts.length,
      totalValue: sbirValue,
      byPhase,
      recent: sbirContracts.slice(0, 10).map((c) => ({
        id: c.id,
        title: c.description,
        program: c.sbirProgram,
        phase: c.sbirPhase,
        agency: c.sbirBranch || c.agency?.name || null,
        year: c.sbirAwardYear,
        value: c.value,
      })),
    },
    funding: {
      rounds: fundingRounds.map((r) => ({
        id: r.id,
        roundName: r.roundName,
        roundType: r.roundType,
        amount: r.amount,
        date: r.date ? r.date.toISOString() : null,
        source: r.source,
        provider: r.provider,
      })),
      governmentTotal: govTotal,
      privateTotal: privTotal,
      fundedBy: fundedByConnections.map((c) => ({
        id: c.sourceEntity?.id,
        name: c.sourceEntity?.name ?? 'Unknown',
        country: c.sourceEntity?.headquartersCountry?.name,
      })),
    },
    lobbying: { totalAmount: lobbyTotal, filingCount: lobbyingFilings.length, byYear },
  }
}
