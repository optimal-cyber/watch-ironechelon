import 'dotenv/config'
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  process.exit(1)
}

const client = createClient({ url, authToken })

// Add SBIR columns to Contract table if they don't exist
const contractColumns = [
  { name: 'sbirProgram', type: 'TEXT' },
  { name: 'sbirPhase', type: 'TEXT' },
  { name: 'sbirTopicCode', type: 'TEXT' },
  { name: 'sbirAgency', type: 'TEXT' },
  { name: 'sbirBranch', type: 'TEXT' },
  { name: 'sbirAwardYear', type: 'INTEGER' },
  { name: 'sbirAbstract', type: 'TEXT' },
  { name: 'sbirKeywords', type: 'TEXT' },
  { name: 'sbirPiName', type: 'TEXT' },
]

// New tables to create
const newTables = [
  {
    name: 'LobbyingFiling',
    sql: `CREATE TABLE IF NOT EXISTS "LobbyingFiling" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "filingId" TEXT NOT NULL,
      "registrantName" TEXT NOT NULL,
      "clientName" TEXT NOT NULL,
      "filingType" TEXT,
      "filingYear" INTEGER,
      "filingPeriod" TEXT,
      "amount" REAL,
      "issues" TEXT NOT NULL DEFAULT '[]',
      "lobbyists" TEXT NOT NULL DEFAULT '[]',
      "governmentEntities" TEXT NOT NULL DEFAULT '[]',
      "specificIssues" TEXT,
      "entityId" TEXT,
      "source" TEXT NOT NULL DEFAULT 'senate-lda',
      "lastSynced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    indexes: [
      'CREATE UNIQUE INDEX IF NOT EXISTS "LobbyingFiling_filingId_key" ON "LobbyingFiling"("filingId")',
      'CREATE INDEX IF NOT EXISTS "LobbyingFiling_registrantName_idx" ON "LobbyingFiling"("registrantName")',
      'CREATE INDEX IF NOT EXISTS "LobbyingFiling_clientName_idx" ON "LobbyingFiling"("clientName")',
      'CREATE INDEX IF NOT EXISTS "LobbyingFiling_filingYear_idx" ON "LobbyingFiling"("filingYear")',
      'CREATE INDEX IF NOT EXISTS "LobbyingFiling_entityId_idx" ON "LobbyingFiling"("entityId")',
    ],
  },
  {
    name: 'SamRegistration',
    sql: `CREATE TABLE IF NOT EXISTS "SamRegistration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "uei" TEXT NOT NULL,
      "entityName" TEXT NOT NULL,
      "cageCode" TEXT,
      "duns" TEXT,
      "physicalAddress" TEXT,
      "mailingAddress" TEXT,
      "congressionalDistrict" TEXT,
      "naicsCodes" TEXT NOT NULL DEFAULT '[]',
      "pscCodes" TEXT NOT NULL DEFAULT '[]',
      "businessTypes" TEXT NOT NULL DEFAULT '[]',
      "entityStructure" TEXT,
      "stateOfIncorp" TEXT,
      "fiscalYearEnd" TEXT,
      "entityUrl" TEXT,
      "registrationDate" DATETIME,
      "expirationDate" DATETIME,
      "activeStatus" TEXT,
      "entityId" TEXT,
      "lastSynced" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    indexes: [
      'CREATE UNIQUE INDEX IF NOT EXISTS "SamRegistration_uei_key" ON "SamRegistration"("uei")',
      'CREATE INDEX IF NOT EXISTS "SamRegistration_entityName_idx" ON "SamRegistration"("entityName")',
      'CREATE INDEX IF NOT EXISTS "SamRegistration_cageCode_idx" ON "SamRegistration"("cageCode")',
      'CREATE INDEX IF NOT EXISTS "SamRegistration_entityId_idx" ON "SamRegistration"("entityId")',
    ],
  },
]

async function migrate() {
  console.log(`Connecting to: ${url}`)

  // 1. Add SBIR columns to Contract table
  const tableInfo = await client.execute('PRAGMA table_info(Contract)')
  const existingColumns = new Set(tableInfo.rows.map(r => r.name as string))
  console.log(`Contract table has ${existingColumns.size} columns`)

  let added = 0
  for (const col of contractColumns) {
    if (existingColumns.has(col.name)) {
      console.log(`  ✓ ${col.name} already exists`)
      continue
    }
    await client.execute(`ALTER TABLE Contract ADD COLUMN ${col.name} ${col.type}`)
    console.log(`  + Added ${col.name} (${col.type})`)
    added++
  }

  // 2. Create new tables
  for (const table of newTables) {
    console.log(`\nCreating table: ${table.name}`)
    await client.execute(table.sql)
    console.log(`  ✓ Table ${table.name} created`)

    for (const idx of table.indexes) {
      await client.execute(idx)
    }
    console.log(`  ✓ ${table.indexes.length} indexes created`)
  }

  console.log(`\nDone. Added ${added} columns, ${newTables.length} tables.`)
  client.close()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
