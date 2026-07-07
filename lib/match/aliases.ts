/**
 * Consolidated vendor alias registry + entity resolver.
 *
 * Replaces the three duplicated alias tables that lived in the seed-* routes:
 *   - SEARCH_ALIASES        (seed-sbir, seed-federal-contracts)  — USAspending legal names
 *   - SAM_TO_ENTITY         (seed-sam)                           — SAM legal names
 *   - REGISTRANT_TO_ENTITY  (seed-lobbying)                      — Senate LDA registrant names
 * plus COMPANY_TYPE / COMPANY_COUNTRY (auto-create hints).
 *
 * Cross-source name matching (SAM legal name vs USAspending recipient text vs
 * FedRAMP cspName vs SBIR firm) is the platform's hardest correctness problem.
 * `resolveEntity` prefers UEI/CAGE (strong keys) and falls back to
 * slug/alias/normalized-name matching.
 */

import { prisma } from '@/lib/db'
import { slugify, normalizeVendorName, vendorNamesMatch } from './vendor-name'

export interface VendorAlias {
  /** Our canonical display name. */
  canonical: string
  /** Search terms to use against USAspending recipient_search_text. */
  usaspending?: string[]
  /** Known SAM legal business names. */
  sam?: string[]
  /** Known Senate LDA registrant names. */
  lobbying?: string[]
  /** HQ country (alpha2) for auto-created entities; defaults to US. */
  hqAlpha2?: string
  /** Entity.type used when auto-creating. */
  entityType?: string
}

// USAspending uses legal entity names, not trade names.
const USASPENDING_ALIASES: Record<string, string[]> = {
  SpaceX: ['Space Exploration Technologies'],
  Raytheon: ['Raytheon', 'RTX'],
  RTX: ['RTX', 'Raytheon'],
  'Booz Allen': ['Booz Allen Hamilton'],
  CACI: ['CACI International', 'CACI Inc'],
  SAIC: ['Science Applications International', 'SAIC'],
  ManTech: ['ManTech International', 'ManTech'],
  'Shield AI': ['Shield AI'],
  Firestorm: ['Firestorm Labs', 'Firestorm Solutions'],
  'Scale AI': ['Scale AI', 'Scale.AI'],
  'Primer AI': ['Primer Federal', 'Primer Inc'],
  'Planet Labs': ['Planet Labs PBC', 'Planet Federal'],
  'Hawkeye 360': ['HawkEye 360'],
  'Leonardo DRS': ['DRS Defense Solutions', 'Leonardo DRS'],
  'Aerojet Rocketdyne': ['Aerojet Rocketdyne', 'L3Harris Aerojet'],
  'BigBear AI': ['BigBear.ai', 'BigBear AI'],
  'C3 AI': ['C3.ai', 'C3 AI Federal'],
  'Joby Aviation': ['Joby Aviation', 'Joby Aero'],
  'Rebellion Defense': ['Rebellion Defense'],
  'Vannevar Labs': ['Vannevar Labs'],
  'Applied Intuition': ['Applied Intuition'],
  'Second Front': ['Second Front Systems'],
}

// SAM legal name → our canonical display name.
const SAM_TO_CANONICAL: Record<string, string> = {
  'SPACE EXPLORATION TECHNOLOGIES CORP': 'SpaceX',
  'BOOZ ALLEN HAMILTON INC': 'Booz Allen',
  'CACI INTERNATIONAL INC': 'CACI',
  'SCIENCE APPLICATIONS INTERNATIONAL CORPORATION': 'SAIC',
  'MANTECH INTERNATIONAL CORPORATION': 'ManTech',
  'ANDURIL INDUSTRIES INC': 'Anduril',
  'MAXAR TECHNOLOGIES INC': 'Maxar',
  'SIERRA NEVADA CORPORATION': 'Sierra Nevada',
  'BLACKSKY TECHNOLOGY INC': 'BlackSky',
  'PLANET LABS PBC': 'Planet Labs',
  'SECOND FRONT SYSTEMS INC': 'Second Front',
}

// Senate LDA registrant name → our canonical display name.
const LOBBYING_TO_CANONICAL: Record<string, string> = {
  'Space Exploration Technologies': 'SpaceX',
  'Space Exploration Technologies Corp': 'SpaceX',
  'Booz Allen Hamilton': 'Booz Allen',
  'Booz Allen Hamilton Inc': 'Booz Allen',
  'CACI International': 'CACI',
  'CACI International Inc': 'CACI',
  'Science Applications International': 'SAIC',
  'ManTech International': 'ManTech',
  'Anduril Industries': 'Anduril',
  'Anduril Industries Inc': 'Anduril',
  'Maxar Technologies': 'Maxar',
  'Sierra Nevada Corporation': 'Sierra Nevada',
  'Elbit Systems of America': 'Elbit Systems',
}

// Canonical → Entity.type used when auto-creating a vendor.
const COMPANY_TYPE: Record<string, string> = {
  Anduril: 'DEFENSE_PRIME', 'Shield AI': 'AI_ML', Skydio: 'SURVEILLANCE',
  Epirus: 'DEFENSE_PRIME', 'Scale AI': 'AI_ML', SpaceX: 'DEFENSE_PRIME',
  Firestorm: 'DEFENSE_PRIME', 'Rebellion Defense': 'AI_ML',
  'Vannevar Labs': 'AI_ML', 'Primer AI': 'AI_ML', 'Rhombus Power': 'AI_ML',
  Shift5: 'CYBER_INTEL', 'Hawkeye 360': 'SURVEILLANCE', 'Capella Space': 'SURVEILLANCE',
  BlackSky: 'SURVEILLANCE', 'Planet Labs': 'SURVEILLANCE',
  'Babel Street': 'SURVEILLANCE', 'Clearview AI': 'SURVEILLANCE',
  Dataminr: 'AI_ML', 'Voyager Labs': 'SURVEILLANCE',
  Palantir: 'AI_ML', L3Harris: 'DEFENSE_PRIME', Leidos: 'DEFENSE_PRIME',
  SAIC: 'DEFENSE_PRIME', 'Booz Allen': 'CONSULTANCY', CACI: 'DEFENSE_PRIME',
  Raytheon: 'DEFENSE_PRIME', RTX: 'DEFENSE_PRIME',
  'Northrop Grumman': 'DEFENSE_PRIME', 'Lockheed Martin': 'DEFENSE_PRIME',
  'BAE Systems': 'DEFENSE_PRIME', 'General Dynamics': 'DEFENSE_PRIME',
  Boeing: 'DEFENSE_PRIME', ManTech: 'DEFENSE_PRIME',
  Textron: 'DEFENSE_PRIME', 'Elbit Systems': 'DEFENSE_PRIME',
  Thales: 'DEFENSE_PRIME', 'Leonardo DRS': 'DEFENSE_PRIME',
  'Mercury Systems': 'DEFENSE_PRIME', 'Curtiss-Wright': 'DEFENSE_PRIME',
  Kratos: 'DEFENSE_PRIME',
  CrowdStrike: 'CYBER_INTEL', 'Palo Alto Networks': 'CYBER_INTEL',
  Fortinet: 'CYBER_INTEL', SentinelOne: 'CYBER_INTEL',
  'Recorded Future': 'CYBER_INTEL', Mandiant: 'CYBER_INTEL',
  Cellebrite: 'CYBER_INTEL', Verint: 'SURVEILLANCE',
  Cobham: 'DEFENSE_PRIME', 'Sierra Nevada': 'DEFENSE_PRIME',
  Dynetics: 'DEFENSE_PRIME', 'Aerojet Rocketdyne': 'DEFENSE_PRIME',
  Peraton: 'DEFENSE_PRIME', Parsons: 'DEFENSE_PRIME',
  KBR: 'DEFENSE_PRIME', Maxar: 'SURVEILLANCE',
  Aerovironment: 'DEFENSE_PRIME', 'Joby Aviation': 'DEFENSE_PRIME',
  'Rocket Lab': 'DEFENSE_PRIME', Hermeus: 'DEFENSE_PRIME',
  Hadrian: 'DEFENSE_PRIME', 'Fortem Technologies': 'DEFENSE_PRIME',
  'C3 AI': 'AI_ML', 'BigBear AI': 'AI_ML', Dedrone: 'SURVEILLANCE',
  DroneShield: 'DEFENSE_PRIME', Govini: 'AI_ML',
  'Two Six Technologies': 'CYBER_INTEL', 'Applied Intuition': 'AI_ML',
  Istari: 'AI_ML', 'Second Front': 'DEFENSE_PRIME',
}

// Canonical → HQ country alpha2 (defaults to US when absent).
const COMPANY_COUNTRY: Record<string, string> = {
  'BAE Systems': 'GB',
  Thales: 'FR',
  'Elbit Systems': 'IL',
  Cellebrite: 'IL',
  Cobham: 'GB',
  'Leonardo DRS': 'IT',
  DroneShield: 'AU',
}

/** Build the canonical registry by merging all source maps. */
function buildRegistry(): Map<string, VendorAlias> {
  const registry = new Map<string, VendorAlias>()
  const ensure = (canonical: string): VendorAlias => {
    let entry = registry.get(canonical)
    if (!entry) {
      entry = { canonical }
      registry.set(canonical, entry)
    }
    return entry
  }

  for (const [canonical, terms] of Object.entries(USASPENDING_ALIASES)) {
    ensure(canonical).usaspending = terms
  }
  for (const [samName, canonical] of Object.entries(SAM_TO_CANONICAL)) {
    const e = ensure(canonical)
    ;(e.sam ??= []).push(samName)
  }
  for (const [regName, canonical] of Object.entries(LOBBYING_TO_CANONICAL)) {
    const e = ensure(canonical)
    ;(e.lobbying ??= []).push(regName)
  }
  for (const [canonical, type] of Object.entries(COMPANY_TYPE)) {
    ensure(canonical).entityType = type
  }
  for (const [canonical, alpha2] of Object.entries(COMPANY_COUNTRY)) {
    ensure(canonical).hqAlpha2 = alpha2
  }
  return registry
}

export const ALIAS_REGISTRY: Map<string, VendorAlias> = buildRegistry()

// Reverse index: normalized alias/canonical string → canonical name.
const NORMALIZED_INDEX: Map<string, string> = (() => {
  const idx = new Map<string, string>()
  for (const entry of ALIAS_REGISTRY.values()) {
    const names = [
      entry.canonical,
      ...(entry.usaspending ?? []),
      ...(entry.sam ?? []),
      ...(entry.lobbying ?? []),
    ]
    for (const n of names) {
      const key = normalizeVendorName(n)
      if (key && !idx.has(key)) idx.set(key, entry.canonical)
    }
  }
  return idx
})()

/** Find the alias entry for any name (canonical or any known alias). */
export function findAlias(name: string): VendorAlias | null {
  if (ALIAS_REGISTRY.has(name)) return ALIAS_REGISTRY.get(name)!
  const canonical = NORMALIZED_INDEX.get(normalizeVendorName(name))
  return canonical ? ALIAS_REGISTRY.get(canonical) ?? null : null
}

/** Terms to search USAspending recipient_search_text for a given name. */
export function usaspendingSearchTerms(name: string): string[] {
  return findAlias(name)?.usaspending ?? [name]
}

/** Entity.type hint for auto-creating a vendor (defaults to DEFENSE_PRIME). */
export function entityTypeFor(name: string): string {
  return findAlias(name)?.entityType ?? 'DEFENSE_PRIME'
}

/** HQ alpha2 hint for a vendor (defaults to US). */
export function hqAlpha2For(name: string): string {
  return findAlias(name)?.hqAlpha2 ?? 'US'
}

type EntityRecord = NonNullable<Awaited<ReturnType<typeof prisma.entity.findFirst>>>

/**
 * Resolve a vendor to an existing Entity. Strong keys (UEI, CAGE) first, then
 * canonical slug, exact name, and normalized-name fallback. Read-only —
 * creation is the caller's responsibility (see lib/vendor/sync-vendor.ts).
 */
export async function resolveEntity(input: {
  name?: string
  uei?: string | null
  cageCode?: string | null
}): Promise<EntityRecord | null> {
  const { name, uei, cageCode } = input

  if (uei) {
    const byUei = await prisma.entity.findFirst({ where: { uei } })
    if (byUei) return byUei
  }
  if (cageCode) {
    const byCage = await prisma.entity.findFirst({ where: { cageCode } })
    if (byCage) return byCage
  }
  if (!name) return null

  const alias = findAlias(name)
  const canonical = alias?.canonical ?? name

  // Exact slug on canonical, then the raw name.
  for (const candidate of [canonical, name]) {
    const bySlug = await prisma.entity.findFirst({ where: { slug: slugify(candidate) } })
    if (bySlug) return bySlug
  }

  // Exact name, then startsWith (avoids "SAIC" matching "Mosaic").
  const byName = await prisma.entity.findFirst({ where: { name: canonical } })
  if (byName) return byName
  const byStarts = await prisma.entity.findFirst({ where: { name: { startsWith: canonical } } })
  if (byStarts && vendorNamesMatch(byStarts.name, canonical)) return byStarts

  return null
}
