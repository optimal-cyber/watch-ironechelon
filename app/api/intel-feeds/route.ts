import { NextResponse } from 'next/server'

interface FeedSource {
  name: string
  url: string
  category: 'CYBER' | 'DEFENSE' | 'OSINT' | 'SURVEILLANCE' | 'POLICY'
}

interface FeedItem {
  title: string
  link: string
  pubDate: string
  source: string
  category: string
  description: string
}

const FEEDS: FeedSource[] = [
  // Cybersecurity
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'CYBER' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'CYBER' },
  { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/', category: 'CYBER' },
  { name: 'Naked Security', url: 'https://nakedsecurity.sophos.com/feed/', category: 'CYBER' },
  // Defense
  { name: 'Defense One', url: 'https://www.defenseone.com/rss/technology/', category: 'DEFENSE' },
  { name: 'Breaking Defense', url: 'https://breakingdefense.com/feed/', category: 'DEFENSE' },
  // OSINT
  { name: 'Bellingcat', url: 'https://www.bellingcat.com/feed/', category: 'OSINT' },
  // Surveillance & Privacy
  { name: 'EFF Deeplinks', url: 'https://www.eff.org/rss/updates.xml', category: 'SURVEILLANCE' },
  { name: 'The Intercept', url: 'https://theintercept.com/feed/?rss', category: 'SURVEILLANCE' },
  // Policy
  { name: 'Lawfare', url: 'https://www.lawfaremedia.org/feed', category: 'POLICY' },
]

function parseRSSItems(xml: string, source: string, category: string): FeedItem[] {
  const items: FeedItem[] = []

  // Parse RSS <item> elements
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]

    const title = extractTag(itemXml, 'title')
    const link = extractTag(itemXml, 'link') || extractAtomLink(itemXml)
    const pubDate = extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'published') || extractTag(itemXml, 'updated') || ''
    const description = extractTag(itemXml, 'description') || extractTag(itemXml, 'summary') || ''

    if (title && link) {
      items.push({
        title: cleanHtml(title),
        link: cleanHtml(link).trim(),
        pubDate,
        source,
        category,
        description: cleanHtml(description).slice(0, 200),
      })
    }
  }

  // Also try Atom <entry> elements
  const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1]

    const title = extractTag(entryXml, 'title')
    const link = extractAtomLink(entryXml) || extractTag(entryXml, 'link')
    const pubDate = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated') || ''
    const description = extractTag(entryXml, 'summary') || extractTag(entryXml, 'content') || ''

    if (title && link) {
      items.push({
        title: cleanHtml(title),
        link: cleanHtml(link).trim(),
        pubDate,
        source,
        category,
        description: cleanHtml(description).slice(0, 200),
      })
    }
  }

  return items.slice(0, 10) // Max 10 per feed
}

function extractTag(xml: string, tag: string): string {
  // Try CDATA first
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i')
  const cdataMatch = xml.match(cdataRegex)
  if (cdataMatch) return cdataMatch[1]

  // Regular tag
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1] : ''
}

function extractAtomLink(xml: string): string {
  const match = xml.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)
  return match ? match[1] : ''
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

export async function GET() {
  const results: FeedItem[] = []

  const feedPromises = FEEDS.map(async (feed) => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(feed.url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'IronEchelon/1.0 RSS Reader' },
        next: { revalidate: 900 }, // Cache 15 min
      })
      clearTimeout(timeout)

      if (!res.ok) return []

      const xml = await res.text()
      return parseRSSItems(xml, feed.name, feed.category)
    } catch {
      return []
    }
  })

  const feedResults = await Promise.allSettled(feedPromises)
  for (const result of feedResults) {
    if (result.status === 'fulfilled') {
      results.push(...result.value)
    }
  }

  // Sort by date (newest first)
  results.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime() || 0
    const dateB = new Date(b.pubDate).getTime() || 0
    return dateB - dateA
  })

  return NextResponse.json({
    items: results,
    sources: FEEDS.map((f) => ({ name: f.name, category: f.category })),
    fetchedAt: new Date().toISOString(),
  })
}
