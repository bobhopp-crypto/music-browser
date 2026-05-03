import { NextResponse } from 'next/server'
import { loadSectionForDate } from '@/lib/charts-week-server'
import { loadVideoCacheFromDisk } from '@/lib/video-cache-server'

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date')?.trim()
  if (!date) {
    return NextResponse.json({ error: 'Missing date' }, { status: 400 })
  }
  const videoCache = await loadVideoCacheFromDisk()
  const section = await loadSectionForDate(date, videoCache)
  if (!section) {
    return NextResponse.json({ error: 'No chart for that date' }, { status: 404 })
  }
  return NextResponse.json(section)
}
