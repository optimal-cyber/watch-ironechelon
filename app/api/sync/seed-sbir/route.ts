import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Comprehensive list of defense/surveillance companies known for SBIR/STTR
const COMPANY_BATCHES: string[][] = [
  // Batch 0: High-profile defense tech startups
  [
    'Anduril', 'Shield AI', 'Skydio', 'Epirus', 'Scale AI',
    'SpaceX', 'Firestorm', 'Rebellion Defense', 'Hadean',
    'Vannevar Labs', 'Primer AI', 'Rhombus Power', 'Shift5',
    'Hawkeye 360', 'Capella Space', 'BlackSky', 'Planet Labs',
    'Babel Street', 'Clearview AI', 'Dataminr', 'Voyager Labs',
  ],
  // Batch 1: Defense primes & large contractors
  [
    'Palantir', 'L3Harris', 'Leidos', 'SAIC', 'Booz Allen',
    'CACI', 'Raytheon', 'RTX', 'Northrop Grumman', 'Lockheed Martin',
    'BAE Systems', 'General Dynamics', 'Boeing', 'ManTech',
    'Textron', 'Elbit Systems', 'Thales', 'Leonardo DRS',
    'Mercury Systems', 'Curtiss-Wright', 'Kratos',
  ],
  // Batch 2: Cyber, AI, and surveillance tech
  [
    'CrowdStrike', 'Palo Alto Networks', 'Fortinet', 'SentinelOne',
    'Recorded Future', 'Mandiant', 'FireEye', 'Tenable',
    'Rapid7', 'Varonis', 'Darktrace', 'Dragos',
    'Cellebrite', 'SS8 Networks', 'Verint', 'NICE Systems',
    'Cobham', 'Sierra Nevada', 'Dynetics', 'Aerojet Rocketdyne',
  ],
  // Batch 3: More defense/dual-use tech
  [
    'Saab', 'Hensoldt', 'Rafael', 'IAI', 'Cognizant',
    'Peraton', 'Parsons', 'KBR', 'Jacobs', 'Amentum',
    'V2X', 'Maxar', 'Ball Aerospace', 'Aerovironment',
    'Joby Aviation', 'Archer Aviation', 'Wisk', 'Relativity Space',
    'Rocket Lab', 'Hermeus', 'Hadrian', 'Fortem Technologies',
  ],
  // Batch 4: AI/ML and data companies
  [
    'C3 AI', 'BigBear AI', 'Alteryx', 'Databricks', 'Snowflake',
    'Elastic', 'Splunk', 'Confluent', 'Datadog',
    'Two Six Technologies', 'Torch', 'Applied Intuition',
    'Dedrone', 'DroneShield', 'Lilt', 'Govini',
    'Rebellion', 'Istari', 'Second Front', 'Dcode',
  ],
]

const ALL_COMPANIES = COMPANY_BATCHES.flat()
const KEYWORDS = ['SBIR', 'STTR']
const PAGES_PER_SEARCH = 3  // 3 pages × 100 results = up to 300 per company/keyword

interface USASpendingResult {
  'Award ID': string
  'Recipient Name': string
  'Award Amount': number
  'Awarding Agency': string
  'Awarding Sub Agency': string
  'Start Date': string
  'End Date': string
  'Description': string
  'Award Type': string
}

function parsePhase(description: string): string | null {
  if (!description) return null
  const upper = description.toUpperCase()
  if (/PHASE\s*(III|3)\b/.test(upper)) return 'III'
  if (/PHASE\s*(II|2)\b/.test(upper) && !/PHASE\s*(III|3)/.test(upper)) return 'II'
  if (/PHASE\s*(I|1)\b/.test(upper) && !/PHASE\s*(II|2|III|3)/.test(upper)) return 'I'
  return null
}

function parseProgram(description: string, keyword: string): string {
  if (!description) return keyword
  const upper = description.toUpperCase()
  if (upper.includes('STTR')) return 'STTR'
  return 'SBIR'
}

async function searchSbirPage(company: string, keyword: string, page: number): Promise<{ results: USASpendingResult[], hasMore: boolean }> {
  try {
    const res = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: {
          keywords: [keyword],
          recipient_search_text: [company],
          time_period: [{ start_date: '2005-01-01', end_date: '2026-12-31' }],
          award_type_codes: ['A', 'B', 'C', 'D'],
        },
        fields: [
          'Award ID', 'Recipient Name', 'Award Amount',
          'Awarding Agency', 'Awarding Sub Agency',
          'Start Date', 'End Date', 'Description', 'Award Type',
        ],
        limit: 100,
        page,
        sort: 'Award Amount',
        order: 'desc',
      }),
    })
    if (!res.ok) return { results: [], hasMore: false }
    const data = await res.json()
    return {
      results: data.results || [],
      hasMore: data.page_metadata?.hasNext ?? false,
    }
  } catch {
    return { results: [], hasMore: false }
  }
}

async function findOrCreateAgency(agencyName: string): Promise<string | null> {
  if (!agencyName) return null
  const slug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const existing = await prisma.entity.findUnique({ where: { slug } })
  if (existing) return existing.id
  const entity = await prisma.entity.create({
    data: { name: agencyName, slug, type: 'GOVERNMENT', description: `U.S. federal agency: ${agencyName}` },
  })
  return entity.id
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Support batching: ?batch=0 through ?batch=4, or omit for all
  const batchParam = request.nextUrl.searchParams.get('batch')
  let companies: string[]
  if (batchParam !== null) {
    const batchIdx = parseInt(batchParam)
    if (isNaN(batchIdx) || batchIdx < 0 || batchIdx >= COMPANY_BATCHES.length) {
      return NextResponse.json({ error: `Invalid batch. Use 0-${COMPANY_BATCHES.length - 1}` }, { status: 400 })
    }
    companies = COMPANY_BATCHES[batchIdx]
  } else {
    companies = ALL_COMPANIES
  }

  const start = Date.now()
  let totalAdded = 0
  let totalValue = 0
  const log: string[] = []

  for (const companyName of companies) {
    // Find matching entity in DB
    const entity = await prisma.entity.findFirst({
      where: {
        OR: [
          { name: { contains: companyName } },
          { slug: { contains: companyName.toLowerCase().replace(/\s+/g, '-') } },
        ],
      },
    })

    if (!entity) {
      log.push(`Skip: no entity for "${companyName}"`)
      continue
    }

    let companyAdded = 0
    const seenAwardIds = new Set<string>()

    for (const keyword of KEYWORDS) {
      for (let page = 1; page <= PAGES_PER_SEARCH; page++) {
        const { results, hasMore } = await searchSbirPage(companyName, keyword, page)

        for (const award of results) {
          if (!award['Award ID']) continue
          if (seenAwardIds.has(award['Award ID'])) continue
          seenAwardIds.add(award['Award ID'])

          // Verify the description actually mentions SBIR/STTR
          const desc = (award['Description'] || '').toUpperCase()
          if (!desc.includes('SBIR') && !desc.includes('STTR')) continue

          const awardId = `SBIR-USA-${award['Award ID']}`

          const existing = await prisma.contract.findUnique({ where: { awardId } })
          if (existing) continue

          const agencyName = award['Awarding Sub Agency'] || award['Awarding Agency']
          const agencyId = await findOrCreateAgency(agencyName)

          const awardDate = award['Start Date'] ? new Date(award['Start Date']) : null
          const endDate = award['End Date'] ? new Date(award['End Date']) : null
          const phase = parsePhase(award['Description'] || '')
          const program = parseProgram(award['Description'] || '', keyword)
          const year = awardDate && !isNaN(awardDate.getTime()) ? awardDate.getFullYear() : null

          await prisma.contract.create({
            data: {
              awardId,
              entityId: entity.id,
              agencyId,
              description: award['Description'] || null,
              value: award['Award Amount'] || null,
              awardDate: awardDate && !isNaN(awardDate.getTime()) ? awardDate : null,
              endDate: endDate && !isNaN(endDate.getTime()) ? endDate : null,
              sbirProgram: program,
              sbirPhase: phase,
              sbirAgency: award['Awarding Agency'] || null,
              sbirBranch: agencyName || null,
              sbirAwardYear: year,
              sources: JSON.stringify([{
                url: `https://www.usaspending.gov/award/${award['Award ID']}`,
                title: `${program} Award: ${(award['Description'] || '').slice(0, 80)}`,
                domain: 'usaspending.gov',
              }]),
            },
          })
          companyAdded++
          totalValue += award['Award Amount'] || 0
        }

        // Rate limit between API calls
        await new Promise((r) => setTimeout(r, 200))

        if (!hasMore) break
      }
    }

    totalAdded += companyAdded
    if (companyAdded > 0) {
      log.push(`${entity.name}: +${companyAdded} SBIR/STTR awards`)
    }
  }

  return NextResponse.json({
    success: true,
    elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s`,
    batch: batchParam !== null ? parseInt(batchParam) : 'all',
    totalBatches: COMPANY_BATCHES.length,
    companiesSearched: companies.length,
    totalAdded,
    totalValue,
    log,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
