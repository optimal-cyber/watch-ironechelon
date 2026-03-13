const BASE_URL = 'https://www.surveillancewatch.io/api/v1'

export interface SWCountry {
  id: string
  name: string
  alpha2: string
  latitude: number
  longitude: number
  slug: string
}

export interface SWEntityType {
  id: string
  name: string
  slug: string
}

export interface SWSource {
  url: string
  title: string
  id: string
}

export interface SWEntity {
  id: string
  name: string
  slug: string
  description: {
    root: {
      children: Array<{
        children: Array<{
          text?: string
          type: string
          children?: Array<{ text?: string; type: string }>
        }>
        type: string
      }>
    }
  } | null
  headquarters: {
    id: string
    name: string
    latitude: number
    longitude: number
    slug: string
  } | null
  headquartersCity: string | { id: string; name: string; country?: unknown } | null
  surveilling: Array<{
    id: string
    name: string
    latitude: number
    longitude: number
    slug: string
  }>
  providingTo: Array<{
    id: string
    name: string
    latitude: number
    longitude: number
    slug: string
  }>
  funders: Array<{
    id: string
    name: string
    slug: string
  }>
  types: SWEntityType[]
  sources: SWSource[]
  affiliations: string
  affiliationsList: Array<{ label: string; id: string }>
  subsidiaries: string
  domains: Array<{ domain: string; id: string }>
  marketInfo: Array<unknown>
  hasDirectTargets: boolean
  createdAt: string
  updatedAt: string
}

export interface SWFunder {
  id: string
  name: string
  slug: string
  description: {
    root: {
      children: Array<{
        children: Array<{ text?: string; type: string }>
        type: string
      }>
    }
  } | null
  headquarters: {
    id: string
    name: string
    latitude: number
    longitude: number
    slug: string
  } | null
  createdAt: string
  updatedAt: string
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 86400 }, // Cache for 24 hours
  })
  if (!res.ok) {
    throw new Error(`SW API error: ${res.status} ${res.statusText} for ${path}`)
  }
  const data = await res.json()
  // SW API wraps responses in { items: [...] }
  return data.items ?? data
}

export async function fetchEntities(): Promise<SWEntity[]> {
  return fetchJSON<SWEntity[]>('/entities')
}

export async function fetchCountries(): Promise<SWCountry[]> {
  return fetchJSON<SWCountry[]>('/countries')
}

export async function fetchEntityTypes(): Promise<SWEntityType[]> {
  return fetchJSON<SWEntityType[]>('/entity-types')
}

export async function fetchFunders(): Promise<SWFunder[]> {
  return fetchJSON<SWFunder[]>('/funders')
}

// Extract plain text from Lexical rich text
export function extractTextFromLexical(description: SWEntity['description']): string {
  if (!description?.root?.children) return ''

  const texts: string[] = []
  function walk(nodes: Array<{ text?: string; type: string; children?: unknown[] }>) {
    for (const node of nodes) {
      if (node.text) {
        texts.push(node.text)
      }
      if (node.children && Array.isArray(node.children)) {
        walk(node.children as Array<{ text?: string; type: string; children?: unknown[] }>)
      }
    }
  }
  walk(description.root.children as Array<{ text?: string; type: string; children?: unknown[] }>)
  return texts.join(' ').trim()
}
