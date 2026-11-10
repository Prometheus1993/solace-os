/**
 * Pure numeric helpers shared across the engine. Kept in the domain (the lowest
 * layer) so any module — domain, coaching, gamification, data — reuses one
 * definition instead of re-declaring the same one-liner. No I/O / Date / random.
 */

/** Round to 1 decimal place. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Round to 2 decimal places. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Clamp `n` into the inclusive range [lo, hi]. */
export const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Clamp to an integer percentage in [0, 100]. */
export const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
