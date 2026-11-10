/**
 * The three stat tracks (docs/FORMULAS.md). Deterministic,
 * documented, computed at query time; only level-ups persist. Every stat carries an
 * explicit confidence the report prints verbatim, plus a `breakdown` of its
 * sub-factors for the UI.
 *   STAMINA  = cumulative-total base (max 60) + longest-run-ever bonus (max 20) +
 *              best-ever-PR pace bonus (max 20) — all over the FULL run history (no
 *              rolling window), so the level is monotonically non-decreasing.
 *   STRENGTH = cumulative-tonnage base (max 60) + per-lift best-ever bonus
 *              (max 20) + per-lift best-ever relative-to-bodyweight bonus (max 20)
 *              — same additive, monotonic shape as STAMINA.
 *   LEANNESS = fat-mass progress toward the goal weight @ goal body-fat %
 */
import type { Confidence, Equipment, Run, WeightPoint } from '../domain/index.ts';
import { addDaysIso, diffDays, unixToIsoDate } from '../domain/dates.ts';
import { clamp, round1 } from '../domain/math.ts';
import { compositeStat, levelInfo, tierForLevel, type LevelCurve, type StatTier, type SubBreakdown } from './levels.ts';
import { LEANNESS_FRESH_START, STRENGTH_FRESH_START, targetFatMassKg, type GoalValues } from './goals.ts';

export interface StatResult {
  value: number;
  level: number;
  /** 0–100 progress within the current level (the XP-bar fill). */
  progressPct: number;
  /** For composites: points to the next level; null at LV100. */
  toNext: number | null;
  nextLevelValue: number | null;
  tier: StatTier;
  confidence: Confidence;
  note: string;
  /** Sub-factors that fed the composite (empty only for the no-data case). */
  breakdown: SubBreakdown[];
  /** STRENGTH only: whole days since the latest session on/after the fresh start; null = none yet. */
  lastSessionDaysAgo?: number | null;
}

/** A strength set joined to its session date, for recency/volume-aware scoring. */
export interface ScoredStrengthSet {
  exerciseName: string;
  equipment: Equipment;
  realLoadKg: number | null;
  reps: number | null;
  /** Hold time for timed exercises (plank, etc.); null for rep-based sets. */
  durationSeconds: number | null;
  excludedFromTrend: boolean;
  sessionDateIso: string;
}

const zeroStat = (curve: LevelCurve, note: string): StatResult => ({
  value: 0,
  ...levelInfo(0, curve),
  confidence: 'low',
  note,
  breakdown: [],
});

// --- STAMINA: cumulative-total base + longest-run & best-PR milestone bonuses ----
// Deliberately NOT a rolling-window composite: base/longest/pace are all drawn from
// the FULL run history (no time window anywhere below), so every input is a running
// maximum/total that can only grow as runs are added — the level is monotonically
// non-decreasing BY CONSTRUCTION, never dropping between sessions. docs/FORMULAS.md.

const STAMINA_DAYS = 28;

const latestRunIso = (runs: ReadonlyArray<Run>): string => unixToIsoDate(runs.reduce((m, r) => Math.max(m, r.startTimeUtc), 0));

/** Rolling weekly km over the last 28 days (anchored to the latest run). */
export function weeklyKmOf(runs: ReadonlyArray<Run>): number {
  if (runs.length === 0) return 0;
  const since = addDaysIso(latestRunIso(runs), -(STAMINA_DAYS - 1));
  const km = runs.filter((r) => unixToIsoDate(r.startTimeUtc) >= since).reduce((s, r) => s + r.totalDistanceM / 1000, 0);
  return round1((km / STAMINA_DAYS) * 7);
}

/** A run's moving speed (m/s): the device's avg moving speed when present (it
 * excludes pauses), else distance / elapsed time as a fallback. */
export const runSpeedMps = (r: Run): number | null => {
  if (r.avgEnhancedSpeedMps != null && r.avgEnhancedSpeedMps > 0) return r.avgEnhancedSpeedMps;
  if (r.totalDurationS > 0 && r.totalDistanceM > 0) return r.totalDistanceM / r.totalDurationS;
  return null;
};

/** Fastest run-average speed (m/s) in the last 28 days; 0 if none usable. */
function bestSpeedMpsOf(runs: ReadonlyArray<Run>): number {
  if (runs.length === 0) return 0;
  const since = addDaysIso(latestRunIso(runs), -(STAMINA_DAYS - 1));
  const speeds = runs
    .filter((r) => unixToIsoDate(r.startTimeUtc) >= since)
    .map(runSpeedMps)
    .filter((s): s is number => s != null);
  return speeds.length ? Math.max(...speeds) : 0;
}

/** Fastest run-average pace (min/km) in the last 28 days; null if none. */
export function bestPaceMinPerKmOf(runs: ReadonlyArray<Run>): number | null {
  const best = bestSpeedMpsOf(runs);
  return best > 0 ? round1(1000 / best / 60) : null;
}

// --- STAMINA base: a smooth power curve over ALL-TIME cumulative distance -------
const STAMINA_BASE_MAX = 60;
const STAMINA_BASE_VMAX_KM = 2500; // total km that saturates the base at its max
const STAMINA_BASE_EXPONENT = 2.4;

function staminaBaseFromTotal(totalKm: number): number {
  const ratio = clamp(totalKm / STAMINA_BASE_VMAX_KM, 0, 1);
  return STAMINA_BASE_MAX * Math.pow(ratio, 1 / STAMINA_BASE_EXPONENT);
}

// --- STAMINA longest-run-ever bonus: a hard-step milestone ladder (max 20) ------
const LONGEST_RUN_LADDER: ReadonlyArray<{ km: number; bonus: number }> = [
  { km: 5, bonus: 3 },
  { km: 10, bonus: 6 },
  { km: 15, bonus: 10 },
  { km: 21.0975, bonus: 14 },
  { km: 30, bonus: 17 },
  { km: 42.195, bonus: 20 },
];

/** Cumulative bonus at the highest rung reached; below the first rung → 0. Hard
 * step, no interpolation between rungs. */
function longestBonusFor(longestKm: number): number {
  let bonus = 0;
  for (const rung of LONGEST_RUN_LADDER) if (longestKm >= rung.km) bonus = rung.bonus;
  return bonus;
}

// --- STAMINA pace bonus: best-ever race PR on any of 4 nominal distances --------
type PrDistance = '5k' | '10k' | 'HM' | 'FM';
const NOMINAL_KM: Record<PrDistance, number> = { '5k': 5, '10k': 10, HM: 21.0975, FM: 42.195 };

/** Cumulative bonus at each rung (seconds), per nominal distance — hard steps, no
 * interpolation. The 10k/HM/FM columns are Riegel equivalents of the 5k column,
 * kept as explicit data (not computed) so the ladder is auditable at a glance. */
const PACE_LADDER: ReadonlyArray<{ bonus: number } & Record<PrDistance, number>> = [
  { bonus: 3, '5k': 2700, '10k': 5640, HM: 12420, FM: 25920 }, // 45:00 / 1:34:00 / 3:27:00 / 7:12:00
  { bonus: 5, '5k': 2400, '10k': 5010, HM: 11040, FM: 23040 }, // 40:00 / 1:23:30 / 3:04:00 / 6:24:00
  { bonus: 8, '5k': 2100, '10k': 4380, HM: 9660, FM: 20160 }, // 35:00 / 1:13:00 / 2:41:00 / 5:36:00
  { bonus: 11, '5k': 1800, '10k': 3750, HM: 8280, FM: 17280 }, // 30:00 / 1:02:30 / 2:18:00 / 4:48:00
  { bonus: 13, '5k': 1650, '10k': 3440, HM: 7590, FM: 15840 }, // 27:30 / 57:20 / 2:06:30 / 4:24:00
  { bonus: 15, '5k': 1500, '10k': 3120, HM: 6900, FM: 14400 }, // 25:00 / 52:00 / 1:55:00 / 4:00:00
  { bonus: 17, '5k': 1350, '10k': 2820, HM: 6210, FM: 12960 }, // 22:30 / 47:00 / 1:43:30 / 3:36:00
  { bonus: 20, '5k': 1200, '10k': 2500, HM: 5520, FM: 11520 }, // 20:00 / 41:40 / 1:32:00 / 3:12:00
];

/** Cumulative bonus at the highest rung reached (fastest-or-equal time); slower
 * than the first rung → 0. */
function paceBonusForTime(timeSec: number, dist: PrDistance): number {
  let bonus = 0;
  for (const rung of PACE_LADDER) if (timeSec <= rung[dist]) bonus = rung.bonus;
  return bonus;
}

/** A run qualifies as a PR candidate for `nominalKm` once it's AT LEAST 98% of that
 * distance (`>= nominalKm * 0.98`) — a LOWER bound only, deliberately with NO upper
 * bound/ceiling. The domain has no per-km splits, so the honest approximation is to
 * PRO-RATE the run's average pace out to the nominal distance
 * (`durationSec * nominal / actualDistance`) rather than inventing splits. A run much
 * longer than nominal (e.g. a full marathon pro-rated to a 5k) still qualifies: at a
 * steady pace, pro-rating UNDER-credits relative to what a real shorter effort would
 * achieve (Riegel's endurance formula predicts faster — a 3:00:00 marathon pace
 * predicts ~18:46 for 5k via Riegel, but pro-rates here to a slower 21:20), so this is
 * conservative rather than inflationary. Kept intentionally with no ceiling —
 * see docs/FORMULAS.md STAMINA. */
function bestPrCandidateSeconds(runs: ReadonlyArray<Run>, nominalKm: number): number | null {
  const nominalM = nominalKm * 1000;
  const floorM = nominalKm * 0.98 * 1000;
  let best: number | null = null;
  for (const r of runs) {
    if (r.totalDistanceM < floorM || r.totalDistanceM <= 0 || r.totalDurationS <= 0) continue;
    const candidate = r.totalDurationS * (nominalM / r.totalDistanceM);
    if (best == null || candidate < best) best = candidate;
  }
  return best;
}

interface PrResult {
  distance: PrDistance;
  candidateSec: number;
  bonus: number;
  paceMinPerKm: number;
}

/** The best-ever PR across all 4 nominal distances, scored on that distance's
 * ladder — MAX across distances (never an average): a first slow 10k must never
 * lower the stat once a fast 5k has already earned a higher bonus. Ties (incl. a
 * 0-bonus tie, so a "best pace" is still shown before any rung is earned) break
 * toward the faster equivalent per-km pace. */
function bestPrAcrossDistances(runs: ReadonlyArray<Run>): PrResult | null {
  let best: PrResult | null = null;
  for (const distance of Object.keys(NOMINAL_KM) as PrDistance[]) {
    const candidateSec = bestPrCandidateSeconds(runs, NOMINAL_KM[distance]);
    if (candidateSec == null) continue;
    const bonus = paceBonusForTime(candidateSec, distance);
    const paceMinPerKm = candidateSec / 60 / NOMINAL_KM[distance];
    if (best == null || bonus > best.bonus || (bonus === best.bonus && paceMinPerKm < best.paceMinPerKm)) {
      best = { distance, candidateSec, bonus, paceMinPerKm };
    }
  }
  return best;
}

/** Format a duration in seconds as "m:ss" (or "h:mm:ss" past an hour) for the note. */
function fmtRaceTime(sec: number): string {
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** The zero-runs case, expressed in the SAME units as the populated path (additive
 * points, `toNext`/`nextLevelValue` in points toward LV1) — NOT `zeroStat`, whose
 * curve-based `toNext`/`nextLevelValue` are meaningless for this points-sum model.
 * `breakdown` mirrors the populated shape's 3 rows, all at 0. */
const staminaZeroResult = (): StatResult => ({
  value: 0,
  level: 0,
  progressPct: 0,
  toNext: 1,
  nextLevelValue: 1,
  tier: tierForLevel(0),
  confidence: 'high',
  note: 'No runs yet.',
  breakdown: [
    { label: 'Total', value: 0, unit: 'km', level: 0 },
    { label: 'Longest', value: 0, unit: 'km', level: 0 },
    { label: 'Pace', value: 0, unit: 'min/km', level: 0 },
  ],
});

/**
 * `staminaLevel = base(totalKm) [max 60] + longestBonus(longestKmEver) [max 20] +
 * paceBonus(bestPrEver) [max 20]`. All three inputs are drawn from the FULL run
 * history with NO time window — total distance, the longest-ever run, and the
 * best-ever PR can only go up as runs are added, so the stat is monotonically
 * non-decreasing (never drops between sessions, unlike the other composites).
 */
export function computeStamina(runs: ReadonlyArray<Run>): StatResult {
  if (runs.length === 0) return staminaZeroResult();

  const totalKm = runs.reduce((s, r) => s + r.totalDistanceM / 1000, 0);
  const longestKm = runs.reduce((m, r) => Math.max(m, r.totalDistanceM / 1000), 0);
  const base = staminaBaseFromTotal(totalKm);
  const longestBonus = longestBonusFor(longestKm);
  const pr = bestPrAcrossDistances(runs);
  const paceBonus = pr?.bonus ?? 0;

  const value = round1(base + longestBonus + paceBonus);
  const level = clamp(Math.floor(value), 0, 100);
  const tier = tierForLevel(level);
  const atMax = level >= 100;

  const breakdown: SubBreakdown[] = [
    { label: 'Total', value: round1(totalKm), unit: 'km', level: Math.floor(base) },
    { label: 'Longest', value: round1(longestKm), unit: 'km', level: longestBonus },
    { label: 'Pace', value: pr ? round1(pr.paceMinPerKm) : 0, unit: 'min/km', level: paceBonus },
  ];

  const prClause = pr ? ` · best ${pr.distance} ${fmtRaceTime(pr.candidateSec)} (estimate)` : '';
  const note = `${round1(totalKm)} km total · longest ${round1(longestKm)} km${prClause}.`;

  return {
    value,
    level,
    progressPct: atMax ? 100 : clamp(Math.round((value - level) * 100), 0, 100),
    toNext: atMax ? null : round1(level + 1 - value),
    nextLevelValue: atMax ? null : level + 1,
    tier,
    confidence: 'high',
    note,
    breakdown,
  };
}

// --- STRENGTH: cumulative tonnage base + key-lift & relative milestone bonuses ----
// Same shape as STAMINA: every input is a running total/maximum over ALL counted
// sessions (on/after STRENGTH_FRESH_START), no rolling window, so the level is
// monotonically non-decreasing BY CONSTRUCTION. docs/FORMULAS.md.

const STRENGTH_BASE_MAX = 60;
const STRENGTH_BASE_VMAX_KG = 750_000; // total tonnage that saturates the base at its max
const STRENGTH_BASE_EXPONENT = 2.4;

function strengthBaseFromTonnage(totalKg: number): number {
  const ratio = clamp(totalKg / STRENGTH_BASE_VMAX_KG, 0, 1);
  return STRENGTH_BASE_MAX * Math.pow(ratio, 1 / STRENGTH_BASE_EXPONENT);
}

/** Max bonus points each of the two STRENGTH bonuses can add (key-lift and relative). */
const STRENGTH_BONUS_MAX = 20;

/** One lift's all-time max (kg) → points (max 7); hard steps. Each pool lift has its own ladder; untrained = 0. */
const LIFT_LADDER: ReadonlyArray<{ min: number; bonus: number }> = [
  { min: 40, bonus: 1 },
  { min: 50, bonus: 2 },
  { min: 60, bonus: 3 },
  { min: 70, bonus: 4 },
  { min: 80, bonus: 5 },
  { min: 100, bonus: 6 },
  { min: 120, bonus: 7 },
];

/** One lift's all-time max ÷ bodyweight → points (max 7); hard steps. */
const LIFT_RELATIVE_LADDER: ReadonlyArray<{ min: number; bonus: number }> = [
  { min: 0.2, bonus: 1 },
  { min: 0.35, bonus: 2 },
  { min: 0.5, bonus: 3 },
  { min: 0.6, bonus: 4 },
  { min: 0.75, bonus: 5 },
  { min: 0.9, bonus: 6 },
  { min: 1.1, bonus: 7 },
];

function ladderBonus(ladder: ReadonlyArray<{ min: number; bonus: number }>, v: number): number {
  let bonus = 0;
  for (const rung of ladder) if (v >= rung.min) bonus = rung.bonus;
  return bonus;
}

/** Sum of the three per-lift ladder points, capped at the bonus max (3 × 7 = 21 → 20). */
const perLiftBonus = (ladder: ReadonlyArray<{ min: number; bonus: number }>, values: ReadonlyArray<number>): number =>
  Math.min(STRENGTH_BONUS_MAX, values.reduce((a, v) => a + ladderBonus(ladder, v), 0));

type KeyLiftProbe = Pick<ScoredStrengthSet, 'exerciseName' | 'equipment'>;
export type KeyLiftId = 'bench' | 'squat' | 'sumoDeadlift';

const isBench = (s: KeyLiftProbe): boolean => /bench press/i.test(s.exerciseName) && !/incline/i.test(s.exerciseName) && s.equipment === 'barbell';
// "Squat"/"Back Squat"/"Front Squat"/"Barbell Squat" all classify as barbell.
const isSquat = (s: KeyLiftProbe): boolean => /squat/i.test(s.exerciseName) && !/smith|hack|goblet|split|bulgarian|leg press/i.test(s.exerciseName) && s.equipment === 'barbell';
// Sumo only: conventional, Romanian, trap-bar and stiff-leg deadlifts do not count. Any equipment.
const isSumoDeadlift = (s: KeyLiftProbe): boolean => /sumo/i.test(s.exerciseName) && /deadlift/i.test(s.exerciseName);

/** Which STRENGTH key lift (if any) an exercise feeds; the 3 pool lifts. */
export function keyLiftOf(s: KeyLiftProbe): KeyLiftId | null {
  if (isBench(s)) return 'bench';
  if (isSquat(s)) return 'squat';
  if (isSumoDeadlift(s)) return 'sumoDeadlift';
  return null;
}

const strengthZeroResult = (lastSessionDaysAgo: number | null): StatResult => ({
  value: 0,
  level: 0,
  progressPct: 0,
  toNext: 1,
  nextLevelValue: 1,
  tier: tierForLevel(0),
  confidence: 'high',
  note: '',
  breakdown: [],
  lastSessionDaysAgo,
});

/** The one rule for which sets carry load: not excluded from the trend and with a real load (hold
 * sets have none). Shared by `computeStrength` and the weekly report. */
export const isLoadedSet = (s: ScoredStrengthSet): boolean => !s.excludedFromTrend && s.realLoadKg != null;

/** Tonnage of a loaded set: real load × reps (0 reps when unknown). */
export const setTonnageKg = (s: ScoredStrengthSet): number => (s.realLoadKg as number) * (s.reps ?? 0);

/** Floor to `dp` decimals (epsilon-guarded) so a displayed value never shows a rung it didn't earn. */
const floorTo = (v: number, dp: number): number => Math.floor(v * 10 ** dp + 1e-9) / 10 ** dp;

/**
 * `strengthLevel = base(totalTonnageKg) [max 60] + keyLiftBonus [max 20] + relativeBonus [max 20]`.
 * The two bonuses are PER LIFT: each of the 3 pool lifts climbs its own ladder on its all-time max
 * (untrained lift = 0 points), the three results are summed and capped at 20. Order-independent and
 * non-decreasing under INSERTION of any session or weigh-in at any date:
 *  - every lift max only grows; each ladder is a non-decreasing step function;
 *  - bodyweight = MIN positive weigh-in dated on/before the latest counted session (a min over
 *    a set that only grows under insertion; none → relative 0).
 * Hold sets (seconds, no load) carry no realLoadKg, so they never count. (Editing/deleting a session
 * may lower it, like deleting a run lowers STAMINA.)
 */
export function computeStrength(
  sets: ReadonlyArray<ScoredStrengthSet>,
  asOf: string,
  weights: ReadonlyArray<WeightPoint> = [],
  freshStartIso: string = STRENGTH_FRESH_START,
): StatResult {
  // Fresh start: only sessions on/after the restart date count; archived history never does.
  const postReset = sets.filter((s) => s.sessionDateIso >= freshStartIso);
  const lastSession = postReset.reduce((m, s) => (s.sessionDateIso > m ? s.sessionDateIso : m), '');
  const lastSessionDaysAgo = lastSession ? diffDays(lastSession, asOf) : null;
  const comparable = postReset.filter(isLoadedSet);
  if (comparable.length === 0) return strengthZeroResult(lastSessionDaysAgo);

  const totalTonnage = comparable.reduce((a, s) => a + setTonnageKg(s), 0);
  const base = strengthBaseFromTonnage(totalTonnage);

  const maxes: Record<KeyLiftId, number> = { bench: 0, squat: 0, sumoDeadlift: 0 };
  let latest = '0000-00-00';
  for (const s of comparable) {
    if (s.sessionDateIso > latest) latest = s.sessionDateIso;
    const lift = keyLiftOf(s);
    if (lift != null) maxes[lift] = Math.max(maxes[lift], s.realLoadKg as number);
  }
  const lifts = [maxes.bench, maxes.squat, maxes.sumoDeadlift];
  const bestSum = lifts[0]! + lifts[1]! + lifts[2]!;

  const valid = weights.filter((w) => Number.isFinite(w.weightKg) && w.weightKg > 0 && w.date <= latest);
  const bodyweight = valid.length ? Math.min(...valid.map((w) => w.weightKg)) : null;
  const ratios = bodyweight != null ? lifts.map((kg) => kg / bodyweight) : [0, 0, 0];

  const keyLiftBonus = perLiftBonus(LIFT_LADDER, lifts);
  const relativeBonus = perLiftBonus(LIFT_RELATIVE_LADDER, ratios);
  const value = round1(base + keyLiftBonus + relativeBonus);
  const level = clamp(Math.floor(value), 0, 100);
  const atMax = level >= 100;

  return {
    value,
    level,
    progressPct: atMax ? 100 : clamp(Math.round((value - level) * 100), 0, 100),
    toNext: atMax ? null : round1(level + 1 - value),
    nextLevelValue: atMax ? null : level + 1,
    tier: tierForLevel(level),
    confidence: 'high',
    note: '',
    lastSessionDaysAgo,
    breakdown: [
      { label: 'Total lifted', value: Math.floor(totalTonnage), unit: 'kg', level: Math.floor(base) },
      { label: 'Best lifts', value: floorTo(bestSum, 1), unit: 'kg', level: keyLiftBonus },
      { label: 'Lifts ÷ body weight', value: floorTo(bodyweight != null ? bestSum / bodyweight : 0, 2), unit: '×bw', level: relativeBonus },
    ],
  };
}

// --- LEANNESS: fat-mass progress toward the goal weight @ goal body-fat % --------------------------

const LEANNESS_FRACTION_CURVE = { vMax: 1, exponent: 1.1 } satisfies LevelCurve;

/** Fat mass in kg (weight × bf%); null when body-fat % is not logged. */
export function fatMassKg(w: WeightPoint): number | null {
  return w.bodyFatPct != null ? round1(w.weightKg * (w.bodyFatPct / 100)) : null;
}

/**
 * Sort weigh-ins chronologically and anchor them to the fresh-start date (goals.ts
 * LEANNESS_FRESH_START) so an earlier baseline weigh-in doesn't distort the "how far have you
 * come" mirror. Falls back to the UNFILTERED history only when there are ZERO weigh-ins on/after
 * the anchor — a single post-anchor point is kept as-is and honestly reads as 0% progress
 * (first === last is the true state since the anchor, not a regression to paper over).
 *
 * Shared by every weight-progress baseline in the app: this stat and the QUESTS leanness quest (docs/FORMULAS.md) — they must not each pick their
 * own baseline, or the same athlete's "progress since the restart" reads differently in each.
 */
export function anchoredWeightPoints(points: ReadonlyArray<WeightPoint>): WeightPoint[] {
  const sortedAll = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const filtered = sortedAll.filter((w) => w.date >= LEANNESS_FRESH_START);
  return filtered.length >= 1 ? filtered : sortedAll;
}

export function computeLeanness(weightPoints: ReadonlyArray<WeightPoint>, goals: GoalValues): StatResult {
  if (weightPoints.length === 0) return zeroStat(LEANNESS_FRACTION_CURVE, 'No weigh-ins yet.');
  const sorted = anchoredWeightPoints(weightPoints);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const weeks = Math.max(1, diffDays(first.date, last.date) / 7);
  const confidence: Confidence = sorted.length >= 2 && weeks >= 4 ? 'medium' : 'low';

  const targetFat = targetFatMassKg(goals);
  const curFat = fatMassKg(last);
  if (curFat != null) {
    // Anchor to the first weigh-in that actually has a bf% (mixed logging is allowed),
    // and abs() the denominator so progress reads correctly even if you start below goal.
    const startFat = sorted.map(fatMassKg).find((f): f is number => f != null) ?? curFat;
    const denom = Math.abs(startFat - targetFat) || 1;
    const frac = clamp((startFat - curFat) / denom, 0, 1);
    const comp = compositeStat([{ label: 'Fat mass', scored: frac, shown: curFat, unit: 'kg', curve: LEANNESS_FRACTION_CURVE, weight: 1 }]);
    return {
      ...comp,
      breakdown: [
        { label: 'Fat mass now', value: curFat, unit: 'kg', level: comp.level },
        { label: 'Goal', value: round1(targetFat), unit: 'kg', level: 100 },
      ],
      confidence,
      note: `${curFat} kg fat → goal ${round1(targetFat)} kg (${goals.weightKg} kg @ ${goals.bodyFatPct}%).`,
    };
  }

  // No body-fat % logged → fall back to weight toward the goal weight (low confidence).
  const denom = Math.abs(first.weightKg - goals.weightKg) || 1;
  const frac = clamp((first.weightKg - last.weightKg) / denom, 0, 1);
  const comp = compositeStat([{ label: 'Weight', scored: frac, shown: round1(last.weightKg), unit: 'kg', curve: LEANNESS_FRACTION_CURVE, weight: 1 }]);
  return {
    ...comp,
    breakdown: [
      { label: 'Weight now', value: round1(last.weightKg), unit: 'kg', level: comp.level },
      { label: 'Goal', value: goals.weightKg, unit: 'kg', level: 100 },
    ],
    confidence: 'low',
    note: `No body-fat % — weight ${round1(last.weightKg)} kg → goal ${goals.weightKg} kg (body-fat % needed for the ${goals.bodyFatPct}% goal).`,
  };
}
