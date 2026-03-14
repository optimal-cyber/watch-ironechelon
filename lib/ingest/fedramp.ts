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
  const d = new Date(value as string)
  return isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// Map a record from the local FedRAMP JSON download
// Fields: id, csp, cso, status, impact_level, service_model, deployment_model,
//         auth_date, auth_type, independent_assessor, agency_authorizations,
//         service_desc, website, logo, partnering_agency
// ---------------------------------------------------------------------------
interface LocalRecord {
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

function mapLocalRecord(r: LocalRecord) {
  // Leveraging agencies can be an array of objects or strings
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
// Map a record from the GitHub 18F data feed
// Fields: Cloud_Service_Provider_Name, Cloud_Service_Provider_Package,
//         Designation, Impact_Level, Service_Model, Deployment_Model,
//         Authorization_Date, Authorization_Type, Independent_Assessor,
//         Leveraged_ATO_Letters, CSP_URL, Logo, Sponsoring_Agency,
//         FedRAMP_Package_ID, CSP_Description
// ---------------------------------------------------------------------------
interface GitHubRecord {
  FedRAMP_Package_ID?: string
  Cloud_Service_Provider_Name?: string
  Cloud_Service_Provider_Package?: string
  Designation?: string
  Impact_Level?: string
  Service_Model?: string[]
  Deployment_Model?: string
  Authorization_Date?: string
  Authorization_Type?: string
  Independent_Assessor?: string
  Leveraged_ATO_Letters?: Array<{ Letter_Date?: string; Letter_Expiration_Date?: string; Leveraging_Agency?: string }> | null
  CSP_Description?: string
  CSP_URL?: string
  Logo?: string
  Sponsoring_Agency?: string
}

function mapGitHubRecord(r: GitHubRecord) {
  const leveragingAgencies = Array.isArray(r.Leveraged_ATO_Letters)
    ? r.Leveraged_ATO_Letters.map(l => l.Leveraging_Agency).filter(Boolean) as string[]
    : []

  return {
    packageId: r.FedRAMP_Package_ID || '',
    cspName: r.Cloud_Service_Provider_Name || '',
    csoName: r.Cloud_Service_Provider_Package || '',
    status: normalizeStatus(r.Designation || ''),
    impactLevel: r.Impact_Level || null,
    serviceModel: JSON.stringify(r.Service_Model || []),
    deploymentModel: r.Deployment_Model || null,
    authorizationDate: parseDate(r.Authorization_Date),
    sponsoringAgency: r.Sponsoring_Agency || null,
    leveragingAgencies: JSON.stringify(leveragingAgencies),
    assessorName: r.Independent_Assessor || null,
    authType: r.Authorization_Type || null,
    serviceDescription: r.CSP_Description || null,
    website: r.CSP_URL || null,
    logo: r.Logo || null,
  }
}

// ---------------------------------------------------------------------------
// Source functions
// ---------------------------------------------------------------------------

/**
 * Load FedRAMP records from a local JSON file (the official marketplace download).
 */
export async function loadFromFile(filePath: string): Promise<{ data: ReturnType<typeof mapLocalRecord>[]; sourceLabel: string }> {
  console.log(`${LOG_PREFIX} Loading FedRAMP data from file: ${filePath}`)
  const raw = await readFile(filePath, 'utf-8')
  const parsed: LocalRecord[] = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array in file')
  console.log(`${LOG_PREFIX} Parsed ${parsed.length} records from file`)
  return {
    data: parsed.map(mapLocalRecord),
    sourceLabel: `file:${filePath}`,
  }
}

/**
 * Fetch FedRAMP records from the 18F GitHub repository.
 */
export async function fetchFromGitHub(): Promise<{ data: ReturnType<typeof mapGitHubRecord>[]; sourceLabel: string }> {
  const url = 'https://raw.githubusercontent.com/18F/fedramp-data/master/data/data.json'
  console.log(`${LOG_PREFIX} Fetching FedRAMP data from GitHub: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status} ${res.statusText}`)
  const json = await res.json()
  const records: GitHubRecord[] = json.data || json
  if (!Array.isArray(records)) throw new Error('Unexpected GitHub JSON structure')
  console.log(`${LOG_PREFIX} Fetched ${records.length} records from GitHub`)
  return {
    data: records.map(mapGitHubRecord),
    sourceLabel: 'github:18F/fedramp-data',
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
export async function syncFedrampData(
  records: {
    packageId: string
    cspName: string
    csoName: string
    status: string
    impactLevel: string | null
    serviceModel: string
    deploymentModel: string | null
    authorizationDate: Date | null
    sponsoringAgency: string | null
    leveragingAgencies: string
    assessorName: string | null
    authType: string | null
    serviceDescription: string | null
    website: string | null
    logo: string | null
  }[],
): Promise<SyncResult> {
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
