import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const type = sp.get('type')

    const where: Record<string, unknown> = {
      acknowledged: false,
    }

    if (type) {
      where.type = type
    }

    const alerts = await prisma.atoAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ alerts, total: alerts.length })
  } catch (error) {
    console.error('[ATO] Error fetching alerts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Alert id is required' },
        { status: 400 }
      )
    }

    const alert = await prisma.atoAlert.update({
      where: { id },
      data: { acknowledged: true },
    })

    return NextResponse.json({ alert })
  } catch (error) {
    console.error('[ATO] Error acknowledging alert:', error)
    return NextResponse.json(
      { error: 'Failed to acknowledge alert' },
      { status: 500 }
    )
  }
}
