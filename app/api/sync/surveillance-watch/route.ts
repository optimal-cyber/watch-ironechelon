import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/lib/sync/sync-entities'

// Allow GET for cron job triggers (e.g., Vercel Cron, external cron services)
// Secured by an optional CRON_SECRET env var
export async function GET(request: NextRequest) {
  // Optional: verify cron secret for external triggers
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runFullSync()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[SYNC] Error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

// POST for manual triggers from the UI
export async function POST() {
  try {
    const result = await runFullSync()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[SYNC] Error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
