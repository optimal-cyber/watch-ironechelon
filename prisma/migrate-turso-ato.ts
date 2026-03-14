import 'dotenv/config'
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN')
  process.exit(1)
}

const client = createClient({ url, authToken })

const tables = [
  `CREATE TABLE IF NOT EXISTS FedrampAuthorization (
    id TEXT PRIMARY KEY,
    packageId TEXT NOT NULL UNIQUE,
    csoName TEXT NOT NULL,
    cspName TEXT NOT NULL,
    status TEXT NOT NULL,
    impactLevel TEXT,
    serviceModel TEXT NOT NULL DEFAULT '[]',
    deploymentModel TEXT,
    authorizationDate DATETIME,
    expirationDate DATETIME,
    sponsoringAgency TEXT,
    leveragingAgencies TEXT NOT NULL DEFAULT '[]',
    assessorName TEXT,
    authType TEXT,
    serviceDescription TEXT,
    website TEXT,
    logo TEXT,
    lastSynced DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS DodProvisionalAuth (
    id TEXT PRIMARY KEY,
    csoName TEXT NOT NULL,
    cspName TEXT NOT NULL,
    impactLevel TEXT NOT NULL,
    paDate DATETIME,
    paExpiration DATETIME,
    sponsorComponent TEXT,
    conditions TEXT,
    source TEXT NOT NULL DEFAULT 'seed',
    lastSynced DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS EmassAuthorization (
    id TEXT PRIMARY KEY,
    systemName TEXT NOT NULL,
    systemId TEXT,
    component TEXT NOT NULL,
    authorizationType TEXT NOT NULL,
    authorizationDate DATETIME,
    expirationDate DATETIME,
    impactLevel TEXT,
    authorizingOfficial TEXT,
    issm TEXT,
    isso TEXT,
    systemType TEXT,
    hostedLocation TEXT,
    cloudProvider TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    importBatchId TEXT,
    lastSynced DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS AtoCompany (
    id TEXT PRIMARY KEY,
    canonicalName TEXT NOT NULL UNIQUE,
    aliases TEXT NOT NULL DEFAULT '[]',
    cageCode TEXT,
    uei TEXT,
    website TEXT,
    sector TEXT,
    smallBusiness INTEGER NOT NULL DEFAULT 0,
    sbTypes TEXT NOT NULL DEFAULT '[]',
    totalActiveAuths INTEGER NOT NULL DEFAULT 0,
    authVelocity REAL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS AtoSyncLog (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL UNIQUE,
    lastSyncAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recordsAdded INTEGER NOT NULL DEFAULT 0,
    recordsUpdated INTEGER NOT NULL DEFAULT 0,
    recordsFailed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS FederalContract (
    id TEXT PRIMARY KEY,
    awardId TEXT NOT NULL UNIQUE,
    recipientName TEXT NOT NULL,
    recipientUei TEXT,
    awardingAgency TEXT,
    awardingSubAgency TEXT,
    awardAmount REAL,
    description TEXT,
    startDate DATETIME,
    endDate DATETIME,
    naicsCode TEXT,
    atoRelevanceScore INTEGER NOT NULL DEFAULT 0,
    lastSynced DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS AtoAlert (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
]

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_fedramp_status ON FedrampAuthorization(status)',
  'CREATE INDEX IF NOT EXISTS idx_fedramp_impact ON FedrampAuthorization(impactLevel)',
  'CREATE INDEX IF NOT EXISTS idx_fedramp_csp ON FedrampAuthorization(cspName)',
  'CREATE INDEX IF NOT EXISTS idx_fedramp_sponsor ON FedrampAuthorization(sponsoringAgency)',
  'CREATE INDEX IF NOT EXISTS idx_fedramp_expiry ON FedrampAuthorization(expirationDate)',
  'CREATE INDEX IF NOT EXISTS idx_dodpa_impact ON DodProvisionalAuth(impactLevel)',
  'CREATE INDEX IF NOT EXISTS idx_dodpa_csp ON DodProvisionalAuth(cspName)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_dodpa_unique ON DodProvisionalAuth(csoName, cspName, impactLevel)',
  'CREATE INDEX IF NOT EXISTS idx_emass_component ON EmassAuthorization(component)',
  'CREATE INDEX IF NOT EXISTS idx_emass_impact ON EmassAuthorization(impactLevel)',
  'CREATE INDEX IF NOT EXISTS idx_emass_expiry ON EmassAuthorization(expirationDate)',
  'CREATE INDEX IF NOT EXISTS idx_emass_authtype ON EmassAuthorization(authorizationType)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_emass_unique ON EmassAuthorization(systemName, component)',
  'CREATE INDEX IF NOT EXISTS idx_fedcontract_agency ON FederalContract(awardingAgency)',
  'CREATE INDEX IF NOT EXISTS idx_fedcontract_score ON FederalContract(atoRelevanceScore)',
  'CREATE INDEX IF NOT EXISTS idx_fedcontract_recipient ON FederalContract(recipientName)',
  'CREATE INDEX IF NOT EXISTS idx_alert_ack ON AtoAlert(acknowledged)',
  'CREATE INDEX IF NOT EXISTS idx_alert_type ON AtoAlert(type)',
]

async function migrate() {
  console.log(`Connecting to: ${url}`)

  for (const sql of tables) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1]
    try {
      await client.execute(sql)
      console.log(`  ✓ Table ${tableName} ready`)
    } catch (err) {
      console.error(`  ✗ Table ${tableName} failed:`, err)
    }
  }

  for (const sql of indexes) {
    const indexName = sql.match(/INDEX IF NOT EXISTS (\w+)/)?.[1]
    try {
      await client.execute(sql)
      console.log(`  ✓ Index ${indexName} ready`)
    } catch (err) {
      console.error(`  ✗ Index ${indexName} failed:`, err)
    }
  }

  console.log('\nDone.')
  client.close()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
