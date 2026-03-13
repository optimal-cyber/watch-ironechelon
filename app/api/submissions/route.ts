import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { submitterEmail, entityName, entityType, website, headquartersCountry, description, connectionInfo, sourceUrls } = body

    if (!entityName || !entityType || !description) {
      return NextResponse.json(
        { error: 'Entity name, type, and description are required' },
        { status: 400 }
      )
    }

    const submission = await prisma.submission.create({
      data: {
        submitterEmail: submitterEmail || null,
        entityName,
        entityType,
        website: website || null,
        headquartersCountry: headquartersCountry || null,
        description,
        connectionInfo: connectionInfo || null,
        sourceUrls: JSON.stringify(sourceUrls || []),
      },
    })

    return NextResponse.json({ success: true, id: submission.id })
  } catch (error) {
    console.error('[SUBMISSION] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create submission' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ submissions })
}
