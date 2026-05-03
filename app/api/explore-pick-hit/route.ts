import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import type { WeekRow } from '@/lib/charts-week-server'
import {
  buildVintagePickHits,
  PICK_HIT_YEAR_MAX,
  PICK_HIT_YEAR_MIN,
} from '@/lib/explore-pick-hit'

async function readYearWeeks(year: number): Promise<WeekRow[] | null> {
  const filePath = path.join(
    process.cwd(),
    'public',
    'data',
    'charts',
    'weekly_full',
    `${year}.json`
  )
  try {
    const raw = await readFile(filePath, 'utf8')
    const rows = JSON.parse(raw) as WeekRow[]
    if (!Array.isArray(rows) || rows.length === 0) return null
    return rows
  } catch {
    return null
  }
}

/** Five top-10 hits; each from a random year 1958–1989, random week, random slot. */
export async function GET() {
  try {
    const seedKey = `pick-hit-vintage-${new Date().toISOString().slice(0, 10)}`
    const items = await buildVintagePickHits(readYearWeeks, seedKey)

    if (!items.length) {
      return NextResponse.json(
        { error: 'Could not build pick-hit list from weekly data.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      yearMin: PICK_HIT_YEAR_MIN,
      yearMax: PICK_HIT_YEAR_MAX,
      items,
      seedKey,
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to build pick-hit list.' },
      { status: 500 }
    )
  }
}
