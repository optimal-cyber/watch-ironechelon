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
  const d = new Date(value as string)
  return isNaN(d.getTime()) ? null : d
}

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

async function main() {
  const filePath = process.argv[2] || '/Users/ryangutwein/Downloads/fedramp-approved-products+2026-03-14.json'
  console.log(`[SEED] Loading FedRAMP data from: ${filePath}`)

  const raw = readFileSync(filePath, 'utf-8')
  const records: LocalRecord[] = JSON.parse(raw)
  console.log(`[SEED] Parsed ${records.length} records`)

  let added = 0
  let updated = 0
  let failed = 0

  for (const r of records) {
    if (!r.id) { failed++; continue }

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

    const data = {
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
      lastSynced: new Date(),
    }

    try {
      const existing = await prisma.fedrampAuthorization.findUnique({
        where: { packageId: data.packageId },
        select: { id: true },
      })
      await prisma.fedrampAuthorization.upsert({
        where: { packageId: data.packageId },
        create: data,
        update: data,
      })
      if (existing) updated++
      else added++
    } catch (err) {
      failed++
      console.error(`[SEED] Error upserting ${r.id}:`, err instanceof Error ? err.message : err)
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
