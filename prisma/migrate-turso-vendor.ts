import 'dotenv/config'
import { createClient } from '@libsql/client'

/**
 * Additive migration for the vendor-selection-intelligence feature.
 *
 * Adds cached vendor fields to Entity, funding-provenance fields to
 * FundingRound, and (importantly) patches the confirmed Turso drift where
 * FederalContract was created WITHOUT `awardingSubAgency` (which schema.prisma
 * has and app/ato/page.tsx reads). Every ALTER is guarded by a PRAGMA check so
 * the script is safe to re-run.
 *
 * Targets:
 *   - local dev.db:  `npx tsx prisma/migrate-turso-vendor.ts --local`
 *   - Turso (prod):  `npx tsx prisma/migrate-turso-vendor.ts`   (uses TURSO_* env)
 */

const isLocal =
  process.argv.includes('--local') || process.env.MIGRATE_TARGET === 'local'

const client = isLocal
  ? createClient({ url: 'file:./dev.db' })
  : (() => {
      const url = process.env.TURSO_DATABASE_URL
      const authToken = process.env.TURSO_AUTH_TOKEN
      if (!url || !authToken) {
        console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN (or pass --local)')
        process.exit(1)
      }
      return createClient({ url, authToken })
    })()

interface ColumnDef {
  name: string
  ddl: string // full column definition for ALTER TABLE ... ADD COLUMN <ddl>
}

const columnsByTable: Record<string, ColumnDef[]> = {
  Entity: [
    { name: 'businessSize', ddl: 'businessSize TEXT' },
    { name: 'setAsides', ddl: "setAsides TEXT NOT NULL DEFAULT '[]'" },
    { name: 'riskFlags', ddl: "riskFlags TEXT NOT NULL DEFAULT '[]'" },
    { name: 'primaryAgency', ddl: 'primaryAgency TEXT' },
    { name: 'agencyBreakdown', ddl: 'agencyBreakdown TEXT' },
    { name: 'totalFederalObligated', ddl: 'totalFederalObligated REAL' },
    { name: 'vendorSyncedAt', ddl: 'vendorSyncedAt DATETIME' },
  ],
  FederalContract: [
    { name: 'awardingSubAgency', ddl: 'awardingSubAgency TEXT' }, // drift fix
    { name: 'psc', ddl: 'psc TEXT' },
    { name: 'entityId', ddl: 'entityId TEXT' },
  ],
  FundingRound: [
    { name: 'source', ddl: 'source TEXT' },
    { name: 'roundName', ddl: 'roundName TEXT' },
    { name: 'provider', ddl: 'provider TEXT' },
    { name: 'raw', ddl: 'raw TEXT' },
  ],
}

const indexes = [
  'CREATE INDEX IF NOT EXISTS "FederalContract_entityId_idx" ON "FederalContract"("entityId")',
  'CREATE INDEX IF NOT EXISTS "FundingRound_entityId_idx" ON "FundingRound"("entityId")',
]

async function tableExists(table: string): Promise<boolean> {
  const res = await client.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    args: [table],
  })
  return res.rows.length > 0
}

async function existingColumns(table: string): Promise<Set<string>> {
  const info = await client.execute(`PRAGMA table_info("${table}")`)
  return new Set(info.rows.map((r) => r.name as string))
}

async function migrate() {
  console.log(`Target: ${isLocal ? 'local dev.db' : process.env.TURSO_DATABASE_URL}`)
  let added = 0

  for (const [table, cols] of Object.entries(columnsByTable)) {
    if (!(await tableExists(table))) {
      console.warn(`  ! Table ${table} does not exist — skipping`)
      continue
    }
    const existing = await existingColumns(table)
    for (const col of cols) {
      if (existing.has(col.name)) {
        console.log(`  ✓ ${table}.${col.name} already exists`)
        continue
      }
      await client.execute(`ALTER TABLE "${table}" ADD COLUMN ${col.ddl}`)
      console.log(`  + ${table}.${col.name}`)
      added++
    }
  }

  for (const idx of indexes) {
    await client.execute(idx)
  }
  console.log(`  ✓ ${indexes.length} indexes ensured`)

  console.log(`\nDone. Added ${added} columns.`)
  client.close()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
