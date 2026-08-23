// GET  /api/sharing/cross-org — returns outgoing + incoming sharing requests
// POST /api/sharing/cross-org — create a share request or immediate grant
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireOrgContext, AuthError, authErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { serializeSharingRequest } from '@/lib/serialize'

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req)
    const [outgoing, incoming] = await Promise.all([
      db.sharingRequest.findMany({
        where: { organizationId, direction: 'outgoing' },
        include: { dataset: { select: { id: true, name: true } }, requester: { select: { id: true, name: true, email: true } }, decider: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }, take: 100,
      }),
      db.sharingRequest.findMany({
        where: { 
          OR: [
            { targetOrganizationId: organizationId },
            { targetUserId: user.id },
            { targetEmail: user.email }
          ]
        },
        include: { dataset: { select: { id: true, name: true } }, requester: { select: { id: true, name: true, email: true } }, decider: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }, take: 100,
      }),
    ])
    return NextResponse.json({ outgoing: outgoing.map(serializeSharingRequest), incoming: incoming.map(serializeSharingRequest) })
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgContext(req)
    const body = await req.json().catch(() => ({}))
    const direction = String(body?.direction ?? 'outgoing') as 'outgoing' | 'incoming'
    const shareType = String(body?.shareType ?? 'grant') as 'request' | 'grant'
    const datasetId = String(body?.datasetId ?? '').trim()
    const targetOrganizationId = String(body?.targetOrganizationId ?? '').trim() || null
    const targetEmail = String(body?.targetEmail ?? '').trim().toLowerCase() || null
    let targetUserId = String(body?.targetUserId ?? '').trim() || null
    const level = String(body?.level ?? 'read')
    const reason = String(body?.reason ?? '').trim() || null

    if (!datasetId && shareType === 'grant') return NextResponse.json({ error: 'datasetId is required' }, { status: 400 })
    if (!targetOrganizationId && !targetEmail && !targetUserId)
      return NextResponse.json({ error: 'targetOrganizationId or targetEmail is required' }, { status: 400 })

    if (targetEmail && !targetUserId) {
      const tu = await db.user.findUnique({ where: { email: targetEmail }, select: { id: true } })
      if (!tu) return NextResponse.json({ error: 'No registered user found with email ' + targetEmail }, { status: 404 })
      targetUserId = tu.id
    }

    if (datasetId) {
      const dataset = await db.dataset.findUnique({ where: { id: datasetId }, select: { id: true, organizationId: true } })
      if (!dataset) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
      if (shareType === 'grant' && dataset.organizationId !== organizationId)
        return NextResponse.json({ error: 'You can only grant access to your own datasets' }, { status: 403 })
    }

    if (targetOrganizationId) {
      const to = await db.organization.findUnique({ where: { id: targetOrganizationId }, select: { id: true } })
      if (!to) return NextResponse.json({ error: 'Target organization not found' }, { status: 404 })
    }

    const shareRequest = await db.sharingRequest.create({
      data: {
        organizationId, datasetId: datasetId || null, requestedBy: user.id,
        status: 'pending',
        level, reason, targetOrganizationId, targetUserId, targetEmail, direction, shareType,
      },
      include: { dataset: { select: { id: true, name: true } }, requester: { select: { id: true, name: true, email: true } } },
    })

    await logAudit({ organizationId, actorId: user.id, action: 'share', entity: 'dataset', entityId: datasetId || undefined, after: { direction, shareType, level, targetOrganizationId, targetUserId, targetEmail } })
    return NextResponse.json(serializeSharingRequest(shareRequest), { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}