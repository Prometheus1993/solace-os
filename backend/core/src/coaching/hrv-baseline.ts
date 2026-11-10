/**
 * Self-referenced HRV baseline. `readiness.ts`'s `dailyReadiness` compares today's HRV
 * against a STATIC `config.hrvBaselineMs * 0.92` — a number the athlete typed in once,
 * that never adapts. This module is the literature-conforming alternative: a rolling,
 * self-referenced baseline built ONLY from this athlete's own history. It does not wire
 * into `readiness.ts` in this pass — that's a later, deliberate decision, not an oversight.
 *
 * Big caveat, load-bearing for how this must be used: Garmin's overnight wrist-PPG HRV is
 * NOT the morning supine ECG/chest-strap RMSSD the HRV-guided-training literature actually
 * used (Kiviniemi, Vesterinen, Nuuttila, Javaloyes) — independent comparisons put wrist-PPG
 * vs ECG around ~10.5% MAPE, vs ~2% for a chest strap. So an absolute published threshold
 * must NEVER be applied to these numbers; only a SELF-referenced comparison (same device,
 * same person, this athlete's own rolling baseline) is defensible, which is exactly what
 * this module computes. Further caveats that also must never be papered over:
 *   - Düking et al. 2021 (JSAMS meta-analysis) found only a small, non-significant effect of
 *     HRV-guided training on performance (g=0.079) — this signal must never be used to
 *     auto-escalate difficulty, only to flag caution.
 *   - HRV can RISE with functional overreaching (Plews) — a high reading is not permission
 *     to push harder, it's ambiguous at best.
 */
import type { RecoveryDay } from '../domain/types.ts';
import { withinWindow } from '../domain/dates.ts';

/** ~4 weeks of calendar time before a rolling baseline means anything — also the default
 * `baselineWindowDays` below, so the constant actually governs behaviour, not just docs. */
export const MIN_BASELINE_DAYS = 28;
/** Below this many usable readings inside the baseline window, the baseline stays `ready: false`
 * regardless of how many calendar days have elapsed (a gappy export is not a real baseline). */
export const MIN_BASELINE_READINGS = 20;

const DEFAULT_SHORT_WINDOW_DAYS = 7;

export interface HrvBaseline {
  /** Rolling mean of ln(HRV overnight ms) over the SHORT window. */
  mean: number | null;
  /** Between-day SD of ln(HRV overnight ms) over the BASELINE window. */
  sd: number | null;
  /** Smallest worthwhile change: 0.5 * sd (Hopkins convention). */
  swc: number | null;
  /** Usable (non-null, positive) readings inside the BASELINE window. */
  nReadings: number;
  ready: boolean;
}

/** ln(HRV) for the non-null, positive readings within `windowDays` of `asOf`. Nulls (no
 * reading that day) and non-positive values (a device fault; ln is undefined at/below 0) are
 * skipped outright rather than coerced — a skipped day must never leak a NaN into the mean. */
function lnReadings(days: ReadonlyArray<RecoveryDay>, asOf: string, windowDays: number): number[] {
  const values: number[] = [];
  for (const day of days) {
    if (!withinWindow(day.date, asOf, windowDays)) continue;
    const v = day.hrvOvernightMs;
    if (v == null || v <= 0) continue;
    values.push(Math.log(v));
  }
  return values;
}

const mean = (values: ReadonlyArray<number>): number | null => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** Sample standard deviation (n-1, Bessel's correction) — undefined for fewer than 2 points. */
function sampleStdDev(values: ReadonlyArray<number>, m: number): number | null {
  if (values.length < 2) return null;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function hrvBaseline(
  days: ReadonlyArray<RecoveryDay>,
  asOf: string,
  shortWindowDays: number = DEFAULT_SHORT_WINDOW_DAYS,
  baselineWindowDays: number = MIN_BASELINE_DAYS,
): HrvBaseline {
  const shortValues = lnReadings(days, asOf, shortWindowDays);
  const baselineValues = lnReadings(days, asOf, baselineWindowDays);

  const nReadings = baselineValues.length;
  const ready = nReadings >= MIN_BASELINE_READINGS;

  const baselineMean = mean(baselineValues);
  const sd = baselineMean != null ? sampleStdDev(baselineValues, baselineMean) : null;
  const swc = sd != null ? sd * 0.5 : null;

  return {
    mean: mean(shortValues),
    sd,
    swc,
    nReadings,
    ready,
  };
}

/** Self-referenced flag for a single day's raw HRV reading. Deliberately switches ITSELF off
 * (`'unknown'`) rather than guessing — an under-baselined athlete, a missing reading, or a
 * non-positive/faulty value all return `'unknown'`, never a false `'normal'`/`'low'`. */
export function hrvFlag(todayMs: number | null, baseline: HrvBaseline): 'normal' | 'low' | 'unknown' {
  if (todayMs == null || todayMs <= 0) return 'unknown';
  if (!baseline.ready || baseline.mean == null || baseline.swc == null) return 'unknown';
  const lnToday = Math.log(todayMs);
  return lnToday < baseline.mean - baseline.swc ? 'low' : 'normal';
}
