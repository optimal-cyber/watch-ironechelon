import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createReadStream, existsSync, createWriteStream } from 'fs'
import { Readable } from 'stream'
import { createInterface } from 'readline'
import { pipeline } from 'stream/promises'

const url = process.env.TURSO_DATABASE_URL || 'file:dev.db'
const authToken = process.env.TURSO_AUTH_TOKEN
const adapter = new PrismaLibSql({ url, ...(authToken ? { authToken } : {}) })
const prisma = new PrismaClient({ adapter })

const CSV_URL = 'https://data.www.sbir.gov/awarddatapublic/award_data.csv'
const CSV_PATH = '/tmp/sbir_award_data.csv'

// Companies to search for — uses regex patterns for word-boundary matching
const SEARCH_TERMS: { patterns: RegExp[]; entitySlugHints: string[] }[] = [
  { patterns: [/^palantir/i], entitySlugHints: ['palantir'] },
  { patterns: [/^anduril/i], entitySlugHints: ['anduril'] },
  { patterns: [/^l3harris/i, /^l3 harris/i], entitySlugHints: ['l3harris', 'l3-harris'] },
  { patterns: [/^raytheon/i], entitySlugHints: ['raytheon'] },
  { patterns: [/^northrop grumman/i], entitySlugHints: ['northrop'] },
  { patterns: [/^lockheed martin/i], entitySlugHints: ['lockheed'] },
  { patterns: [/^bae systems/i], entitySlugHints: ['bae'] },
  { patterns: [/^general dynamics/i], entitySlugHints: ['general-dynamics'] },
  { patterns: [/^boeing/i], entitySlugHints: ['boeing'] },
  { patterns: [/^leidos/i], entitySlugHints: ['leidos'] },
  { patterns: [/^saic\b/i, /^science applications/i], entitySlugHints: ['saic'] },
  { patterns: [/^booz allen/i], entitySlugHints: ['booz-allen'] },
  { patterns: [/^mantech/i], entitySlugHints: ['mantech'] },
  { patterns: [/^caci\b/i], entitySlugHints: ['caci'] },
  { patterns: [/^shield ai/i], entitySlugHints: ['shield-ai'] },
  { patterns: [/^skydio/i], entitySlugHints: ['skydio'] },
  { patterns: [/^dataminr/i], entitySlugHints: ['dataminr'] },
  { patterns: [/^clearview/i], entitySlugHints: ['clearview'] },
  { patterns: [/^babel street/i], entitySlugHints: ['babel'] },
  { patterns: [/^cellebrite/i], entitySlugHints: ['cellebrite'] },
]

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

async function downloadCSV(): Promise<void> {
  if (existsSync(CSV_PATH)) {
    console.log('Using cached SBIR CSV...')
    return
  }

  console.log('Downloading SBIR award data CSV (~350MB)...')
  console.log('This may take a few minutes.\n')

  const res = await fetch(CSV_URL)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download CSV: ${res.status}`)
  }

  const writer = createWriteStream(CSV_PATH)
  // @ts-expect-error Node fetch body is web ReadableStream
  await pipeline(Readable.fromWeb(res.body), writer)
  console.log('Download complete.\n')
}

async function findOrCreateAgency(agencyName: string): Promise<string | null> {
  if (!agencyName) return null
  const slug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
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

// Cache entity lookups
const entityCache = new Map<string, string | null>()

async function findEntity(slugHints: string[]): Promise<string | null> {
  const cacheKey = slugHints.join('|')
  if (entityCache.has(cacheKey)) return entityCache.get(cacheKey)!

  for (const hint of slugHints) {
    const entity = await prisma.entity.findFirst({
      where: {
        OR: [
          { slug: { contains: hint } },
          { name: { contains: hint } },
        ],
      },
    })
    if (entity) {
      entityCache.set(cacheKey, entity.id)
      return entity.id
    }
  }
  entityCache.set(cacheKey, null)
  return null
}

async function main() {
  console.log('SBIR/STTR Award Importer\n')

  await downloadCSV()

  // Build matchers
  const companyMatchers = SEARCH_TERMS

  console.log('Scanning CSV for tracked defense companies...\n')

  const rl = createInterface({
    input: createReadStream(CSV_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  let headers: string[] = []
  let lineNum = 0
  let matched = 0
  let added = 0
  let skipped = 0

  // Batch awards by entity
  const awardsByEntity = new Map<string, { entityId: string; companyName: string; awards: Record<string, string>[] }>()

  // Handle multiline CSV fields (abstracts can contain newlines)
  let pendingLine = ''
  let inMultiline = false

  for await (const rawLine of rl) {
    lineNum++

    let line: string
    if (inMultiline) {
      pendingLine += '\n' + rawLine
      // Count quotes — if odd, we're still in a multiline field
      const quoteCount = (pendingLine.match(/"/g) || []).length
      if (quoteCount % 2 !== 0) continue // still incomplete
      line = pendingLine
      inMultiline = false
      pendingLine = ''
    } else {
      // Check if this line has unbalanced quotes (start of multiline field)
      const quoteCount = (rawLine.match(/"/g) || []).length
      if (quoteCount % 2 !== 0) {
        pendingLine = rawLine
        inMultiline = true
        continue
      }
      line = rawLine
    }

    if (lineNum === 1 && headers.length === 0) {
      headers = parseCSVLine(line).map((h) => h.replace(/"/g, ''))
      continue
    }

    const fields = parseCSVLine(line)
    // Validate: must have enough fields and Program should be SBIR or STTR
    if (fields.length < 10) continue
    const program = fields[5]?.trim()
    if (program !== 'SBIR' && program !== 'STTR') continue

    const companyName = fields[0]?.toLowerCase() || ''

    // Check if this company matches any of our search patterns
    const match = companyMatchers.find((m) => m.patterns.some((p) => p.test(companyName)))
    if (!match) continue

    matched++

    // Build record
    const record: Record<string, string> = {}
    for (let i = 0; i < headers.length && i < fields.length; i++) {
      record[headers[i]] = fields[i]
    }

    const key = match.entitySlugHints.join('|')
    if (!awardsByEntity.has(key)) {
      awardsByEntity.set(key, { entityId: '', companyName: fields[0], awards: [] })
    }
    awardsByEntity.get(key)!.awards.push(record)
  }

  console.log(`Found ${matched} matching awards across ${awardsByEntity.size} companies.\n`)

  // Process each company
  for (const [key, data] of awardsByEntity) {
    const match = SEARCH_TERMS.find((s) => s.entitySlugHints.join('|') === key)
    if (!match) continue

    const entityId = await findEntity(match.entitySlugHints)
    if (!entityId) {
      console.log(`  No entity in DB for "${data.companyName}" — skipping ${data.awards.length} awards`)
      continue
    }

    let companyAdded = 0

    for (const award of data.awards) {
      const contractNum = award['Contract']?.trim()
      const topicCode = award['Topic Code']?.trim()
      const awardYear = parseInt(award['Award Year']) || null

      const awardId = contractNum
        ? `SBIR-${contractNum}`
        : `SBIR-${award['Agency'] || 'UNK'}-${awardYear || '0'}-${topicCode || 'NA'}-${entityId.slice(0, 8)}-${companyAdded}`

      const existing = await prisma.contract.findUnique({ where: { awardId } })
      if (existing) {
        skipped++
        continue
      }

      const agencyName = award['Branch']?.trim() || award['Agency']?.trim()
      const agencyId = await findOrCreateAgency(agencyName || '')

      const rawAmount = award['Award Amount']?.replace(/[",]/g, '')
      const amount = rawAmount ? parseFloat(rawAmount) : null

      const parseDate = (s: string | undefined): Date | null => {
        if (!s?.trim()) return null
        const d = new Date(s.trim())
        return isNaN(d.getTime()) ? null : d
      }

      await prisma.contract.create({
        data: {
          awardId,
          entityId,
          agencyId,
          description: award['Award Title']?.trim() || null,
          value: amount && !isNaN(amount) ? amount : null,
          awardDate: parseDate(award['Proposal Award Date']),
          endDate: parseDate(award['Contract End Date']),
          sbirProgram: award['Program']?.trim() || 'SBIR',
          sbirPhase: award['Phase']?.replace('Phase ', '')?.trim() || null,
          sbirTopicCode: topicCode || null,
          sbirAgency: award['Agency']?.trim() || null,
          sbirBranch: award['Branch']?.trim() || null,
          sbirAwardYear: awardYear,
          sbirAbstract: award['Abstract']?.trim() || null,
          sbirKeywords: null,
          sbirPiName: award['PI Name']?.trim() || null,
          sources: JSON.stringify([{
            url: `https://www.sbir.gov/`,
            title: `SBIR Award: ${award['Award Title']?.trim()?.slice(0, 80) || awardId}`,
            domain: 'sbir.gov',
          }]),
        },
      })
      companyAdded++
    }

    added += companyAdded
    if (companyAdded > 0) {
      console.log(`  + ${companyAdded} awards for ${data.companyName} (${data.awards.length} total found, ${data.awards.length - companyAdded} already existed)`)
    } else if (data.awards.length > 0) {
      console.log(`  = ${data.companyName}: all ${data.awards.length} awards already imported`)
    }
  }

  console.log(`\nDone! Added ${added} SBIR/STTR awards. (${skipped} already existed)`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
