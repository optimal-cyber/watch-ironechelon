import { NextRequest, NextResponse } from 'next/server'
import { loadFromFile, fetchFromGitHub, syncFedrampData } from '@/lib/ingest/fedramp'

const LOG_PREFIX = '[ATO-SYNC]'

export async function POST(request: NextRequest) {
  // Auth check
  const syncKey = process.env.SYNC_API_KEY
  if (syncKey) {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (token !== syncKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    let body: { filePath?: string } = {}
    try {
      body = await request.json()
    } catch {
      // No body or invalid JSON — that's fine, we'll use GitHub
    }

    let data: Awaited<ReturnType<typeof loadFromFile>>['data']
    let sourceLabel: string

    if (body.filePath) {
      console.log(`${LOG_PREFIX} Admin sync triggered with file: ${body.filePath}`)
      const result = await loadFromFile(body.filePath)
      data = result.data
      sourceLabel = result.sourceLabel
    } else {
      console.log(`${LOG_PREFIX} Admin sync triggered — fetching from GitHub`)
      const result = await fetchFromGitHub()
      data = result.data
      sourceLabel = result.sourceLabel
    }

    const summary = await syncFedrampData(data)

    return NextResponse.json({
      success: true,
      source: sourceLabel,
      ...summary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Sync failed:`, message)
    return NextResponse.json({ error: 'Sync failed', message }, { status: 500 })
  }
}
