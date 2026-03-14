import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import XLSX from 'xlsx'

const url = process.env.TURSO_DATABASE_URL || 'file:dev.db'
const authToken = process.env.TURSO_AUTH_TOKEN

const adapter = new PrismaLibSql({
  url,
  ...(authToken ? { authToken } : {}),
})

const prisma = new PrismaClient({ adapter })

function parseDate(value: unknown): Date | null {
  if (!value) return null
  // Handle Excel date serial numbers
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  // Handle date strings like "10/23/2027"
  const d = new Date(value as string)
  return isNaN(d.getTime()) ? null : d
}

function normalizeImpactLevel(raw: string): string {
  if (!raw) return 'Unknown'
  // Extract IL level: "IL5 high" -> "IL5", "IL6 moderate" -> "IL6"
  const match = raw.match(/IL(\d)/i)
  if (match) return `IL${match[1]}`
  return raw
}

async function main() {
  const filePath = process.argv[2] || '/tmp/disa-csos.xlsx'
  console.log(`[SEED-DISA] Loading DISA CSO data from: ${filePath}`)

  const wb = XLSX.readFile(filePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

  // Skip header row
  const dataRows = rows.slice(1).filter(r => r && r.length > 0 && r[0])
  console.log(`[SEED-DISA] Found ${dataRows.length} CSO records`)

  let added = 0
  let updated = 0
  let failed = 0

  for (const row of dataRows) {
    const cspName = (row[0] || '').toString().trim()
    const csoName = (row[1] || '').toString().trim()
    const impactLevelRaw = (row[2] || '').toString().trim()
    const serviceModels = (row[3] || '').toString().trim()
    const authStatus = (row[4] || '').toString().trim()
    const authExpiration = row[5]

    if (!cspName || !csoName) { failed++; continue }

    const impactLevel = normalizeImpactLevel(impactLevelRaw)
    const paExpiration = parseDate(authExpiration)

    const data = {
      csoName,
      cspName,
      impactLevel,
      paDate: null as Date | null,
      paExpiration,
      sponsorComponent: 'DISA',
      conditions: serviceModels ? `Service Models: ${serviceModels}. Status: ${authStatus}` : authStatus,
      source: 'disa-xlsx',
      lastSynced: new Date(),
    }

    try {
      const existing = await prisma.dodProvisionalAuth.findFirst({
        where: { csoName, cspName, impactLevel },
        select: { id: true },
      })

      if (existing) {
        await prisma.dodProvisionalAuth.update({
          where: { id: existing.id },
          data,
        })
        updated++
      } else {
        await prisma.dodProvisionalAuth.create({ data })
        added++
      }
    } catch (err) {
      failed++
      console.error(`[SEED-DISA] Error upserting ${cspName} / ${csoName} / ${impactLevel}:`, err instanceof Error ? err.message : err)
    }
  }

  await prisma.atoSyncLog.upsert({
    where: { source: 'disa-xlsx' },
    create: { source: 'disa-xlsx', lastSyncAt: new Date(), recordsAdded: added, recordsUpdated: updated, recordsFailed: failed, status: 'success' },
    update: { lastSyncAt: new Date(), recordsAdded: added, recordsUpdated: updated, recordsFailed: failed, status: 'success' },
  })

  console.log(`[SEED-DISA] Done: ${added} added, ${updated} updated, ${failed} failed`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
