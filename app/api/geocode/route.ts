import { NextResponse } from 'next/server'

// In-memory cache to avoid hammering Nominatim
const geocodeCache = new Map<string, { lat: number; lon: number } | null>()

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const country = searchParams.get('country')

  if (!city) {
    return NextResponse.json({ error: 'city parameter required' }, { status: 400 })
  }

  const cacheKey = `${city}|${country || ''}`
  if (geocodeCache.has(cacheKey)) {
    const cached = geocodeCache.get(cacheKey)
    return NextResponse.json(cached ? { lat: cached.lat, lon: cached.lon } : { lat: null, lon: null })
  }

  try {
    const query = country ? `${city}, ${country}` : city
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'IronEchelon/1.0 (defense-tech-intelligence)',
      },
      next: { revalidate: 86400 }, // Cache 24 hours
    })

    if (!res.ok) {
      geocodeCache.set(cacheKey, null)
      return NextResponse.json({ lat: null, lon: null })
    }

    const data = await res.json()

    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
      geocodeCache.set(cacheKey, result)
      return NextResponse.json(result)
    }

    geocodeCache.set(cacheKey, null)
    return NextResponse.json({ lat: null, lon: null })
  } catch {
    return NextResponse.json({ lat: null, lon: null })
  }
}
