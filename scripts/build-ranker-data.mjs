#!/usr/bin/env node
/**
 * Split the Ranking Lab prototype into public per-year JSON.
 *
 * Usage: node tools/build-ranker-data.mjs path/to/index.html
 *
 * Ownership badges (VIDEO / STAGING) are private library data and are dropped.
 */
import fs from "node:fs";
import path from "node:path";

const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error("Usage: node tools/build-ranker-data.mjs <ranking-lab.html>");
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
const start = html.indexOf("window.RANKER_DATA=");
const end = html.indexOf(";</script>", start);
if (start < 0 || end < 0) throw new Error("RANKER_DATA not found");
const data = JSON.parse(html.slice(start + "window.RANKER_DATA=".length, end));

const weeks = data.weeks;
const songs = data.songs;
const years = [];
for (let year = 1958; year <= 2024; year += 1) years.push(year);

function lower(target) {
  let a = 0;
  let b = weeks.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (weeks[m] < target) a = m + 1;
    else b = m;
  }
  return a;
}

function range(year, mode) {
  if (mode === "cal") return [lower(`${year}-01-01`), lower(`${year + 1}-01-01`) - 1];
  const span = data.windows[String(year)];
  return [lower(span[0]), lower(`${span[1]}~`) - 1];
}

const points = songs.map((song) => {
  const out = [];
  for (let index = 0; index < song[3].length; index += 1) {
    if (song[3][index]) out.push([song[2] + index, song[3][index]]);
  }
  return out;
});

function runsOf(weekPoints) {
  const runs = [];
  let current = null;
  for (const [week, rank] of weekPoints) {
    if (!current || week !== current[0] + current.length - 1) {
      current = [week, rank];
      runs.push(current);
    } else current.push(rank);
  }
  return runs;
}

const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "public", "data", "ranker");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const index = {
  built: data.built,
  years,
  weeks,
  windows: data.windows,
};
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index));

let bytes = fs.statSync(path.join(outDir, "index.json")).size;
for (const year of years) {
  const cal = range(year, "cal");
  const bb = range(year, "bb");
  const lo = Math.min(cal[0], bb[0]);
  const hi = Math.max(cal[1], bb[1]);
  const wanted = new Set();
  for (const row of data.official[String(year)] ?? []) if (row[3] != null) wanted.add(row[3]);
  for (const row of data.rv[String(year)] ?? []) wanted.add(row[1]);

  const yearSongs = [];
  for (let id = 0; id < songs.length; id += 1) {
    const weekPoints = points[id];
    const hitsWindow = weekPoints.some(([week]) => week >= lo && week <= hi);
    if (!hitsWindow && !wanted.has(id)) continue;
    if (!weekPoints.length && !wanted.has(id)) continue;
    yearSongs.push({
      id,
      t: songs[id][0],
      a: songs[id][1],
      w: runsOf(weekPoints),
    });
  }

  const official = (data.official[String(year)] ?? []).map((row) => [row[0], row[3], row[1], row[2]]);
  const rv = [...(data.rv[String(year)] ?? [])].sort((a, b) => a[0] - b[0]).map((row) => row[1]);
  const file = { year, songs: yearSongs, official, rv };
  const filePath = path.join(outDir, `${year}.json`);
  const json = JSON.stringify(file);
  if (json.includes('"own"') || json.includes("VIDEO") || json.includes("STAGING")) {
    throw new Error(`${year} still contains private ownership data`);
  }
  fs.writeFileSync(filePath, json);
  bytes += json.length;
  console.log(`${year} songs=${yearSongs.length} ${(json.length / 1024).toFixed(0)}KB`);
}

console.log(`total ${(bytes / 1024 / 1024).toFixed(2)}MB`);
