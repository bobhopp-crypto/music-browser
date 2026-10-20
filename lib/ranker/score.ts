/** Hot 100 year-end scoring. Same math as the Ranking Lab prototype. */

export type WinMode = "cal" | "bb";

export type RankerSettings = {
  win: WinMode;
  full: boolean;
  pts: number;
  flash: number;
  no1: number;
  t10: number;
  wks: number;
  peak: number;
  maxw: number;
  t5: number;
  t20: number;
  t40: number;
};

export type RankerSong = {
  id: number;
  t: string;
  a: string;
  /** Contiguous on-chart runs: [startWeekIndex, rank, rank, ...]. */
  w: number[][];
};

export type OfficialEntry = [number, number | null, string, string];

export type RankerYearFile = {
  year: number;
  songs: RankerSong[];
  official: OfficialEntry[];
  rv: number[];
};

export type RankerIndex = {
  built: string;
  years: number[];
  weeks: string[];
  windows: Record<string, [string, string, "billboard" | "approx"]>;
};

export type WeekPoint = [number, number];

export type Candidate = {
  id: number;
  sorted: number[];
  peak: number;
  n1: number;
  n5: number;
  n10: number;
  n20: number;
  n40: number;
  weeks: number;
  debut: number;
  exit: number;
  climb: number;
  wk: WeekPoint[];
};

export type Ranked = { c: Candidate; s: number };

export type CompareResult = {
  t10: number;
  t100: number;
  rho: number;
  same1: boolean;
  n: number;
};

export function lowerBound(values: readonly string[], target: string): number {
  let a = 0;
  let b = values.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (values[m]! < target) a = m + 1;
    else b = m;
  }
  return a;
}

export function windowRange(
  year: number,
  mode: WinMode,
  weeks: readonly string[],
  windows: RankerIndex["windows"],
): [number, number] {
  if (mode === "cal") {
    return [lowerBound(weeks, `${year}-01-01`), lowerBound(weeks, `${year + 1}-01-01`) - 1];
  }
  const span = windows[String(year)];
  if (!span) return [0, -1];
  return [lowerBound(weeks, span[0]), lowerBound(weeks, `${span[1]}~`) - 1];
}

export function expandRuns(runs: readonly number[][]): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (const run of runs) {
    const start = run[0] ?? 0;
    for (let k = 1; k < run.length; k += 1) out.push([start + k - 1, run[k]!]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

export function candidateFromWeeks(id: number, wk: WeekPoint[]): Candidate | null {
  if (!wk.length) return null;
  const ranks = wk.map((point) => point[1]);
  const sorted = [...ranks].sort((p, q) => p - q);
  const peak = sorted[0]!;
  let n1 = 0;
  let n5 = 0;
  let n10 = 0;
  let n20 = 0;
  let n40 = 0;
  for (const rank of ranks) {
    if (rank === 1) n1 += 1;
    if (rank <= 5) n5 += 1;
    if (rank <= 10) n10 += 1;
    if (rank <= 20) n20 += 1;
    if (rank <= 40) n40 += 1;
  }
  return {
    id,
    sorted,
    peak,
    n1,
    n5,
    n10,
    n20,
    n40,
    weeks: ranks.length,
    debut: wk[0]![0],
    exit: wk[wk.length - 1]![0],
    climb: ranks.indexOf(peak),
    wk,
  };
}

export function homeYear(
  wk: readonly WeekPoint[],
  mode: WinMode,
  years: readonly number[],
  weeks: readonly string[],
  windows: RankerIndex["windows"],
): number {
  const ranges = years.map((year) => {
    const [start, end] = windowRange(year, mode, weeks, windows);
    return [year, start, end] as const;
  });
  const counts = new Map<number, number>();
  let best = 0;
  let home = 0;
  let peakRank = 101;
  let peakYear = 0;
  for (const [week, rank] of wk) {
    let year = 0;
    for (const [candidate, start, end] of ranges) {
      if (week >= start && week <= end) {
        year = candidate;
        break;
      }
    }
    if (!year) continue;
    counts.set(year, (counts.get(year) ?? 0) + 1);
    if (rank < peakRank) {
      peakRank = rank;
      peakYear = year;
    }
  }
  for (const [year, count] of counts) {
    if (count > best || (count === best && year === peakYear)) {
      best = count;
      home = year;
    }
  }
  return home;
}

export function flashToExp(flash: number): number {
  return 3.2 - 2.6 * (flash / 100);
}

export function expToFlash(exponent: number): number {
  return Math.round(((3.2 - exponent) / 2.6) * 100);
}

export function scoreOf(candidate: Candidate, settings: RankerSettings): number {
  const exponent = flashToExp(settings.flash);
  let score = 0;
  const counted = Math.min(candidate.sorted.length, settings.maxw >= 53 ? 999 : settings.maxw);
  let top5 = 0;
  let top10 = 0;
  let top20 = 0;
  let top40 = 0;
  for (let index = 0; index < counted; index += 1) {
    const rank = candidate.sorted[index]!;
    score += ((101 - rank) / 100) ** exponent;
    if (rank <= 5) top5 += 1;
    if (rank <= 10) top10 += 1;
    if (rank <= 20) top20 += 1;
    if (rank <= 40) top40 += 1;
  }
  score *= 100 * settings.pts;
  score +=
    settings.no1 * candidate.n1 +
    settings.t5 * top5 +
    settings.t10 * top10 +
    settings.t20 * top20 +
    settings.t40 * top40 +
    settings.wks * candidate.weeks;
  const peakWeight =
    candidate.peak === 1 ? 1 : candidate.peak <= 3 ? 0.625 : candidate.peak <= 5 ? 0.333 : candidate.peak <= 10 ? 0.125 : 0;
  return score + settings.peak * peakWeight;
}

export function rankCandidates(candidates: readonly Candidate[], settings: RankerSettings): Ranked[] {
  const ranked = candidates.map((candidate) => ({ c: candidate, s: scoreOf(candidate, settings) }));
  ranked.sort(
    (a, b) => b.s - a.s || a.c.peak - b.c.peak || b.c.n10 - a.c.n10 || b.c.n40 - a.c.n40,
  );
  return ranked;
}

export function rankYear(
  file: RankerYearFile,
  settings: RankerSettings,
  index: RankerIndex,
): Ranked[] {
  const [start, end] = windowRange(file.year, settings.win, index.weeks, index.windows);
  const candidates: Candidate[] = [];
  for (const song of file.songs) {
    const allWeeks = expandRuns(song.w);
    let weeks = allWeeks;
    if (settings.full) {
      if (homeYear(allWeeks, settings.win, index.years, index.weeks, index.windows) !== file.year) continue;
    } else {
      weeks = allWeeks.filter(([week]) => week >= start && week <= end);
    }
    const candidate = candidateFromWeeks(song.id, weeks);
    if (candidate) candidates.push(candidate);
  }
  return rankCandidates(candidates, settings);
}

export function compareOfficial(official: readonly OfficialEntry[], ranked: readonly Ranked[]): CompareResult {
  const position = new Map<number, number>();
  ranked.forEach((row, index) => position.set(row.c.id, index + 1));
  const ours10 = new Set(ranked.slice(0, 10).map((row) => row.c.id));
  const ours100 = new Set(ranked.slice(0, 100).map((row) => row.c.id));
  let t10 = 0;
  let t100 = 0;
  const pairs: Array<[number, number]> = [];
  for (const entry of official) {
    const songId = entry[1];
    if (songId == null) continue;
    if (entry[0] <= 10 && ours10.has(songId)) t10 += 1;
    if (ours100.has(songId)) t100 += 1;
    pairs.push([entry[0], position.get(songId) ?? ranked.length + 1]);
  }
  const n = pairs.length;
  let rho = 0;
  if (n > 2) {
    const byOurs = pairs.map((pair, index) => [pair[1], index] as const).sort((a, b) => a[0] - b[0]);
    const ourRank = new Array<number>(n);
    byOurs.forEach((row, order) => {
      ourRank[row[1]] = order + 1;
    });
    const byOfficial = pairs.map((pair, index) => [pair[0], index] as const).sort((a, b) => a[0] - b[0]);
    const officialRank = new Array<number>(n);
    byOfficial.forEach((row, order) => {
      officialRank[row[1]] = order + 1;
    });
    let distance = 0;
    for (let index = 0; index < n; index += 1) distance += (officialRank[index]! - ourRank[index]!) ** 2;
    rho = 1 - (6 * distance) / (n * (n * n - 1));
  }
  const same1 = Boolean(official.length && ranked.length && official[0]![1] === ranked[0]!.c.id);
  return { t10, t100, rho, same1, n };
}
