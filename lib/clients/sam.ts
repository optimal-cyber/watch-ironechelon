/**
 * SAM.gov Entity Management API client.
 *
 * Provides the registration facts a contracting officer needs for a FAR 9.104
 * responsibility determination: active registration status, UEI/CAGE, NAICS/PSC,
 * and small-business / socio-economic set-aside eligibility.
 *
 * Env fix: reads `SAM_GOV_API_KEY ?? SAM_SECRET` — the deployed .env defines
 * SAM_SECRET, while the original seed-sam route only read SAM_GOV_API_KEY, which
 * left SAM ingestion silently dead.
 */

import { fetchJson } from '@/lib/http/fetch-with-retry'

const SAM_API_BASE = 'https://api.sam.gov/entity-information/v3/entities'

export function getSamApiKey(): string | undefined {
  return process.env.SAM_GOV_API_KEY || process.env.SAM_SECRET || undefined
}

export interface SamNaics {
  naicsCode: string
  naicsDescription: string
  isPrimary: boolean
}

export interface SamPsc {
  pscCode: string
  pscDescription: string
}

export interface SamBusinessType {
  businessTypeCode: string
  businessTypeDescription: string
}

export interface SamEntity {
  ueiSAM: string
  legalBusinessName: string
  cageCode?: string
  duns?: string
  physicalAddress?: {
    addressLine1?: string
    city?: string
    stateOrProvinceCode?: string
    zipCode?: string
    countryCode?: string
  }
  mailingAddress?: {
    addressLine1?: string
    city?: string
    stateOrProvinceCode?: string
    zipCode?: string
    countryCode?: string
  }
  congressionalDistrict?: string
  naicsList?: SamNaics[]
  pscList?: SamPsc[]
  businessTypes?: { businessTypeList?: SamBusinessType[] }
  entityStructure?: string
  stateOfIncorporation?: string
  fiscalYearEndCloseDate?: string
  entityURL?: string
  registrationDate?: string
  registrationExpirationDate?: string
  activeRegistrationStatus?: string
}

interface SamApiRecord {
  entityRegistration: SamEntity
  coreData?: {
    physicalAddress?: SamEntity['physicalAddress']
    mailingAddress?: SamEntity['mailingAddress']
    congressionalDistrict?: string
    businessTypes?: SamEntity['businessTypes']
    entityInformation?: {
      entityURL?: string
      fiscalYearEndCloseDate?: string
      entityStructure?: string
      stateOfIncorporation?: string
    }
  }
  assertions?: {
    goodsAndServices?: { naicsList?: SamNaics[]; pscList?: SamPsc[] }
  }
}

interface SamApiResponse {
  entityData?: SamApiRecord[]
  totalRecords?: number
}

function mapRecord(rec: SamApiRecord): SamEntity {
  return {
    ...rec.entityRegistration,
    physicalAddress: rec.coreData?.physicalAddress,
    mailingAddress: rec.coreData?.mailingAddress,
    congressionalDistrict: rec.coreData?.congressionalDistrict,
    businessTypes: rec.coreData?.businessTypes ?? rec.entityRegistration.businessTypes,
    naicsList: rec.assertions?.goodsAndServices?.naicsList,
    pscList: rec.assertions?.goodsAndServices?.pscList,
    entityURL: rec.coreData?.entityInformation?.entityURL,
    fiscalYearEndCloseDate: rec.coreData?.entityInformation?.fiscalYearEndCloseDate,
    entityStructure: rec.coreData?.entityInformation?.entityStructure,
    stateOfIncorporation: rec.coreData?.entityInformation?.stateOfIncorporation,
  }
}

async function query(params: Record<string, string>): Promise<SamEntity[]> {
  const apiKey = getSamApiKey()
  if (!apiKey) throw new Error('SAM API key not configured (set SAM_GOV_API_KEY or SAM_SECRET)')

  const search = new URLSearchParams({
    api_key: apiKey,
    includeSections: 'entityRegistration,coreData,assertions',
    ...params,
  })
  const data = await fetchJson<SamApiResponse>(
    `${SAM_API_BASE}?${search.toString()}`,
    {},
    { label: `sam ${JSON.stringify(params)}`, cacheTtlMs: 5 * 60_000 }
  )
  return (data.entityData ?? []).map(mapRecord)
}

/** Look up active registrations by legal business name. */
export function getEntityByName(name: string): Promise<SamEntity[]> {
  return query({ legalBusinessName: name, registrationStatus: 'A' })
}

/** Look up a single registration by UEI (strong key). */
export function getEntityByUei(uei: string): Promise<SamEntity[]> {
  return query({ ueiSAM: uei })
}

// Keywords in SAM business-type descriptions that indicate small-business /
// socio-economic set-aside eligibility.
const SET_ASIDE_KEYWORDS: { key: string; test: RegExp }[] = [
  { key: 'SMALL_BUSINESS', test: /small business/i },
  { key: '8A', test: /8\(a\)/i },
  { key: 'WOMAN_OWNED', test: /woman[- ]owned|women[- ]owned|wosb/i },
  { key: 'VETERAN_OWNED', test: /veteran[- ]owned|\bvosb\b/i },
  { key: 'SDVOSB', test: /service[- ]disabled/i },
  { key: 'HUBZONE', test: /hubzone/i },
  { key: 'MINORITY_OWNED', test: /minority[- ]owned/i },
  { key: 'DISADVANTAGED', test: /disadvantaged/i },
  { key: 'NATIVE_AMERICAN', test: /tribal|native american|alaskan native/i },
]

/**
 * Derive a coarse business size + set-aside flags from SAM business types.
 * Heuristic: any small-business/socio-economic designation ⇒ size SMALL.
 * (SAM's authoritative size is NAICS-size-standard specific; this is a
 * pragmatic signal for filtering/badging, not a formal size determination.)
 */
export function parseBusinessSize(entity: SamEntity): {
  businessSize: 'SMALL' | 'OTHER' | null
  setAsides: string[]
} {
  const descriptions = (entity.businessTypes?.businessTypeList ?? []).map(
    (b) => b.businessTypeDescription || ''
  )
  const joined = descriptions.join(' | ')
  const setAsides = SET_ASIDE_KEYWORDS.filter(({ test }) => test.test(joined)).map(
    ({ key }) => key
  )
  let businessSize: 'SMALL' | 'OTHER' | null = null
  if (descriptions.length > 0) {
    businessSize = setAsides.length > 0 ? 'SMALL' : 'OTHER'
  }
  return { businessSize, setAsides }
}
