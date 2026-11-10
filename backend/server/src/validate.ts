import { BadRequest, type Body } from './http.ts';

// Field coercion for the manual-entry write routes. Lenient by design: a garbage OPTIONAL field becomes
// null and the repo's CHECK constraints are the backstop. The throwing helpers below are for the fields
// where a bad value must be a 400 instead.

export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// A count/quantity (volumes, pages, credits): a non-negative integer, else null (drop the garbage
// rather than store a negative/fractional value the DB has no CHECK for).
export const intNonNeg = (v: unknown): number | null => {
  const n = num(v);
  return n != null && Number.isInteger(n) && n >= 0 ? n : null;
};
// A foreign key (seriesId/volumeId/purchaseId): a positive integer, else null.
export const posInt = (v: unknown): number | null => {
  const n = intNonNeg(v);
  return n != null && n > 0 ? n : null;
};
export const inEnum = <T extends string>(v: unknown, vals: readonly T[]): T | null => (typeof v === 'string' && (vals as readonly string[]).includes(v) ? (v as T) : null);
// A strict boolean flag (deliberated/owned/estimated): true only on the literal `true`,
// anything else (absent, false, a truthy string) is false — never coerced, never a 400.
export const bool = (v: unknown): boolean => v === true;
// Validate a REAL calendar date (not just the digit shape — month 13 / day 99 must be rejected): re-derive
// the ISO prefix from a UTC Date and require it to round-trip.
export const isoOf = (v: unknown): string | null => {
  if (typeof v !== 'string' || !ISO.test(v.slice(0, 10))) return null;
  const iso = v.slice(0, 10);
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
};
// A string[] from a JSON body (e.g. manga genres): keep non-empty strings, trimmed & de-duped.
export const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter((s) => s !== ''))] : [];
// A readingDirection is a tri-state (ltr/rtl/null) that never falls back to a default.
export const readDir = (v: unknown): 'ltr' | 'rtl' | null => (v === 'ltr' || v === 'rtl' ? v : null);

/** A required field: the coerced value, or a 400 with `message` when it came back null. */
export function need<T>(value: T | null, message: string): T {
  if (value == null) throw new BadRequest(message);
  return value;
}

/** `body[key]` as a number within lo–hi; null/absent stays null, out of range is a 400. */
export function ranged(body: Body, key: string, lo: number, hi: number): number | null {
  const n = num(body[key]);
  if (n != null && (n < lo || n > hi)) throw new BadRequest(`${key} must be ${lo}–${hi}`);
  return n;
}

/** A goal field: the key MUST be present; null = reset to the default, otherwise a number within lo–hi
 *  (a string / out-of-range value is a 400, never coerced to null). */
export function goalField(body: Body, key: string, lo: number, hi: number): number | null {
  if (!Object.hasOwn(body, key)) throw new BadRequest(`${key} is required (a number ${lo}–${hi}, or null to reset)`);
  const v = body[key];
  if (v === null) return null;
  const n = num(v);
  if (n == null || n < lo || n > hi) throw new BadRequest(`${key} must be a number ${lo}–${hi} (or null to reset)`);
  return n;
}

/** An optional foreign key: null/absent stays null, anything but a positive integer is a 400. */
export function optPosInt(body: Body, key: string, message = `${key} must be a positive integer`): number | null {
  if (body[key] == null) return null;
  return need(posInt(body[key]), message);
}
