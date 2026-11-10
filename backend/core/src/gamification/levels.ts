/**
 * The level curve (docs/FORMULAS.md). Each stat maps its raw value onto a 0–100
 * level via a smooth power curve: fast early levels (dopamine), heavy late ones.
 * Honest mirror — the level is a pure function of current data, so it can also go
 * DOWN with detraining. No XP grind, no persistence: just value → level + progress.
 *
 *   level(value) = clamp(floor(100 * (value/vMax)^(1/exp)), 0, 100)
 *   value(level) = vMax * (level/100)^exp        // inverse — the threshold for a level
 *
 * Calibrated "elite-realistic": LV100 is a life-goal, never trivially reached.
 */
import { clamp, round1 } from '../domain/math.ts';

export interface LevelCurve {
  /** The value that maps to LV100 (the asymptote). */
  vMax: number;
  /** Steepness; > 1 makes early levels come faster than late ones. */
  exponent: number;
}

/** The continuous 0–100 score a raw value earns on a curve (un-floored). */
export function scoreForValue(value: number, curve: LevelCurve): number {
  if (!(value > 0)) return 0;
  const ratio = clamp(value / curve.vMax, 0, 1);
  return clamp(100 * Math.pow(ratio, 1 / curve.exponent), 0, 100);
}

/** The integer level (0–100) a raw value earns on a curve. */
export function levelForValue(value: number, curve: LevelCurve): number {
  return Math.floor(scoreForValue(value, curve));
}

/** The raw value threshold a given level begins at (inverse of levelForValue). */
export function valueForLevel(level: number, curve: LevelCurve): number {
  return curve.vMax * Math.pow(clamp(level, 0, 100) / 100, curve.exponent);
}

// --- Tiers (RPG ranks per level band) ---------------------------------------

export interface StatTier {
  name: string;
  index: number;
}

/** Band floor → name. Highest band whose floor ≤ level wins. */
const TIER_BANDS: ReadonlyArray<{ name: string; min: number }> = [
  { name: 'Novice', min: 0 },
  { name: 'Apprentice', min: 10 },
  { name: 'Adept', min: 25 },
  { name: 'Veteran', min: 50 },
  { name: 'Elite', min: 75 },
  { name: 'Mythic', min: 95 },
];

export function tierForLevel(level: number): StatTier {
  let index = 0;
  for (let i = 0; i < TIER_BANDS.length; i++) {
    if (level >= TIER_BANDS[i]!.min) index = i;
  }
  return { name: TIER_BANDS[index]!.name, index };
}

// --- The bundle a stat carries -----------------------------------------------

export interface LevelInfo {
  level: number;
  /** 0–100 progress within the current level (the XP-bar fill). */
  progressPct: number;
  /** Raw value still needed to reach the next level; null at LV100. */
  toNext: number | null;
  /** The raw value at which the next level begins; null at LV100. */
  nextLevelValue: number | null;
  tier: StatTier;
}

/** Compute the full level bundle for a raw value on a curve. */
export function levelInfo(value: number, curve: LevelCurve): LevelInfo {
  const level = levelForValue(value, curve);
  const tier = tierForLevel(level);
  if (level >= 100) {
    return { level, progressPct: 100, toNext: null, nextLevelValue: null, tier };
  }
  const cur = valueForLevel(level, curve);
  const next = valueForLevel(level + 1, curve);
  const span = next - cur || 1;
  const progressPct = clamp(Math.round(((value - cur) / span) * 100), 0, 100);
  return { level, progressPct, toNext: round1(Math.max(0, next - value)), nextLevelValue: round1(next), tier };
}

// --- Composite stats (a level blended from weighted sub-factors) -------------

/** One factor feeding a composite stat. `scored` is fed to the curve; `shown`
 * (+ `unit`) is what the breakdown displays — so pace can show as min/km while
 * being scored on m/s, etc. A `weight` of 0 drops the factor entirely. */
export interface SubScore {
  label: string;
  scored: number;
  shown: number;
  unit: string;
  curve: LevelCurve;
  weight: number;
}

/** A displayed sub-factor of a composite stat (the UI breakdown row). */
export interface SubBreakdown {
  label: string;
  value: number;
  unit: string;
  level: number;
}

export interface CompositeResult {
  /** The blended 0–100 score (this is the stat's `value`). */
  value: number;
  level: number;
  progressPct: number;
  /** Points to the next level (composites have no single raw unit); null at 100. */
  toNext: number | null;
  nextLevelValue: number | null;
  tier: StatTier;
  breakdown: SubBreakdown[];
}

/** Blend weighted sub-scores (each a curve applied to a factor) into one 0–100
 * stat level. Zero-weight factors are dropped and the rest re-normalised, so a
 * missing factor (e.g. no bodyweight for relative strength) degrades gracefully. */
export function compositeStat(subs: SubScore[]): CompositeResult {
  const active = subs.filter((s) => s.weight > 0);
  const totalW = active.reduce((a, s) => a + s.weight, 0) || 1;
  let S = 0;
  const breakdown: SubBreakdown[] = [];
  for (const s of active) {
    const sub = scoreForValue(s.scored, s.curve);
    S += (s.weight / totalW) * sub;
    breakdown.push({ label: s.label, value: round1(s.shown), unit: s.unit, level: Math.floor(sub) });
  }
  const level = clamp(Math.floor(S), 0, 100);
  const tier = tierForLevel(level);
  if (level >= 100) {
    return { value: round1(S), level, progressPct: 100, toNext: null, nextLevelValue: null, tier, breakdown };
  }
  const progressPct = clamp(Math.round((S - level) * 100), 0, 100);
  return { value: round1(S), level, progressPct, toNext: round1(level + 1 - S), nextLevelValue: level + 1, tier, breakdown };
}
