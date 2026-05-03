import { NextResponse } from 'next/server'
import { invalidateApprovedCoverMapCache } from '@/lib/approved-cover-map'
import {
  registerCoverAliasIfDiskMismatch,
  registerCoverAliasIfQueueNameDiffersFromCanonical,
} from '@/lib/cover-alias-register'
import { resolveBillboardArtistAlbumForCover } from '@/lib/cover-billboard-canonical'
import {
  readCoverQueue,
  writeCoverQueue,
  type CoverQueueItem,
  type CoverQueueStatus,
} from '@/lib/cover-queue-store'

const SKIPPED_PLACEHOLDER_IMAGE = '/covers/_missing.jpg'

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  try {
    const bodyRaw = await req.json().catch(() => null)
    if (!bodyRaw || typeof bodyRaw !== 'object') {
      return NextResponse.json({ error: 'Expected JSON body.' }, { status: 400 })
    }
    const body = bodyRaw as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const statusRaw = typeof body.status === 'string' ? body.status.trim() : ''
    const imageRaw = typeof body.image === 'string' ? body.image.trim() : ''
    const visited = body.visited === true

    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

    const status: CoverQueueStatus | null =
      statusRaw === 'missing' ||
      statusRaw === 'pending' ||
      statusRaw === 'approved' ||
      statusRaw === 'skipped'
        ? statusRaw
        : null

    if (status == null && imageRaw === '' && !visited) {
      return NextResponse.json(
        { error: 'At least one of status, image, or visited must be provided.' },
        { status: 400 }
      )
    }

    if (imageRaw !== '' && !isHttpUrl(imageRaw)) {
      return NextResponse.json({ error: 'image must be a valid http(s) URL.' }, { status: 400 })
    }

    const rows = await readCoverQueue()
    const idx = rows.findIndex(r => r.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: 'No queue item found for id.' }, { status: 404 })
    }

    const existing = rows[idx] as CoverQueueItem
    const nextRow: CoverQueueItem = {
      ...existing,
      status: status ?? existing.status,
      image: imageRaw !== '' ? imageRaw : existing.image,
      visited: visited || existing.visited,
    }

    if (status === 'skipped' && (nextRow.image == null || nextRow.image.trim() === '')) {
      nextRow.image = SKIPPED_PLACEHOLDER_IMAGE
    }

    const next = [...rows]
    next[idx] = nextRow
    await writeCoverQueue(next)
    invalidateApprovedCoverMapCache()

    if (nextRow.status === 'approved') {
      try {
        await registerCoverAliasIfDiskMismatch(nextRow)
        const canon = await resolveBillboardArtistAlbumForCover(nextRow.artist, nextRow.album)
        await registerCoverAliasIfQueueNameDiffersFromCanonical(nextRow, canon.artist, canon.album)
      } catch {
        /* non-fatal: alias file or disk scan */
      }
    }

    return NextResponse.json({ ok: true, item: nextRow })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

