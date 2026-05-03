import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { invalidateApprovedCoverMapCache } from '@/lib/approved-cover-map'
import { resolveBillboardArtistAlbumForCover } from '@/lib/cover-billboard-canonical'
import { expectedCoverFilename } from '@/lib/cover-filename'
import { getCoverSlug } from '@/lib/cover-slug'
import {
  isAllowedCoverFilename,
  looksLikeRasterImage,
  MAX_COVER_FILE_BYTES,
} from '@/lib/cover-file-validation'
import { readCoverQueue, writeCoverQueue, type CoverQueueItem } from '@/lib/cover-queue-store'
import { invalidateCoverListingCache } from '@/lib/resolve-album-cover'

const ADMIN_PIN = '6324'
const COVERS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'covers')
const RETROVERSE_PATH = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'data', 'RETROVERSE_ALBUMS.json')

type MasterRow = {
  artist?: unknown
  album?: unknown
  cover_path?: unknown
  [key: string]: unknown
}

function inferRasterContentType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return 'image/png'
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return 'image/webp'
  return null
}

function normKey(s: string): string {
  return s.trim().toLowerCase()
}

export async function POST(req: Request) {
  try {
    const bodyRaw = await req.json().catch(() => null)
    if (!bodyRaw || typeof bodyRaw !== 'object') {
      return NextResponse.json({ error: 'Expected JSON body.' }, { status: 400 })
    }
    const pin =
      typeof (bodyRaw as Record<string, unknown>).pin === 'string'
        ? ((bodyRaw as Record<string, unknown>).pin as string).trim()
        : ''
    if (pin !== ADMIN_PIN) {
      return NextResponse.json({ error: 'Invalid PIN.' }, { status: 403 })
    }

    const rows = await readCoverQueue()
    const approved = rows.filter(r => r.status === 'approved' && r.image != null && r.image !== '')
    if (approved.length === 0) {
      return NextResponse.json({ ok: true, saved: 0, message: 'No approved items with image.' })
    }

    let masterRows: MasterRow[] | null = null
    try {
      const rawMaster = await readFile(RETROVERSE_PATH, 'utf8')
      const parsed = JSON.parse(rawMaster) as unknown
      masterRows = Array.isArray(parsed) ? (parsed as MasterRow[]) : null
    } catch {
      masterRows = null
    }

    const errors: string[] = []
    const savedIds: string[] = []

    for (const row of approved) {
      try {
        const src = row.image as string
        // On-disk basename MUST match {@link resolveAlbumCover} / `getCoverSlug` (Billboard master),
        // not queue/scrape labels. Source URL path is never used for the filename.
        const { artist: billboardArtist, album: billboardAlbum } =
          await resolveBillboardArtistAlbumForCover(row.artist, row.album)
        const filename = expectedCoverFilename(billboardArtist, billboardAlbum)
        if (!isAllowedCoverFilename(filename)) {
          throw new Error(`Invalid filename: ${billboardArtist} - ${billboardAlbum}`)
        }
        const slug = getCoverSlug(billboardArtist, billboardAlbum)
        const res = await fetch(src, {
          redirect: 'follow',
          headers: {
            Accept: 'image/*,*/*;q=0.8',
            'User-Agent': 'RetroverseCoverQueueSubmit/1.0',
          },
        })
        if (!res.ok) {
          throw new Error(`Fetch ${String(res.status)}: ${billboardArtist} - ${billboardAlbum}`)
        }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > MAX_COVER_FILE_BYTES) {
          throw new Error(`Image too large: ${billboardArtist} - ${billboardAlbum}`)
        }
        if (!looksLikeRasterImage(buf) || inferRasterContentType(buf) == null) {
          throw new Error(`Not a JPEG/PNG/WebP: ${billboardArtist} - ${billboardAlbum}`)
        }
        const dest = path.join(COVERS_DIR, filename)
        await writeFile(dest, buf)
        console.log('DOWNLOADED:', slug)
        console.log('SAVED:', dest)

        const publicHref = `/covers/${filename}`
        const ra = normKey(billboardArtist)
        const rb = normKey(billboardAlbum)
        if (masterRows) {
          for (const m of masterRows) {
            const ma = typeof m.artist === 'string' ? normKey(m.artist) : ''
            const mb = typeof m.album === 'string' ? normKey(m.album) : ''
            if (ma === ra && mb === rb) {
              m.cover_path = publicHref
              break
            }
          }
        }
        savedIds.push(row.id)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    if (savedIds.length > 0) {
      const savedSet = new Set(savedIds)
      const nextQueue: CoverQueueItem[] = rows.filter(
        r => !(r.status === 'approved' && savedSet.has(r.id))
      )
      await writeCoverQueue(nextQueue)
    }

    if (masterRows != null && savedIds.length > 0) {
      await writeFile(RETROVERSE_PATH, `${JSON.stringify(masterRows, null, 2)}\n`, 'utf8')
    }

    invalidateCoverListingCache()
    invalidateApprovedCoverMapCache()
    const saved = savedIds.length
    return NextResponse.json({
      ok: true,
      saved,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
