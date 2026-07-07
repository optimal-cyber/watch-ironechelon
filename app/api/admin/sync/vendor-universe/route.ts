import { NextRequest, NextResponse } from 'next/server'
import { seedVendorUniverse } from '@/lib/ingest/vendor-universe'

/**
 * Admin-triggered vendor-universe seed. Creates an Entity for every FedRAMP CSP
 * so the vendor directory + dossiers cover the full authorized-cloud cohort.
 * Guarded by SYNC_API_KEY (skipped when unset, for local dev).
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.SYNC_API_KEY
  if (apiKey) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await seedVendorUniverse()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
