import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

type DatasetId = 'weekly_full' | 'albums' | 'video_cache' | 'retroverse_master'
type DatasetRecord = Record<string, unknown>

type WeeklyEntry = {
  rank?: number
  title?: string
  artist?: string
}

let cachedSystemSummary:
  | {
      totalYears: number
      totalWeeks: number
      totalEntries: number
      uniqueSongsLabel: string
    }
  | null = null

const DATASETS: Record<Exclude<DatasetId, 'weekly_full'>, string> = {
  albums: 'albums_master.json',
  video_cache: 'video_cache.json',
  retroverse_master: 'retroverse_master.json',
}

const isFilled = (value: unknown) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

function toDatasetRecords(data: unknown): DatasetRecord[] {
  if (Array.isArray(data)) {
    return data.slice(0, 100).filter(item => typeof item === 'object' && item !== null) as DatasetRecord[]
  }
  if (typeof data === 'object' && data !== null) {
    const objectData = data as Record<string, unknown>
    for (const value of Object.values(objectData)) {
      if (Array.isArray(value)) {
        return value
          .slice(0, 100)
          .filter(item => typeof item === 'object' && item !== null) as DatasetRecord[]
      }
    }
    return [objectData]
  }
  return []
}

function computeFieldFillRates(records: DatasetRecord[]) {
  const fields = Array.from(new Set(records.flatMap(record => Object.keys(record))))
  return fields.map(field => {
    const filledCount = records.filter(record => isFilled(record[field])).length
    return {
      field,
      fillRate: records.length === 0 ? 0 : Math.round((filledCount / records.length) * 100),
    }
  })
}

function toSampleRows(records: DatasetRecord[]) {
  return records.slice(0, 3).map((record, index) => ({
    rank: typeof record.rank === 'number' ? record.rank : index + 1,
    title: typeof record.title === 'string' ? record.title : 'N/A',
    artist: typeof record.artist === 'string' ? record.artist : 'N/A',
  }))
}

async function getWeeklyInspection(chartsDir: string, requestedFile?: string) {
  const yearFiles = (await readdir(chartsDir))
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => Number(b.replace('.json', '')) - Number(a.replace('.json', '')))

  const selectedFile = yearFiles.includes(requestedFile ?? '') ? requestedFile : yearFiles[0]
  if (!selectedFile) {
    return {
      files: [] as string[],
      inspectedFile: 'No file available',
      recordsInspected: 0,
      fields: [] as Array<{ field: string; fillRate: number }>,
      sampleRows: [] as Array<{ rank: number; title: string; artist: string }>,
    }
  }

  const filePath = path.join(chartsDir, selectedFile)
  const raw = await readFile(/* turbopackIgnore: true */ filePath, 'utf8')
  const weeks = JSON.parse(raw) as Array<{ entries?: WeeklyEntry[] }>

  const records: DatasetRecord[] = []
  for (const week of weeks) {
    const entries = week.entries ?? []
    for (const entry of entries) {
      records.push(entry as DatasetRecord)
      if (records.length >= 100) break
    }
    if (records.length >= 100) break
  }

  return {
    files: yearFiles,
    inspectedFile: selectedFile,
    recordsInspected: records.length,
    fields: computeFieldFillRates(records),
    sampleRows: toSampleRows(records),
  }
}

async function getJsonInspection(dataDir: string, dataset: Exclude<DatasetId, 'weekly_full'>) {
  const relativePath = DATASETS[dataset]
  const filePath = path.join(/* turbopackIgnore: true */ dataDir, relativePath)
  if (!(await pathExists(filePath))) {
    return {
      files: [] as string[],
      inspectedFile: `${relativePath} (not found)`,
      recordsInspected: 0,
      fields: [] as Array<{ field: string; fillRate: number }>,
      sampleRows: [] as Array<{ rank: number; title: string; artist: string }>,
    }
  }

  const raw = await readFile(/* turbopackIgnore: true */ filePath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  const records = toDatasetRecords(parsed)

  return {
    files: [path.basename(relativePath)],
    inspectedFile: relativePath,
    recordsInspected: records.length,
    fields: computeFieldFillRates(records),
    sampleRows: toSampleRows(records),
  }
}

async function getSystemSummary(chartsDir: string) {
  if (cachedSystemSummary) return cachedSystemSummary

  const yearFiles = (await readdir(chartsDir)).filter(file => file.endsWith('.json'))
  const totalYears = yearFiles.length

  const weekCounts = await Promise.all(
    yearFiles.map(async file => {
      const filePath = path.join(chartsDir, file)
      const raw = await readFile(/* turbopackIgnore: true */ filePath, 'utf8')
      const weeks = JSON.parse(raw) as unknown[]
      return weeks.length
    })
  )

  const totalWeeks = weekCounts.reduce((sum, count) => sum + count, 0)
  cachedSystemSummary = {
    totalYears,
    totalWeeks,
    totalEntries: totalWeeks * 100,
    uniqueSongsLabel: 'skipped for now (lightweight mode)',
  }
  return cachedSystemSummary
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const datasetParam = (searchParams.get('dataset') ?? 'weekly_full') as DatasetId
  const requestedFile = searchParams.get('file') ?? undefined

  const dataset: DatasetId = ['weekly_full', 'albums', 'video_cache', 'retroverse_master'].includes(datasetParam)
    ? datasetParam
    : 'weekly_full'

  const dataDir = path.join(/* turbopackIgnore: true */ process.cwd(), 'public/data')
  const chartsDir = path.join(dataDir, 'charts/weekly_full')

  const system = await getSystemSummary(chartsDir)

  const inspection =
    dataset === 'weekly_full'
      ? await getWeeklyInspection(chartsDir, requestedFile)
      : await getJsonInspection(dataDir, dataset)

  return NextResponse.json({
    system,
    dataset,
    files: inspection.files,
    selectedFile: dataset === 'weekly_full' ? inspection.inspectedFile : '',
    inspection: {
      fileName: inspection.inspectedFile,
      recordsInspected: inspection.recordsInspected,
      fields: inspection.fields,
      sampleRows: inspection.sampleRows,
    },
  })
}
