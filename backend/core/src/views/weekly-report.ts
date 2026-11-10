/**
 * Weekly report (STATUS): the last COMPLETED Mon–Sun week next to the week before it. Pure; `asOf` is
 * the injected Clock's local today. Display only — never feeds readiness or the stats. Definitions
 * live in docs/FORMULAS.md ("Weekly report").
 */
import type { RecoveryDay, Run, WeightPoint } from '../domain/types.ts';
import { addDaysIso } from '../domain/dates.ts';
import { round1 } from '../domain/math.ts';
import { lastCompletedWeekRange } from '../coaching/recovery-windows.ts';
import { isLoadedSet, runSpeedMps, setTonnageKg, STRENGTH_FRESH_START, type ScoredStrengthSet } from '../gamification/index.ts';

export type WeeklyDirection = 'up' | 'down' | 'same';

/** One row: both weeks' values (null = no data, never 0) and the direction last week → week before
 * comparison (`up` = last week is higher). Null when either value is missing. */
export interface WeeklyMetric {
  lastWeek: number | null;
  weekBefore: number | null;
  direction: WeeklyDirection | null;
}

export interface WeeklyReport {
  lastWeek: { start: string; end: string; hasData: boolean };
  weekBefore: { start: string; end: string; hasData: boolean };
  runs: WeeklyMetric;
  distanceKm: WeeklyMetric;
  /** min/km, distance-weighted (Σ time ÷ Σ km). */
  paceMinPerKm: WeeklyMetric;
  avgHrBpm: WeeklyMetric;
  strengthSessions: WeeklyMetric;
  /** Tonnage with the same rule as STRENGTH (hold sets excluded). */
  kgLifted: WeeklyMetric;
  hrvMs: WeeklyMetric;
  restingHrBpm: WeeklyMetric;
  sleepScore: WeeklyMetric;
  /** Mean of the week's daily Body Battery readings, nulls skipped (%). */
  bodyBattery: WeeklyMetric;
  /** kg: last weigh-in in the week minus the last weigh-in before the week. */
  weightChangeKg: WeeklyMetric;
}

/** "=" band: a change smaller than 2% of the week-before value reads as the same. */
export const WEEKLY_REL_TOLERANCE = 0.02;
/** Weight change is a delta that sits near 0, so its "=" band is absolute: under 0.1 kg. */
export const WEEKLY_WEIGHT_TOLERANCE_KG = 0.1;

const direction = (last: number | null, before: number | null, absTol?: number): WeeklyDirection | null => {
  if (last == null || before == null) return null;
  const tol = absTol ?? Math.abs(before) * WEEKLY_REL_TOLERANCE;
  const delta = last - before;
  return Math.abs(delta) <= tol ? 'same' : delta > 0 ? 'up' : 'down';
};

const mean = (values: number[]): number | null => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

interface WeekValues {
  runs: number | null;
  distanceKm: number | null;
  paceMinPerKm: number | null;
  avgHrBpm: number | null;
  strengthSessions: number | null;
  kgLifted: number | null;
  hrvMs: number | null;
  restingHrBpm: number | null;
  sleepScore: number | null;
  bodyBattery: number | null;
  weightChangeKg: number | null;
}

interface Inputs {
  runs: ReadonlyArray<Run>;
  sets: ReadonlyArray<ScoredStrengthSet>;
  recoveryDays: ReadonlyArray<RecoveryDay>;
  weights: ReadonlyArray<WeightPoint>;
}

function weekValues(start: string, end: string, { runs, sets, recoveryDays, weights }: Inputs): WeekValues {
  const inWeek = (date: string): boolean => date >= start && date <= end;
  const weekRuns = runs.filter((r) => inWeek(r.startTimeLocal.slice(0, 10)));
  const km = weekRuns.reduce((s, r) => s + r.totalDistanceM / 1000, 0);
  const timed = weekRuns.flatMap((r) => {
    const speed = runSpeedMps(r);
    return speed == null ? [] : [{ km: r.totalDistanceM / 1000, minutes: r.totalDistanceM / speed / 60 }];
  });
  const timedKm = timed.reduce((s, r) => s + r.km, 0);

  const weekSets = sets.filter((s) => inWeek(s.sessionDateIso) && s.sessionDateIso >= STRENGTH_FRESH_START);
  const loaded = weekSets.filter(isLoadedSet);

  const weekDays = recoveryDays.filter((d) => inWeek(d.date));
  const field = (f: 'hrvOvernightMs' | 'restingHrBpm' | 'sleepScore' | 'bodyBattery'): number | null =>
    mean(weekDays.flatMap((d) => (d[f] == null ? [] : [d[f] as number])));

  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const lastIn = [...sorted].reverse().find((w) => inWeek(w.date));
  const lastBefore = [...sorted].reverse().find((w) => w.date < start);

  return {
    runs: weekRuns.length > 0 ? weekRuns.length : null,
    distanceKm: weekRuns.length > 0 ? round1(km) : null,
    paceMinPerKm: timedKm > 0 ? timed.reduce((s, r) => s + r.minutes, 0) / timedKm : null,
    avgHrBpm: mean(weekRuns.flatMap((r) => (r.avgHrBpm == null ? [] : [r.avgHrBpm]))),
    strengthSessions: weekSets.length > 0 ? new Set(weekSets.map((s) => s.sessionDateIso)).size : null,
    kgLifted: loaded.length > 0 ? Math.round(loaded.reduce((s, x) => s + setTonnageKg(x), 0)) : null,
    hrvMs: field('hrvOvernightMs'),
    restingHrBpm: field('restingHrBpm'),
    sleepScore: field('sleepScore'),
    bodyBattery: field('bodyBattery'),
    weightChangeKg: lastIn && lastBefore ? round1(lastIn.weightKg - lastBefore.weightKg) : null,
  };
}

export function buildWeeklyReport(
  asOf: string,
  runs: ReadonlyArray<Run>,
  sets: ReadonlyArray<ScoredStrengthSet>,
  recoveryDays: ReadonlyArray<RecoveryDay>,
  weights: ReadonlyArray<WeightPoint>,
): WeeklyReport {
  const last = lastCompletedWeekRange(asOf);
  const beforeStart = addDaysIso(last.weekStart, -7);
  const beforeEnd = addDaysIso(last.weekStart, -1);
  const inputs: Inputs = { runs, sets, recoveryDays, weights };
  const a = weekValues(last.weekStart, last.weekEnd, inputs);
  const b = weekValues(beforeStart, beforeEnd, inputs);
  const metric = (k: keyof WeekValues, absTol?: number): WeeklyMetric => ({
    lastWeek: a[k],
    weekBefore: b[k],
    direction: direction(a[k], b[k], absTol),
  });
  const hasData = (v: WeekValues): boolean => Object.values(v).some((x) => x != null);
  return {
    lastWeek: { start: last.weekStart, end: last.weekEnd, hasData: hasData(a) },
    weekBefore: { start: beforeStart, end: beforeEnd, hasData: hasData(b) },
    runs: metric('runs'),
    distanceKm: metric('distanceKm'),
    paceMinPerKm: metric('paceMinPerKm'),
    avgHrBpm: metric('avgHrBpm'),
    strengthSessions: metric('strengthSessions'),
    kgLifted: metric('kgLifted'),
    hrvMs: metric('hrvMs'),
    restingHrBpm: metric('restingHrBpm'),
    sleepScore: metric('sleepScore'),
    bodyBattery: metric('bodyBattery'),
    weightChangeKg: metric('weightChangeKg', WEEKLY_WEIGHT_TOLERANCE_KG),
  };
}
