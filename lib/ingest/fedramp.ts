import { prisma } from '@/lib/db'
import { readFile } from 'fs/promises'

const LOG_PREFIX = '[ATO-SYNC]'

// ---------------------------------------------------------------------------
// Status normalization
// ---------------------------------------------------------------------------
function normalizeStatus(raw: string): string {
  if (!raw) return 'Unknown'
  const lower = raw.toLowerCase()
  if (lower.includes('authorized') && !lower.includes('in process') && !lower.includes('ready')) return 'Authorized'
  if (lower.includes('in process')) return 'InProcess'
  if (lower.includes('ready')) return 'Ready'
  return raw
}

// ---------------------------------------------------------------------------
// Date parsing helper
// ---------------------------------------------------------------------------
function parseDate(value: unknown): Date | null {
  if (!value) return null
  const s = String(value)
  if (s === 'Continuous ATO' || s === '') return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// Mapped product record (common output format)
// ---------------------------------------------------------------------------
export interface MappedProduct {
  packageId: string
  cspName: string
  csoName: string
  status: string
  impactLevel: string | null
  serviceModel: string
  deploymentModel: string | null
  authorizationDate: Date | null
  expirationDate: Date | null
  sponsoringAgency: string | null
  leveragingAgencies: string
  assessorName: string | null
  authType: string | null
  serviceDescription: string | null
  website: string | null
  logo: string | null
}

// ---------------------------------------------------------------------------
// Format 1: GSA marketplace-fedramp-gov-data (product-level)
// Fields: id, csp, cso, status, impact_level, service_model, deployment_model,
//         auth_date, auth_type, independent_assessor, agency_authorizations,
//         service_desc, website, logo, partnering_agency
// ---------------------------------------------------------------------------
interface GsaProductRecord {
  id: string
  csp: string
  cso: string
  status: string
  impact_level?: string
  service_model?: string[]
  deployment_model?: string
  auth_date?: string
  auth_type?: string
  independent_assessor?: string
  agency_authorizations?: Array<{ agency: string }> | string[] | null
  service_desc?: string
  website?: string
  logo?: string
  partnering_agency?: string
}

function mapGsaProductRecord(r: GsaProductRecord): MappedProduct {
  let leveragingAgencies: string[] = []
  if (Array.isArray(r.agency_authorizations)) {
    leveragingAgencies = r.agency_authorizations.map((a: unknown) => {
      if (typeof a === 'string') return a
      if (a && typeof a === 'object' && 'agency' in (a as Record<string, unknown>)) return (a as { agency: string }).agency
      return String(a)
    }).filter(Boolean)
  }

  return {
    packageId: r.id,
    cspName: r.csp || '',
    csoName: r.cso || '',
    status: normalizeStatus(r.status),
    impactLevel: r.impact_level || null,
    serviceModel: JSON.stringify(r.service_model || []),
    deploymentModel: r.deployment_model || null,
    authorizationDate: parseDate(r.auth_date),
    expirationDate: null,
    sponsoringAgency: r.partnering_agency || null,
    leveragingAgencies: JSON.stringify(leveragingAgencies),
    assessorName: r.independent_assessor || null,
    authType: r.auth_type || null,
    serviceDescription: r.service_desc || null,
    website: r.website || null,
    logo: r.logo || null,
  }
}

// ---------------------------------------------------------------------------
// Format 2: fedramp.gov ATO export (ATO-level, one row per agency per product)
// Fields: fedramp_id, cloud_service_provider, cloud_service_offering,
//         service_description, business_categories, service_model, status,
//         independent_assessor, authorizations, reuse, parent_agency, sub_agency,
//         ato_issuance_date, fedramp_authorization_date, annual_assessment_date,
//         ato_expiration_date, ato_type
// ---------------------------------------------------------------------------
interface AtoExportRecord {
  fedramp_id: string
  cloud_service_provider: string
  cloud_service_offering: string
  service_description?: string
  business_categories?: string[]
  service_model?: string[]
  status: string
  independent_assessor?: string
  authorizations?: number
  reuse?: number
  parent_agency?: string
  sub_agency?: string | null
  ato_issuance_date?: string
  fedramp_authorization_date?: string
  annual_assessment_date?: string
  ato_expiration_date?: string
  ato_type?: string
}

function isAtoExportFormat(data: unknown[]): data is AtoExportRecord[] {
  if (!data.length) return false
  const first = data[0] as Record<string, unknown>
  return 'fedramp_id' in first && 'cloud_service_offering' in first
}

function groupAtoExportRecords(records: AtoExportRecord[]): MappedProduct[] {
  const grouped = new Map<string, AtoExportRecord[]>()
  for (const r of records) {
    if (!r.fedramp_id) continue
    const existing = grouped.get(r.fedramp_id) || []
    existing.push(r)
    grouped.set(r.fedramp_id, existing)
  }

  const products: MappedProduct[] = []
  for (const [fedrampId, atos] of grouped) {
    const primary = atos.find(a => a.ato_type === 'Initial') || atos[0]

    const agencies: string[] = []
    for (const ato of atos) {
      const agency = ato.sub_agency || ato.parent_agency
      if (agency && !agencies.includes(agency)) {
        agencies.push(agency)
      }
    }

    const sponsor = primary.sub_agency || primary.parent_agency || null

    // Find earliest non-continuous expiration date
    let earliestExpiration: Date | null = null
    for (const ato of atos) {
      const d = parseDate(ato.ato_expiration_date)
      if (d && (!earliestExpiration || d < earliestExpiration)) {
        earliestExpiration = d
      }
    }

    products.push({
      packageId: fedrampId,
      cspName: primary.cloud_service_provider || '',
      csoName: primary.cloud_service_offering || '',
      status: normalizeStatus(primary.status),
      impactLevel: null,
      serviceModel: JSON.stringify(primary.service_model || []),
      deploymentModel: null,
      authorizationDate: parseDate(primary.fedramp_authorization_date || primary.ato_issuance_date),
      expirationDate: earliestExpiration,
      sponsoringAgency: sponsor,
      leveragingAgencies: JSON.stringify(agencies),
      assessorName: primary.independent_assessor || null,
      authType: primary.ato_type || null,
      serviceDescription: primary.service_description || null,
      website: null,
      logo: null,
    })
  }
  return products
}

// ---------------------------------------------------------------------------
// Auto-detect format and map records
// ---------------------------------------------------------------------------
function autoDetectAndMap(rawRecords: unknown[]): { data: MappedProduct[]; format: string } {
  if (isAtoExportFormat(rawRecords)) {
    console.log(`${LOG_PREFIX} Detected ATO export format (${rawRecords.length} ATOs)`)
    const products = groupAtoExportRecords(rawRecords)
    console.log(`${LOG_PREFIX} Grouped into ${products.length} unique products`)
    return { data: products, format: 'ato-export' }
  }
  console.log(`${LOG_PREFIX} Detected GSA product format (${rawRecords.length} records)`)
  return { data: (rawRecords as GsaProductRecord[]).map(mapGsaProductRecord), format: 'gsa-product' }
}

// ---------------------------------------------------------------------------
// Source functions
// ---------------------------------------------------------------------------

/**
 * Map raw JSON records (already parsed). Auto-detects format.
 * Useful for inline JSON uploads from the admin panel.
 */
export function loadFromRecords(rawRecords: unknown[]): { data: MappedProduct[]; sourceLabel: string } {
  if (!Array.isArray(rawRecords) || !rawRecords.length) {
    throw new Error('Expected non-empty array of records')
  }
  const { data, format } = autoDetectAndMap(rawRecords)
  return { data, sourceLabel: `inline(${format})` }
}

/**
 * Load FedRAMP records from a local JSON file.
 * Auto-detects format: ATO export (fedramp.gov) or GSA product-level.
 */
export async function loadFromFile(filePath: string): Promise<{ data: MappedProduct[]; sourceLabel: string }> {
  console.log(`${LOG_PREFIX} Loading FedRAMP data from file: ${filePath}`)
  const raw = await readFile(filePath, 'utf-8')
  const parsed = JSON.parse(raw)

  // Handle both top-level array and nested structures
  const rawRecords: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed?.data?.Products || parsed?.Products || parsed

  if (!Array.isArray(rawRecords)) throw new Error('Expected JSON array in file')

  const { data, format } = autoDetectAndMap(rawRecords)
  return { data, sourceLabel: `file(${format}):${filePath}` }
}

/**
 * Fetch FedRAMP records from the GSA marketplace data repository (updated daily).
 */
export async function fetchFromGitHub(): Promise<{ data: MappedProduct[]; sourceLabel: string }> {
  const url = 'https://raw.githubusercontent.com/GSA/marketplace-fedramp-gov-data/main/data.json'
  console.log(`${LOG_PREFIX} Fetching FedRAMP data from GitHub: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status} ${res.statusText}`)
  const json = await res.json()
  const records: GsaProductRecord[] = json?.data?.Products || json?.Products || []
  if (!Array.isArray(records)) throw new Error('Unexpected GitHub JSON structure')
  console.log(`${LOG_PREFIX} Fetched ${records.length} records from GitHub`)
  return {
    data: records.map(mapGsaProductRecord),
    sourceLabel: 'github:GSA/marketplace-fedramp-gov-data',
  }
}

// ---------------------------------------------------------------------------
// Core sync function
// ---------------------------------------------------------------------------

export interface SyncResult {
  added: number
  updated: number
  failed: number
  total: number
  errors: string[]
}

/**
 * Upsert an array of mapped FedRAMP records into the database and log the sync.
 */
export async function syncFedrampData(records: MappedProduct[]): Promise<SyncResult> {
  let added = 0
  let updated = 0
  let failed = 0
  const errors: string[] = []

  console.log(`${LOG_PREFIX} Starting sync of ${records.length} FedRAMP records`)

  for (const record of records) {
    if (!record.packageId) {
      failed++
      errors.push('Skipped record with missing packageId')
      continue
    }

    try {
      const existing = await prisma.fedrampAuthorization.findUnique({
        where: { packageId: record.packageId },
        select: { id: true },
      })

      await prisma.fedrampAuthorization.upsert({
        where: { packageId: record.packageId },
        create: {
          ...record,
          lastSynced: new Date(),
        },
        update: {
          ...record,
          lastSynced: new Date(),
        },
      })

      if (existing) {
        updated++
      } else {
        added++
      }
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Failed packageId=${record.packageId}: ${msg}`)
      console.error(`${LOG_PREFIX} Error upserting ${record.packageId}:`, msg)
    }
  }

  // Log the sync result
  try {
    await prisma.atoSyncLog.upsert({
      where: { source: 'fedramp' },
      create: {
        source: 'fedramp',
        lastSyncAt: new Date(),
        recordsAdded: added,
        recordsUpdated: updated,
        recordsFailed: failed,
        status: failed > 0 && added === 0 && updated === 0 ? 'failed' : 'success',
      },
      update: {
        lastSyncAt: new Date(),
        recordsAdded: added,
        recordsUpdated: updated,
        recordsFailed: failed,
        status: failed > 0 && added === 0 && updated === 0 ? 'failed' : 'success',
      },
    })
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to write sync log:`, err)
  }

  console.log(`${LOG_PREFIX} Sync complete: ${added} added, ${updated} updated, ${failed} failed out of ${records.length} total`)

  return { added, updated, failed, total: records.length, errors: errors.slice(0, 50) }
}
