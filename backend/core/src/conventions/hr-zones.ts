/**
 * Heart-rate zones from a configurable max HR (prefer a measured max over 220-age).
 *
 * Percent-of-max model:
 *   Z1 <60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 90-100%.
 * Example at max 190: Z1<114, Z2 114-133, Z3 133-152, Z4 152-171, Z5 171-190.
 *
 * CRITICAL: these boundaries are ESTIMATED from max HR, not measured. The Z3/Z4
 * line (80% of max) is soft — many runs sit right on it. Coaching must hedge near it
 * and never present it as a hard physiological fact. A 20-min threshold test
 * would replace these with measured values.
 */

export type ZoneNumber = 1 | 2 | 3 | 4 | 5;

/** Fraction-of-max lower bounds per zone. */
const ZONE_LOWER_FRACTION: Record<ZoneNumber, number> = { 1: 0, 2: 0.6, 3: 0.7, 4: 0.8, 5: 0.9 };

/** Within this many bpm of the Z3/Z4 line, a classification is "soft". (Used only in this module.) */
const SOFT_TOLERANCE_BPM = 3;

const lowerBound = (zone: ZoneNumber, maxHr: number): number =>
  zone === 1 ? 0 : Math.round(ZONE_LOWER_FRACTION[zone] * maxHr);

export interface HrClassification {
  zone: ZoneNumber;
  /** True when the HR sits within SOFT_TOLERANCE_BPM of the soft Z3/Z4 line. */
  isSoftBoundary: boolean;
}

export function classifyHr(hr: number, maxHr: number): HrClassification {
  const z2 = lowerBound(2, maxHr);
  const z3 = lowerBound(3, maxHr);
  const z4 = lowerBound(4, maxHr);
  const z5 = lowerBound(5, maxHr);

  let zone: ZoneNumber;
  if (hr >= z5) zone = 5;
  else if (hr >= z4) zone = 4;
  else if (hr >= z3) zone = 3;
  else if (hr >= z2) zone = 2;
  else zone = 1;

  return { zone, isSoftBoundary: Math.abs(hr - z4) <= SOFT_TOLERANCE_BPM };
}

/** The soft Z3/Z4 line (lower bound of Z4) in bpm — the much-debated estimate coaching hedges near. */
export const z3z4LineBpm = (maxHr: number): number => lowerBound(4, maxHr);
