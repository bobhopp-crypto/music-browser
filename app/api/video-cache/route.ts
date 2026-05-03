import { NextResponse } from 'next/server'
import { getPlayCountMap } from '@/lib/vdj-play-count-map'
import { loadVideoCacheFromDisk } from '@/lib/video-cache-server'

export async function GET() {
  const videoCache = await loadVideoCacheFromDisk()
  return NextResponse.json({
    videoCache,
    playCountByKey: getPlayCountMap(),
  })
}
