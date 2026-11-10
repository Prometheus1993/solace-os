/**
 * Rolling recovery windows. Recovery signals are only meaningful over multiple
 * days, so a single bad night must NEVER gate a session.
 * We use ~7-day windows for HRV / sleep / body battery, ~3-day for resting HR,
 * skipping nulls (CSV exports have gaps; the Garmin MCP now supplies resting-HR +
 * body battery) and reporting coverage so the coach can hedge when data is thin.
 */
import type { Confidence, RecoveryDay } from '../domain/types.ts';
import { addDaysIso, isoWeekStart, withinWindow } from '../domain/dates.ts';

const HRV_WINDOW_DAYS = 7;
const SLEEP_WINDOW_DAYS = 7;
const RESTING_HR_WINDOW_DAYS = 3;
const BODY_BATTERY_WINDOW_DAYS = 7;

export interface RecoveryWindow {
  /** Mean of available values, or null when the window has no data. */
  value: number | null;
  /** Number of days that contributed a value. */
  nDays: number;
  windowDays: number;
  /** nDays / windowDays. */
  coverage: number;
  confidence: Confidence;
}

type NumericField = 'hrvOvernightMs' | 'sleepScore' | 'restingHrBpm' | 'bodyBattery';

function rollingAverage(
  days: ReadonlyArray<RecoveryDay>,
  asOf: string,
  field: NumericField,
  windowDays: number,
): RecoveryWindow {
  const values: number[] = [];
  for (const day of days) {
    if (!withinWindow(day.date, asOf, windowDays)) continue;
    const v = day[field];
    if (v != null) values.push(v);
  }
  const nDays = values.length;
  const value = nDays > 0 ? values.reduce((a, b) => a + b, 0) / nDays : null;
  const coverage = nDays / windowDays;
  const confidence: Confidence = coverage >= 0.7 ? 'high' : coverage >= 0.4 ? 'medium' : 'low';
  return { value, nDays, windowDays, coverage, confidence };
}

export const rollingHrv = (days: ReadonlyArray<RecoveryDay>, asOf: string): RecoveryWindow =>
  rollingAverage(days, asOf, 'hrvOvernightMs', HRV_WINDOW_DAYS);

export const rollingSleep = (days: ReadonlyArray<RecoveryDay>, asOf: string): RecoveryWindow =>
  rollingAverage(days, asOf, 'sleepScore', SLEEP_WINDOW_DAYS);

export const rollingRestingHr = (days: ReadonlyArray<RecoveryDay>, asOf: string): RecoveryWindow =>
  rollingAverage(days, asOf, 'restingHrBpm', RESTING_HR_WINDOW_DAYS);

/** Morning body battery, rolling 7-day. Stored for display; not (yet) a gate input. */
export const rollingBodyBattery = (days: ReadonlyArray<RecoveryDay>, asOf: string): RecoveryWindow =>
  rollingAverage(days, asOf, 'bodyBattery', BODY_BATTERY_WINDOW_DAYS);

/** The last COMPLETED Mon–Sun week's per-field averages — the Home "weekly overview" card. This is
 * DISPLAY ONLY (never fed to the readiness gate, unlike the rolling windows above). */
export interface RecoveryWeekAverage {
  weekStart: string;
  weekEnd: string;
  hrv: number | null;
  sleep: number | null;
  restingHr: number | null;
  bodyBattery: number | null;
  /** Days (of the 7) that carried AT LEAST ONE reading in any field — not per-field. */
  nDays: number;
}

/** The Mon–Sun week immediately PRECEDING `asOf`'s own ISO week (`isoWeekStart`). On any day of a
 * given week — including its own Monday or Sunday — this returns the prior week, so callers roll
 * over automatically at midnight every Monday with no stored state. Shared by
 * `lastCompletedRecoveryWeek` below and `views/dashboard.ts`'s `coachContext`/`lastWeekCompliance`
 * so "last completed week" means the same 7 days everywhere it's used. */
export function lastCompletedWeekRange(asOf: string): { weekStart: string; weekEnd: string } {
  const thisWeekMonday = isoWeekStart(asOf);
  return { weekStart: addDaysIso(thisWeekMonday, -7), weekEnd: addDaysIso(thisWeekMonday, -1) };
}

/** Resolve the Mon–Sun week PRECEDING `asOf`'s own ISO week (`isoWeekStart`). On any day of a
 * given week — including its own Monday or Sunday — this returns the prior week, so the card
 * rolls over automatically at midnight every Monday with no stored state. */
export function lastCompletedRecoveryWeek(days: ReadonlyArray<RecoveryDay>, asOf: string): RecoveryWeekAverage {
  const { weekStart, weekEnd } = lastCompletedWeekRange(asOf);
  const weekDays = days.filter((d) => d.date >= weekStart && d.date <= weekEnd);

  const avg = (field: NumericField): number | null => {
    const values: number[] = [];
    for (const d of weekDays) {
      const v = d[field];
      if (v != null) values.push(v);
    }
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const daysWithAnyReading = new Set(
    weekDays.filter((d) => d.hrvOvernightMs != null || d.sleepScore != null || d.restingHrBpm != null || d.bodyBattery != null).map((d) => d.date),
  );

  return {
    weekStart,
    weekEnd,
    hrv: avg('hrvOvernightMs'),
    sleep: avg('sleepScore'),
    restingHr: avg('restingHrBpm'),
    bodyBattery: avg('bodyBattery'),
    nDays: daysWithAnyReading.size,
  };
}
