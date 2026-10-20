"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatChartDate, formatChartRun, HOT100_CREDIT, hot100Years, isHot100Year } from "@/lib/ranker/dates";
import { PRESET_NAMES, RANKER_PRESETS, settingsOf, type RankerPresetName } from "@/lib/ranker/presets";
import {
  compareOfficial,
  rankYear,
  type CompareResult,
  type RankerIndex,
  type RankerSettings,
  type RankerYearFile,
  type Ranked,
  type WeekPoint,
} from "@/lib/ranker/score";

const STORAGE_KEY = "rv-ranker-v1";
const YEAR_CACHE = new Map<number, RankerYearFile>();

const PRIMARY_SLIDERS = [
  {
    key: "pts",
    label: "Chart points (every week counts)",
    min: 0,
    max: 3,
    step: 0.05,
    help: "Points for each week on the chart. Higher spots earn more. This is the backbone of the score.",
  },
  {
    key: "flash",
    label: "Flash ↔ Longevity",
    min: 0,
    max: 100,
    step: 1,
    help: "Left: only big weeks near the top matter. Right: every week counts about the same.",
  },
  {
    key: "no1",
    label: "Bonus per week at #1",
    min: 0,
    max: 200,
    step: 0.5,
    help: "Extra points for each week a song spent at #1.",
  },
  {
    key: "t10",
    label: "Bonus per week in the top 10",
    min: 0,
    max: 60,
    step: 0.1,
    help: "Extra points for each week in the top 10.",
  },
  {
    key: "wks",
    label: "Bonus per week on the chart",
    min: 0,
    max: 40,
    step: 0.1,
    help: "Flat points for every week charted, at any position.",
  },
  {
    key: "peak",
    label: "Peak position bonus",
    min: 0,
    max: 600,
    step: 1,
    help: "One-time bonus for how high it got: full bonus for #1, about 60% for #2–3, 33% for #4–5, 12% for #6–10.",
  },
] as const;

const MORE_SLIDERS = [
  {
    key: "maxw",
    label: "Count only the best N weeks",
    min: 5,
    max: 53,
    step: 1,
    help: "Caps how many weeks can add chart points. 53 counts every week. Retroverse uses 26.",
  },
  { key: "t5", label: "Bonus per week in the top 5", min: 0, max: 60, step: 0.1, help: "" },
  { key: "t20", label: "Bonus per week in the top 20", min: 0, max: 40, step: 0.1, help: "" },
  { key: "t40", label: "Bonus per week in the top 40", min: 0, max: 40, step: 0.1, help: "" },
] as const;

const FIT_KEYS = [
  ["pts", 0, 3],
  ["flash", 0, 100],
  ["no1", 0, 200],
  ["t10", 0, 60],
  ["wks", 0, 40],
  ["peak", 0, 600],
  ["maxw", 5, 53],
  ["t5", 0, 60],
  ["t20", 0, 40],
  ["t40", 0, 40],
] as const satisfies ReadonlyArray<readonly [keyof RankerSettings, number, number]>;

type SliderKey = (typeof PRIMARY_SLIDERS)[number]["key"] | (typeof MORE_SLIDERS)[number]["key"];
type Tab = "list" | "far" | "about";

function formatSetting(key: SliderKey, value: number): string {
  if (key === "flash") return value < 35 ? "flash" : value > 65 ? "longevity" : "balanced";
  if (key === "maxw") return value >= 53 ? "all" : String(Math.round(value));
  return String(Math.round(value * 100) / 100);
}

function isSettings(value: unknown): value is RankerSettings {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RankerSettings>;
  return (
    (row.win === "cal" || row.win === "bb") &&
    typeof row.full === "boolean" &&
    typeof row.pts === "number" &&
    typeof row.flash === "number" &&
    typeof row.peak === "number" &&
    typeof row.maxw === "number"
  );
}

async function loadYear(year: number): Promise<RankerYearFile> {
  const cached = YEAR_CACHE.get(year);
  if (cached) return cached;
  const response = await fetch(`/data/ranker/${year}.json`);
  if (!response.ok) throw new Error(`Could not load ${year}`);
  const file = (await response.json()) as RankerYearFile;
  YEAR_CACHE.set(year, file);
  return file;
}

function Spark({ weeks }: { weeks: WeekPoint[] }) {
  const width = 150;
  const height = 28;
  if (weeks.length < 2) return null;
  const start = weeks[0]![0];
  const end = weeks[weeks.length - 1]![0] || start + 1;
  const points = weeks
    .map(([week, rank]) => {
      const x = ((week - start) / Math.max(1, end - start)) * width;
      const y = ((rank - 1) / 99) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="ranker-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline fill="none" stroke="#9a1c1c" strokeWidth="1.6" points={points} />
    </svg>
  );
}

function diffOf(official: number | undefined, rank: number): { text: string; className: string } {
  if (!official) return { text: "not on", className: "ranker-diff ranker-diff--miss" };
  const delta = official - rank;
  if (delta === 0) return { text: "=", className: "ranker-diff ranker-diff--near" };
  const tone = Math.abs(delta) <= 5 ? "near" : Math.abs(delta) <= 20 ? "mid" : "far";
  return { text: delta > 0 ? `▲${delta}` : `▼${-delta}`, className: `ranker-diff ranker-diff--${tone}` };
}

export function RankerApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryYear = Number(searchParams.get("year"));
  const restored = useRef(false);
  const [ready, setReady] = useState(false);
  const [year, setYear] = useState(() => (isHot100Year(queryYear) ? queryYear : 1976));
  const [settings, setSettings] = useState<RankerSettings>(() => settingsOf(RANKER_PRESETS["Retroverse current"]));
  const [preset, setPreset] = useState<RankerPresetName | null>("Retroverse current");
  const [index, setIndex] = useState<RankerIndex | null>(null);
  const [file, setFile] = useState<RankerYearFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("list");
  const [fitLog, setFitLog] = useState("");
  const [fitting, setFitting] = useState(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const requested = searchParams.get("year");
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { year?: number; settings?: unknown; preset?: RankerPresetName | null };
        if (isSettings(saved.settings)) setSettings(saved.settings);
        if (saved.preset === null || (saved.preset && PRESET_NAMES.includes(saved.preset))) setPreset(saved.preset ?? null);
        if (!requested && saved.year && isHot100Year(saved.year)) setYear(saved.year);
      }
    } catch {
      /* keep the defaults when storage is unreadable */
    }
    setReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ year, settings, preset }));
  }, [ready, year, settings, preset]);

  useEffect(() => {
    if (!ready) return;
    if (searchParams.get("year") === String(year)) return;
    router.replace(`/ranker?year=${year}`, { scroll: false });
  }, [ready, year, router, searchParams]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch("/data/ranker/index.json")
      .then((response) => {
        if (!response.ok) throw new Error("Chart index failed to load");
        return response.json() as Promise<RankerIndex>;
      })
      .then((body) => {
        if (!cancel) setIndex(body);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Could not load charts");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!index) return;
    let cancel = false;
    setFile(null);
    loadYear(year)
      .then((body) => {
        if (!cancel) setFile(body);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : `Could not load ${year}`);
      });
    return () => {
      cancel = true;
    };
  }, [index, year]);

  const ranked = useMemo(() => (index && file ? rankYear(file, settings, index) : []), [index, file, settings]);
  const comparison = useMemo<CompareResult | null>(
    () => (file ? compareOfficial(file.official, ranked) : null),
    [file, ranked],
  );

  const songById = useMemo(() => {
    const map = new Map<number, RankerYearFile["songs"][number]>();
    file?.songs.forEach((song) => map.set(song.id, song));
    return map;
  }, [file]);

  const officialById = useMemo(() => {
    const map = new Map<number, number>();
    file?.official.forEach((entry) => {
      if (entry[1] != null && !map.has(entry[1])) map.set(entry[1], entry[0]);
    });
    return map;
  }, [file]);

  const retroverseById = useMemo(() => {
    const map = new Map<number, number>();
    file?.rv.forEach((id, position) => map.set(id, position + 1));
    return map;
  }, [file]);

  function patch(partial: Partial<RankerSettings>) {
    setPreset(null);
    setSettings((current) => ({ ...current, ...partial }));
  }

  function applyPreset(name: RankerPresetName) {
    setPreset(name);
    setSettings(settingsOf(RANKER_PRESETS[name]));
  }

  function shiftYear(delta: number) {
    const next = year + delta;
    if (isHot100Year(next)) setYear(next);
  }

  async function fit(years: number[], label: string) {
    if (!index || fitting) return;
    setFitting(true);
    setFitLog(`${label}: loading charts…`);
    try {
      let loaded = 0;
      for (const item of years) {
        await loadYear(item);
        loaded += 1;
        if (loaded % 5 === 0 || loaded === years.length) setFitLog(`${label}: loaded ${loaded} of ${years.length} years…`);
      }
      const files = years.map((item) => YEAR_CACHE.get(item)!);
      const objective = (candidate: RankerSettings) => {
        let total = 0;
        for (const yearFile of files) {
          const rows = rankYear(yearFile, candidate, index);
          const score = compareOfficial(yearFile.official, rows);
          total += 0.7 * score.rho + 0.3 * (score.t10 / 10);
        }
        return total / files.length;
      };
      const starts = [
        settings,
        ...PRESET_NAMES.map((name) => settingsOf(RANKER_PRESETS[name])),
      ];
      let best: RankerSettings | null = null;
      let bestValue = -9;
      let evals = 0;
      const started = performance.now();
      for (const win of ["cal", "bb"] as const) {
        for (const full of [false, true]) {
          for (const start of starts) {
            let current = { ...start, win, full };
            let value = objective(current);
            evals += 1;
            let step = 0.35;
            for (let round = 0; round < 10; round += 1) {
              let improved = false;
              for (const [key, low, high] of FIT_KEYS) {
                for (const direction of [1, -1]) {
                  const next = { ...current };
                  const span = high - low;
                  const nudged = Math.min(high, Math.max(low, current[key] + direction * step * span));
                  if (nudged === current[key]) continue;
                  next[key] = nudged;
                  const nextValue = objective(next);
                  evals += 1;
                  if (nextValue > value + 1e-6) {
                    current = next;
                    value = nextValue;
                    improved = true;
                  }
                }
              }
              if (!improved) step /= 2;
              setFitLog(`${label}: tried ${evals} combinations… best so far ${(bestValue > value ? bestValue : value).toFixed(3)}`);
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            if (value > bestValue) {
              bestValue = value;
              best = { ...current };
            }
          }
        }
      }
      if (!best) return;
      for (const [key] of FIT_KEYS) best[key] = Math.round(best[key] * 100) / 100;
      best.maxw = Math.round(best.maxw);
      best.flash = Math.round(best.flash);
      setSettings(best);
      setPreset(null);
      let top10 = 0;
      let top100 = 0;
      let rho = 0;
      let same = 0;
      for (const yearFile of files) {
        const score = compareOfficial(yearFile.official, rankYear(yearFile, best, index));
        top10 += score.t10;
        top100 += score.t100;
        rho += score.rho;
        same += score.same1 ? 1 : 0;
      }
      const count = files.length;
      setFitLog(
        `${label}: done (${evals} combinations, ${((performance.now() - started) / 1000).toFixed(0)} s).\nBest settings are now on the sliders.\nAverage over ${count} year(s): top-10 overlap ${(top10 / count).toFixed(1)}/10, top-100 overlap ${(top100 / count).toFixed(1)}, order match ${(rho / count).toFixed(3)}, same #1 in ${same} of ${count}.`,
      );
    } catch (reason: unknown) {
      setFitLog(reason instanceof Error ? reason.message : "Fit failed");
    } finally {
      setFitting(false);
    }
  }

  const years = index?.years ?? hot100Years();
  const groups: Array<{ heading: string; years: number[] }> = [];
  for (const item of years) {
    const heading = `The ${Math.floor(item / 10) * 10}s`;
    const last = groups.at(-1);
    if (!last || last.heading !== heading) groups.push({ heading, years: [item] });
    else last.years.push(item);
  }
  const windowNote = index?.windows[String(year)];
  const officialOne = file?.official[0];
  const rows = ranked.slice(0, 100);

  return (
    <>
      <header className="ranker-mast">
        <p className="ranker-brand">
          <Link href="/">Retroverse</Link>
          <span aria-hidden="true">/</span>
          <Link href="/hot100">Hot 100</Link>
        </p>
        <p className="ranker-kicker">Year-end lab</p>
        <h1 className="ranker-title">Ranker</h1>
        <p className="ranker-lede">Move the sliders to decide how a song earns its spot. Compare with Billboard&apos;s official year-end list.</p>
      </header>

      <div className="ranker-layout">
        <section className="ranker-controls" aria-label="Ranking controls">
          <div className="ranker-sticky">
            <div className="ranker-yearbar">
              <button type="button" onClick={() => shiftYear(-1)} disabled={year <= years[0]!} aria-label="Previous year">
                ‹
              </button>
              <select
                aria-label="Year"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              >
                {groups.map((group) => (
                  <optgroup key={group.heading} label={group.heading}>
                    {group.years.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button type="button" onClick={() => shiftYear(1)} disabled={year >= years[years.length - 1]!} aria-label="Next year">
                ›
              </button>
            </div>
            {windowNote ? (
              <p className="ranker-window-note">
                Billboard chart year: {formatChartDate(windowNote[0])} – {formatChartDate(windowNote[1])}
                {windowNote[2] === "approx" ? " (approx.)" : ""}
              </p>
            ) : null}
            <div className="ranker-scores" aria-live="polite">
              <article className="ranker-score">
                <p className="ranker-score__n">{comparison ? `${comparison.t10} / 10` : "–"}</p>
                <p className="ranker-score__l">official top 10 also in ours</p>
              </article>
              <article className="ranker-score">
                <p className="ranker-score__n">{comparison ? `${comparison.t100} / 100` : "–"}</p>
                <p className="ranker-score__l">official top 100 also in ours</p>
              </article>
              <article className="ranker-score">
                <p className="ranker-score__n">{comparison ? comparison.rho.toFixed(2) : "–"}</p>
                <p className="ranker-score__l">order match vs official</p>
              </article>
              <article className="ranker-score">
                <p className="ranker-score__n">{comparison ? (comparison.same1 ? "Same #1" : "Different #1") : "–"}</p>
                <p className="ranker-score__l">
                  {officialOne ? `${officialOne[2]} — ${officialOne[3]}` : "Official #1"}
                </p>
              </article>
            </div>
          </div>

          <h2 className="ranker-kicker-row">Presets</h2>
          <div className="ranker-presets">
            {PRESET_NAMES.map((name) => (
              <button key={name} type="button" aria-pressed={preset === name} onClick={() => applyPreset(name)}>
                {name}
              </button>
            ))}
          </div>
          <p className="ranker-note">{preset ? RANKER_PRESETS[preset].note : "Custom settings."}</p>

          <h2 className="ranker-kicker-row">Which weeks count</h2>
          <div className="ranker-choices" role="group" aria-label="Which weeks count">
            <button type="button" className="ranker-choice" aria-pressed={settings.win === "cal"} onClick={() => patch({ win: "cal" })}>
              Calendar year
            </button>
            <button type="button" className="ranker-choice" aria-pressed={settings.win === "bb"} onClick={() => patch({ win: "bb" })}>
              Billboard chart year
            </button>
          </div>
          <label className="ranker-check">
            <input
              type="checkbox"
              checked={settings.full}
              onChange={(event) => patch({ full: event.target.checked })}
            />
            Count each song&apos;s whole chart run
          </label>

          <h2 className="ranker-kicker-row">What earns points</h2>
          {PRIMARY_SLIDERS.map((slider) => (
            <Slider
              key={slider.key}
              label={slider.label}
              help={slider.help}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={settings[slider.key]}
              display={formatSetting(slider.key, settings[slider.key])}
              onChange={(value) => patch({ [slider.key]: value })}
            />
          ))}
          <details className="ranker-more">
            <summary>More settings</summary>
            {MORE_SLIDERS.map((slider) => (
              <Slider
                key={slider.key}
                label={slider.label}
                help={slider.help}
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={settings[slider.key]}
                display={formatSetting(slider.key, settings[slider.key])}
                onChange={(value) => patch({ [slider.key]: value })}
              />
            ))}
          </details>

          <h2 className="ranker-kicker-row">Fit to official</h2>
          <div className="ranker-fit">
            <button type="button" disabled={fitting || !index} onClick={() => void fit([year], `Fit ${year}`)}>
              This year
            </button>
            <button type="button" disabled={fitting || !index} onClick={() => void fit(years.filter((item) => item >= 1959), "Fit all years")}>
              All years
            </button>
            <button type="button" disabled={fitting || !index} onClick={() => void fit(years.filter((item) => item >= 1959 && item <= 1990), "Fit 1959–1990")}>
              1959–1990
            </button>
            <button type="button" disabled={fitting || !index} onClick={() => void fit(years.filter((item) => item >= 1991), "Fit 1991–2024")}>
              1991–2024
            </button>
          </div>
          {fitLog ? <p className="ranker-log">{fitLog}</p> : null}
        </section>

        <section className="ranker-results" aria-label={`${year} ranking`}>
          <div className="ranker-tabs" role="tablist" aria-label="Result views">
            <button type="button" role="tab" aria-selected={tab === "list"} onClick={() => setTab("list")}>
              Our top 100
            </button>
            <button type="button" role="tab" aria-selected={tab === "far"} onClick={() => setTab("far")}>
              Far from official
            </button>
            <button type="button" role="tab" aria-selected={tab === "about"} onClick={() => setTab("about")}>
              How it works
            </button>
          </div>

          {error ? <p className="ranker-status">{error}</p> : null}
          {!error && !file ? <p className="ranker-status">Loading {year}…</p> : null}

          {file && index && tab === "about" ? <About year={year} built={index.built} first={index.weeks[0]!} last={index.weeks[index.weeks.length - 1]!} /> : null}

          {file && index && tab === "far" ? (
            <FarList year={year} official={file.official} ranked={ranked} weeks={index.weeks} />
          ) : null}

          {file && index && tab === "list" ? (
            <div className="ranker-list">
              <div className="ranker-list__head" aria-hidden="true">
                <span>#</span>
                <span>Title</span>
                <span>Score</span>
                <span>Official</span>
                <span>Diff</span>
                <span>RV now</span>
                <span>Peak</span>
                <span>Wks</span>
                <span>#1</span>
                <span>Top 10</span>
                <span>Top 40</span>
                <span>Run</span>
                <span>Climb</span>
              </div>
              {rows.map((row, position) => {
                const song = songById.get(row.c.id);
                const rank = position + 1;
                const official = officialById.get(row.c.id);
                const diff = diffOf(official, rank);
                const debut = index.weeks[row.c.debut] ?? "";
                const exit = index.weeks[row.c.exit] ?? "";
                return (
                  <article key={row.c.id} className={rank === 1 ? "ranker-card ranker-card--lead" : "ranker-card"}>
                    <span className="ranker-card__rank">{rank}</span>
                    <div className="ranker-card__id">
                      <h3 className="ranker-card__title">{song?.t}</h3>
                      <p className="ranker-card__artist">{song?.a}</p>
                    </div>
                    <p className="ranker-card__score">{Math.round(row.s)}</p>
                    <dl className="ranker-card__meta">
                      <div>
                        <dt>Official</dt>
                        <dd data-k="Official">{official ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Difference</dt>
                        <dd data-k="Diff">
                          <span className={diff.className}>{diff.text}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Retroverse now</dt>
                        <dd data-k="RV">{retroverseById.get(row.c.id) ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Peak</dt>
                        <dd data-k="Peak">{row.c.peak}</dd>
                      </div>
                      <div>
                        <dt>Weeks</dt>
                        <dd data-k="Wks">{row.c.weeks}</dd>
                      </div>
                      <div>
                        <dt>Weeks at number one</dt>
                        <dd data-k="#1">{row.c.n1 || ""}</dd>
                      </div>
                      <div>
                        <dt>Top 10</dt>
                        <dd data-k="Top 10">{row.c.n10 || ""}</dd>
                      </div>
                      <div>
                        <dt>Top 40</dt>
                        <dd data-k="Top 40">{row.c.n40 || ""}</dd>
                      </div>
                    </dl>
                    <div className="ranker-card__run">
                      <div className="ranker-card__runline">
                        <Spark weeks={row.c.wk} />
                        <span>{debut && exit ? formatChartRun(debut, exit) : ""}</span>
                      </div>
                      <span className="ranker-card__climb" data-k="Climb">
                        {row.c.climb}
                      </span>
                    </div>
                  </article>
                );
              })}
              <p className="ranker-help">
                ▲ means we rank it higher than Billboard, ▼ means lower. Green is within 5 places, gold within 20, red beyond that.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <footer className="ranker-foot">
        <p>{HOT100_CREDIT}</p>
        <p>On a phone, open Share and choose Add to Home Screen. The icon opens this ranker.</p>
      </footer>
    </>
  );
}

function Slider({
  label,
  help,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const id = `ranker-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="ranker-slider">
      <label htmlFor={id}>
        <span>{label}</span>
        <span className="ranker-val">{display}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {help ? <p className="ranker-help">{help}</p> : null}
    </div>
  );
}

function About({ year, built, first, last }: { year: number; built: string; first: string; last: string }) {
  return (
    <div className="ranker-prose">
      <h2>How it works</h2>
      <p>
        Every song on the Hot 100 during the chosen weeks gets a score. Each week earns chart points. The Flash ↔ Longevity
        slider decides how much a high position is worth. Bonuses are then added for weeks at #1, weeks in the top 10, every
        week charted, and the song&apos;s peak.
      </p>
      <p>
        Calendar year uses January–December charts. Billboard&apos;s chart year uses the weeks behind its official list, roughly
        November to October. Billboard&apos;s own pre-1991 formula is not public, so no setting matches those lists exactly.
      </p>
      <p>
        The boxes show how close these settings are to Billboard&apos;s official {year} list. Order match is 1.00 when the order
        is identical. Each year&apos;s chart loads on its own, so the page stays light on a phone.
      </p>
      <p className="ranker-help">
        Weekly Hot 100 charts {first} to {last}. Official year-end lists and the current Retroverse ranking. Built {built}.
      </p>
    </div>
  );
}

function FarList({
  year,
  official,
  ranked,
  weeks,
}: {
  year: number;
  official: RankerYearFile["official"];
  ranked: Ranked[];
  weeks: string[];
}) {
  const position = new Map<number, number>();
  ranked.forEach((row, index) => position.set(row.c.id, index + 1));
  const rows = official
    .map((entry) => ({ entry, place: entry[1] == null ? null : (position.get(entry[1]) ?? null) }))
    .filter((row) => row.place == null || row.place > 100 || Math.abs(row.place - row.entry[0]) >= 25)
    .sort((a, b) => a.entry[0] - b.entry[0]);
  return (
    <>
      <div className="ranker-prose">
        <h2>Official {year} hits that land far from their Billboard spot</h2>
        <p>25 or more places off, or outside our top 100.</p>
      </div>
      {rows.map((row) => {
        const candidate = row.place ? ranked[row.place - 1]?.c : null;
        const debut = candidate ? weeks[candidate.debut] : "";
        const exit = candidate ? weeks[candidate.exit] : "";
        return (
          <article key={`${row.entry[0]}-${row.entry[2]}`} className="ranker-miss">
            <h2>
              Official {row.entry[0]} · {row.entry[2]}
            </h2>
            <p>{row.entry[3]}</p>
            <p>Our rank: {row.place ?? "—"}</p>
            <p className="ranker-help">
              {row.entry[1] == null
                ? "Not found in the weekly chart data."
                : candidate
                  ? `${candidate.weeks} wks, peak #${candidate.peak}, ${candidate.n1} at #1, ${debut && exit ? formatChartRun(debut, exit) : ""}`
                  : "No chart weeks in this window."}
            </p>
          </article>
        );
      })}
    </>
  );
}
