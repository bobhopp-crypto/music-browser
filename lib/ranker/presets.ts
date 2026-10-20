import { expToFlash, type RankerSettings } from "./score";

export type RankerPresetName = "Retroverse current" | "Billboard-like" | "Longevity" | "Peak power";

export type RankerPreset = RankerSettings & { note: string };

export const RANKER_PRESETS: Record<RankerPresetName, RankerPreset> = {
  "Retroverse current": {
    win: "cal",
    full: false,
    pts: 1,
    flash: expToFlash(1.4),
    no1: 0,
    t10: 1.109,
    wks: 0,
    peak: 19.02,
    maxw: 26,
    t5: 1.585,
    t20: 0.792,
    t40: 0.475,
    note: "The formula behind our current list: calendar year, (101 − position)^1.4 per week, best 26 weeks, tier and peak bonuses.",
  },
  "Billboard-like": {
    win: "bb",
    full: false,
    pts: 1,
    flash: 34,
    no1: 70,
    t10: 16.86,
    wks: 28,
    peak: 307.77,
    maxw: 34,
    t5: 4.21,
    t20: 13.04,
    t40: 0,
    note: "Settings tuned to come closest to Billboard's official lists across all years.",
  },
  Longevity: {
    win: "bb",
    full: true,
    pts: 1,
    flash: 90,
    no1: 0,
    t10: 0,
    wks: 3,
    peak: 0,
    maxw: 53,
    t5: 0,
    t20: 0,
    t40: 0,
    note: "Long chart runs win; every week counts nearly the same.",
  },
  "Peak power": {
    win: "bb",
    full: true,
    pts: 1,
    flash: 15,
    no1: 25,
    t10: 3,
    wks: 0,
    peak: 60,
    maxw: 20,
    t5: 2,
    t20: 0,
    t40: 0,
    note: "Big hits win: weeks at #1 and a high peak count most.",
  },
};

export const PRESET_NAMES = Object.keys(RANKER_PRESETS) as RankerPresetName[];

export function settingsOf(preset: RankerPreset): RankerSettings {
  const { note: _note, ...settings } = preset;
  return settings;
}
