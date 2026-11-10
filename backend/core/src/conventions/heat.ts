/**
 * Heat correction. Summer raises HR ~5-10 bpm at
 * the same effort. The watch has no temperature reading for these runs, so the
 * temperature comes from a weather API (`backfillRunWeather`). This module turns a temperature
 * into an estimated HR offset that the run classifier subtracts BEFORE judging
 * whether an "easy" run drifted too hard — so heat is not mistaken for fitness loss.
 */

/** Below this apparent temperature, no heat penalty is assumed. */
export const HEAT_NEUTRAL_C = 20;
/** Bpm added per °C above neutral. */
const BPM_PER_DEGREE = 0.5;
/** Cap: heat shifts HR by roughly 5 to 10 bpm. */
export const MAX_HEAT_OFFSET_BPM = 10;

/**
 * Estimated extra bpm attributable to heat at a given apparent temperature.
 * 0 at/below 20°C, ramping to the 10 bpm cap (reached ~40°C).
 */
export function heatHrOffset(apparentTempC: number): number {
  // Guard against sensor/API garbage (NaN, Infinity) leaking into HR math.
  if (!Number.isFinite(apparentTempC) || apparentTempC <= HEAT_NEUTRAL_C) return 0;
  const raw = (apparentTempC - HEAT_NEUTRAL_C) * BPM_PER_DEGREE;
  return Math.min(raw, MAX_HEAT_OFFSET_BPM);
}
