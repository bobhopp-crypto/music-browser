import { NextRequest, NextResponse } from 'next/server'
import { loadAlbumChartRunWeeksForTrackKey } from '@/lib/album-chart-run-load'

export async function GET(req: NextRequest) {
  const track = req.nextUrl.searchParams.get('track')
  if (!track?.trim()) {
    return NextResponse.json({ weeks: [] as { chart_date: string; rank: number }[] })
  }
  try {
    const weeks = await loadAlbumChartRunWeeksForTrackKey(track)
    return NextResponse.json({ weeks })
  } catch {
    return NextResponse.json({ weeks: [] }, { status: 500 })
  }
}
