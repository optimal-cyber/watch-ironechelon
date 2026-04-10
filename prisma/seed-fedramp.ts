import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { readFileSync } from 'fs'

const url = process.env.TURSO_DATABASE_URL || 'file:dev.db'
const authToken = process.env.TURSO_AUTH_TOKEN

const adapter = new PrismaLibSql({
  url,
  ...(authToken ? { authToken } : {}),
})

const prisma = new PrismaClient({ adapter })

function normalizeStatus(raw: string): string {
  if (!raw) return 'Unknown'
  const lower = raw.toLowerCase()
  if (lower.includes('authorized') && !lower.includes('in process') && !lower.includes('ready')) return 'Authorized'
  if (lower.includes('in process')) return 'InProcess'
  if (lower.includes('ready')) return 'Ready'
  return raw
}

function parseDate(value: unknown): Date | null {
  if (!value) return null
  const s = String(value)
  if (s === 'Continuous ATO' || s === '') return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// New FedRAMP marketplace ATO export format (from fedramp.gov Export ATO Data)
// Each record is an individual ATO (one per agency per product).
// We group by fedramp_id to build one product record with leveraging agencies.
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
  ato_type?: string // "Initial", "Reuse", ""
}

// Legacy format (from GSA marketplace-fedramp-gov-data)
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
  agency_reuse?: Array<{ agency: string }> | null
  service_desc?: string
  website?: string
  logo?: string
  partnering_agency?: string
}

function isAtoExportFormat(data: unknown[]): data is AtoExportRecord[] {
  const first = data[0] as Record<string, unknown>
  return 'fedramp_id' in first && 'cloud_service_offering' in first
}

function groupAtoExportRecords(records: AtoExportRecord[]) {
  const grouped = new Map<string, AtoExportRecord[]>()
  for (const r of records) {
    if (!r.fedramp_id) continue
    const existing = grouped.get(r.fedramp_id) || []
    existing.push(r)
    grouped.set(r.fedramp_id, existing)
  }

  const products = []
  for (const [fedrampId, atos] of grouped) {
    // Use the Initial ATO as primary, fall back to first record
    const primary = atos.find(a => a.ato_type === 'Initial') || atos[0]

    // Collect all agencies (both initial and reuse)
    const agencies: string[] = []
    for (const ato of atos) {
      const agency = ato.sub_agency || ato.parent_agency
      if (agency && !agencies.includes(agency)) {
        agencies.push(agency)
      }
    }

    // Find the sponsoring agency from the Initial ATO
    const sponsor = primary.sub_agency || primary.parent_agency || null

    // Find earliest expiration date across all ATOs (for tracking)
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
      impactLevel: null as string | null, // not in ATO export
      serviceModel: JSON.stringify(primary.service_model || []),
      deploymentModel: null as string | null,
      authorizationDate: parseDate(primary.fedramp_authorization_date || primary.ato_issuance_date),
      expirationDate: earliestExpiration,
      sponsoringAgency: sponsor,
      leveragingAgencies: JSON.stringify(agencies),
      assessorName: primary.independent_assessor || null,
      authType: primary.ato_type || null,
      serviceDescription: primary.service_description || null,
      website: null as string | null,
      logo: null as string | null,
    })
  }
  return products
}

function mapLegacyRecord(r: LocalRecord) {
  let leveragingAgencies: string[] = []
  if (Array.isArray(r.agency_authorizations)) {
    leveragingAgencies = r.agency_authorizations.map((a: unknown) => {
      if (typeof a === 'string') return a
      if (a && typeof a === 'object' && 'agency' in (a as Record<string, unknown>)) return (a as { agency: string }).agency
      return String(a)
    }).filter(Boolean)
  }
  if (Array.isArray(r.agency_reuse)) {
    for (const a of r.agency_reuse) {
      if (a && typeof a === 'object' && 'agency' in a && !leveragingAgencies.includes(a.agency)) {
        leveragingAgencies.push(a.agency)
      }
    }
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
    expirationDate: null as Date | null,
    sponsoringAgency: r.partnering_agency || null,
    leveragingAgencies: JSON.stringify(leveragingAgencies),
    assessorName: r.independent_assessor || null,
    authType: r.auth_type || null,
    serviceDescription: r.service_desc || null,
    website: r.website || null,
    logo: r.logo || null,
  }
}

async function main() {
  const filePath = process.argv[2] || '/Users/ryangutwein/Downloads/products+2026-04-10-ato.json'
  console.log(`[SEED] Loading FedRAMP data from: ${filePath}`)

  const raw = readFileSync(filePath, 'utf-8')
  const parsed = JSON.parse(raw)
  const records: unknown[] = Array.isArray(parsed) ? parsed : parsed.data?.Products || parsed.Products || parsed

  let products: ReturnType<typeof mapLegacyRecord>[]

  if (isAtoExportFormat(records)) {
    console.log(`[SEED] Detected ATO export format (${records.length} ATOs)`)
    products = groupAtoExportRecords(records)
    console.log(`[SEED] Grouped into ${products.length} unique products`)
  } else {
    console.log(`[SEED] Detected legacy format (${records.length} records)`)
    products = (records as LocalRecord[]).map(mapLegacyRecord)
  }

  let added = 0
  let updated = 0
  let failed = 0

  for (const data of products) {
    if (!data.packageId) { failed++; continue }

    try {
      const existing = await prisma.fedrampAuthorization.findUnique({
        where: { packageId: data.packageId },
        select: { id: true },
      })
      await prisma.fedrampAuthorization.upsert({
        where: { packageId: data.packageId },
        create: { ...data, lastSynced: new Date() },
        update: { ...data, lastSynced: new Date() },
      })
      if (existing) updated++
      else added++
    } catch (err) {
      failed++
      console.error(`[SEED] Error upserting ${data.packageId}:`, err instanceof Error ? err.message : err)
    }
  }

  await prisma.atoSyncLog.upsert({
    where: { source: 'fedramp' },
    create: { source: 'fedramp', lastSyncAt: new Date(), recordsAdded: added, recordsUpdated: updated, recordsFailed: failed, status: 'success' },
    update: { lastSyncAt: new Date(), recordsAdded: added, recordsUpdated: updated, recordsFailed: failed, status: 'success' },
  })

  console.log(`[SEED] Done: ${added} added, ${updated} updated, ${failed} failed`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
