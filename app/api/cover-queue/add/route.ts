import { NextResponse } from 'next/server'
import { upsertCoverQueueFocus } from '@/lib/cover-queue-focus'

export async function POST(req: Request) {
  try {
    const bodyRaw = await req.json().catch(() => null)
    if (!bodyRaw || typeof bodyRaw !== 'object') {
      return NextResponse.json({ error: 'Expected JSON body.' }, { status: 400 })
    }
    const body = bodyRaw as Record<string, unknown>
    const artist = typeof body.artist === 'string' ? body.artist.trim() : ''
    const album = typeof body.album === 'string' ? body.album.trim() : ''
    if (!artist || !album) {
      return NextResponse.json({ error: 'artist and album are required.' }, { status: 400 })
    }
    const item = await upsertCoverQueueFocus(artist, album)
    return NextResponse.json({ ok: true, item })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
