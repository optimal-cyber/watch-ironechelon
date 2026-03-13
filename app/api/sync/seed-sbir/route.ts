import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Focus on companies that actually win SBIR/STTR awards
// Large primes often manage SBIR Phase III production contracts too
const SEARCH_COMPANIES = [
  'Anduril', 'Shield AI', 'Skydio', 'Clearview AI', 'Dataminr',
  'Babel Street', 'Palantir', 'Cellebrite',
  'L3Harris', 'Leidos', 'SAIC', 'Booz Allen', 'CACI',
  'Raytheon', 'Northrop Grumman', 'Lockheed Martin', 'BAE Systems',
  'General Dynamics', 'Boeing', 'ManTech',
]

// Also search with "STTR" keyword separately
const KEYWORDS = ['SBIR', 'STTR']

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
  // Match "SBIR PHASE III", "SBIR PHASE 3", "SBIR PH III", "PHASE III SBIR", etc.
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

async function searchSbir(company: string, keyword: string): Promise<USASpendingResult[]> {
  try {
    const res = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: {
          keywords: [keyword],
          recipient_search_text: [company],
          time_period: [{ start_date: '2010-01-01', end_date: '2026-12-31' }],
          award_type_codes: ['A', 'B', 'C', 'D'],
        },
        fields: [
          'Award ID', 'Recipient Name', 'Award Amount',
          'Awarding Agency', 'Awarding Sub Agency',
          'Start Date', 'End Date', 'Description', 'Award Type',
        ],
        limit: 50,
        page: 1,
        sort: 'Award Amount',
        order: 'desc',
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.results || []
  } catch {
    return []
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

  const start = Date.now()
  let totalAdded = 0
  let totalValue = 0
  const log: string[] = []

  for (const companyName of SEARCH_COMPANIES) {
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

    // Search with both SBIR and STTR keywords
    for (const keyword of KEYWORDS) {
      const results = await searchSbir(companyName, keyword)

      for (const award of results) {
        if (!award['Award ID']) continue
        if (seenAwardIds.has(award['Award ID'])) continue
        seenAwardIds.add(award['Award ID'])

        // Verify the description actually mentions SBIR/STTR (filter false positives)
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
      await new Promise((r) => setTimeout(r, 250))
    }

    totalAdded += companyAdded
    if (companyAdded > 0) {
      log.push(`${entity.name}: +${companyAdded} SBIR/STTR awards`)
    }
  }

  return NextResponse.json({
    success: true,
    elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s`,
    totalAdded,
    totalValue,
    log,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
