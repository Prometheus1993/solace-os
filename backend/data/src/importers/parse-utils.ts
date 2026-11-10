/** Shared importer parsing helpers (ISO dates). */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Format AND calendar validity: rejects 2026-02-31, 2026-13-01, etc. Uses explicit UTC
 * parts (deterministic — no "now"), so a rollover is detectable. */
export function isRealIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
