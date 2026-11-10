/**
 * Deterministic ISO-date helpers (no Date.now / argless new Date). All math is
 * done in UTC on "YYYY-MM-DD" strings so windows are reproducible in tests.
 */

const dateOnly = (iso: string): string => iso.slice(0, 10);

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${dateOnly(iso)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (to - from). */
export function diffDays(from: string, to: string): number {
  const a = new Date(`${dateOnly(from)}T00:00:00Z`).getTime();
  const b = new Date(`${dateOnly(to)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** True when `date` falls in the last `windowDays` days ending at `asOf` (inclusive). */
export function withinWindow(date: string, asOf: string, windowDays: number): boolean {
  const start = addDaysIso(asOf, -(windowDays - 1));
  const d = dateOnly(date);
  return d >= start && d <= dateOnly(asOf);
}

export function unixToIsoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

const MONDAY_EPOCH = '1969-12-29'; // a Monday — anchors ISO-week math deterministically (no Date weekday call)

/** Monday (UTC) of the ISO week containing `iso`, as YYYY-MM-DD. Used by the recovery windows and coachContext. */
export function isoWeekStart(iso: string): string {
  const back = ((diffDays(MONDAY_EPOCH, iso) % 7) + 7) % 7;
  return addDaysIso(iso, -back);
}
