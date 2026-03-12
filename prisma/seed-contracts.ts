import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: 'file:dev.db' })
const prisma = new PrismaClient({ adapter })

// Top defense/surveillance companies to search on USAspending
const SEARCH_COMPANIES = [
  'Palantir',
  'Anduril',
  'L3Harris',
  'Raytheon',
  'Northrop Grumman',
  'Lockheed Martin',
  'BAE Systems',
  'General Dynamics',
  'Boeing',
  'Leidos',
  'SAIC',
  'Booz Allen Hamilton',
  'ManTech',
  'CACI International',
  'Perspecta',
  'Accenture Federal',
  'Amazon Web Services',
  'Microsoft',
  'Google',
  'Oracle',
  'IBM',
  'Thales',
  'Elbit Systems',
  'Cellebrite',
  'Shield AI',
  'Skydio',
  'Dataminr',
  'Clearview AI',
  'Babel Street',
]

interface USASpendingResult {
  'Award ID': string
  'Recipient Name': string
  'Award Amount': number
  'Awarding Agency': string
  'Awarding Sub Agency': string
  'Start Date': string
  'End Date': string
  'Award Type': string
  Description: string
}

async function searchContracts(keyword: string): Promise<USASpendingResult[]> {
  try {
    const res = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: {
          keywords: [keyword],
          award_type_codes: ['A', 'B', 'C', 'D'], // Contract types
          time_period: [{ start_date: '2020-01-01', end_date: '2026-12-31' }],
        },
        fields: [
          'Award ID',
          'Recipient Name',
          'Award Amount',
          'Awarding Agency',
          'Awarding Sub Agency',
          'Start Date',
          'End Date',
          'Award Type',
          'Description',
        ],
        limit: 20,
        page: 1,
        sort: 'Award Amount',
        order: 'desc',
      }),
    })

    if (!res.ok) {
      console.error(`  USAspending API error for "${keyword}": ${res.status}`)
      return []
    }

    const data = await res.json()
    return data.results || []
  } catch (err) {
    console.error(`  Failed to fetch contracts for "${keyword}":`, err)
    return []
  }
}

async function findOrCreateAgency(agencyName: string): Promise<string | null> {
  if (!agencyName) return null

  const slug = agencyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  const existing = await prisma.entity.findUnique({ where: { slug } })
  if (existing) return existing.id

  const entity = await prisma.entity.create({
    data: {
      name: agencyName,
      slug,
      type: 'GOVERNMENT',
      description: `U.S. federal agency: ${agencyName}`,
    },
  })
  return entity.id
}

async function main() {
  console.log('🔍 Fetching government contracts from USAspending.gov...\n')

  let totalContracts = 0
  let totalValue = 0

  for (const companyName of SEARCH_COMPANIES) {
    // Find matching entity in our DB
    const entity = await prisma.entity.findFirst({
      where: {
        OR: [
          { name: { contains: companyName } },
          { slug: { contains: companyName.toLowerCase().replace(/\s+/g, '-') } },
        ],
      },
    })

    if (!entity) {
      console.log(`⚠ No entity found for "${companyName}" — skipping`)
      continue
    }

    console.log(`📡 Searching USAspending for: ${entity.name}...`)

    const results = await searchContracts(companyName)
    let added = 0

    for (const award of results) {
      if (!award['Award ID']) continue

      // Skip if already exists
      const existing = await prisma.contract.findUnique({
        where: { awardId: award['Award ID'] },
      })
      if (existing) continue

      // Find or create agency
      const agencyName = award['Awarding Sub Agency'] || award['Awarding Agency']
      const agencyId = await findOrCreateAgency(agencyName)

      await prisma.contract.create({
        data: {
          awardId: award['Award ID'],
          entityId: entity.id,
          agencyId,
          description: award['Description'] || null,
          value: award['Award Amount'] || null,
          awardDate: award['Start Date'] ? new Date(award['Start Date']) : null,
          endDate: award['End Date'] ? new Date(award['End Date']) : null,
          sources: JSON.stringify([
            {
              url: `https://www.usaspending.gov/award/${award['Award ID']}`,
              title: `USAspending Award ${award['Award ID']}`,
              domain: 'usaspending.gov',
            },
          ]),
        },
      })

      added++
      totalValue += award['Award Amount'] || 0
    }

    totalContracts += added
    console.log(`  ✓ Added ${added} contracts for ${entity.name}`)

    // Rate limiting
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log(`\n✅ Done! Added ${totalContracts} contracts worth $${(totalValue / 1e6).toFixed(1)}M`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
