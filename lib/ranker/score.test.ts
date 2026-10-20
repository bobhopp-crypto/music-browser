import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RANKER_PRESETS, settingsOf } from "./presets";
import { compareOfficial, rankYear, type RankerIndex, type RankerYearFile } from "./score";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../public/data/ranker");

function loadIndex(): RankerIndex {
  return JSON.parse(readFileSync(join(dataDir, "index.json"), "utf8")) as RankerIndex;
}

function loadYear(year: number): RankerYearFile {
  return JSON.parse(readFileSync(join(dataDir, `${year}.json`), "utf8")) as RankerYearFile;
}

test("1976 default matches the Retroverse preset from the lab", () => {
  const index = loadIndex();
  const file = loadYear(1976);
  const ranked = rankYear(file, settingsOf(RANKER_PRESETS["Retroverse current"]), index);
  const top = file.songs.find((song) => song.id === ranked[0]?.c.id);
  const comparison = compareOfficial(file.official, ranked);
  assert.equal(top?.t, "A Fifth Of Beethoven");
  assert.equal(top?.a, "Walter Murphy");
  assert.equal(Math.round(ranked[0]!.s), 1948);
  assert.equal(comparison.t10, 5);
  assert.equal(comparison.t100, 78);
  assert.equal(comparison.rho.toFixed(2), "0.69");
  assert.equal(comparison.same1, false);
});

test("1976 Billboard-like preset keeps Silly Love Songs at number one", () => {
  const index = loadIndex();
  const file = loadYear(1976);
  const ranked = rankYear(file, settingsOf(RANKER_PRESETS["Billboard-like"]), index);
  const top = file.songs.find((song) => song.id === ranked[0]?.c.id);
  const comparison = compareOfficial(file.official, ranked);
  assert.equal(top?.t, "Silly Love Songs");
  assert.equal(top?.a, "Wings");
  assert.equal(Math.round(ranked[0]!.s), 2875);
  assert.equal(comparison.t10, 9);
  assert.equal(comparison.t100, 93);
  assert.equal(comparison.rho.toFixed(2), "0.92");
  assert.equal(comparison.same1, true);
});

test("public year files omit private library badges", () => {
  const raw = readFileSync(join(dataDir, "1976.json"), "utf8");
  assert.equal(raw.includes("VIDEO"), false);
  assert.equal(raw.includes("STAGING"), false);
  assert.equal(raw.includes('"own"'), false);
});
