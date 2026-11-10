/**
 * Classify a single run's intensity, heat-corrected. Over-calling "too
 * much Z4" on soft zone estimates, without accounting for heat, is a known
 * pitfall. So: subtract the heat offset BEFORE judging, hedge
 * near the soft Z3/Z4 line, and emit a FLAG (not a verdict).
 */
import type { Confidence, Run } from '../domain/types.ts';
import { unixToIsoDate } from '../domain/dates.ts';
import { classifyHr, z3z4LineBpm, type ZoneNumber } from '../conventions/hr-zones.ts';
import { heatHrOffset } from '../conventions/heat.ts';

export type RunLabel = 'easy' | 'moderate' | 'hard';

export interface RunRead {
  runId: number;
  date: string;
  distanceKm: number;
  avgHrBpm: number | null;
  temperatureC: number | null;
  heatOffsetBpm: number;
  adjustedAvgHr: number | null;
  zone: ZoneNumber | null;
  label: RunLabel | null;
  /** "Easy" run that (heat-adjusted) still sat in Z4 — flagged, not condemned. */
  driftFlag: boolean;
  reasons: string[];
  confidence: Confidence;
}

const labelForZone = (zone: ZoneNumber): RunLabel => (zone <= 2 ? 'easy' : zone === 3 ? 'moderate' : 'hard');

export function classifyRun(run: Run, maxHr: number): RunRead {
  const date = unixToIsoDate(run.startTimeUtc);
  const distanceKm = run.totalDistanceM / 1000;

  if (run.avgHrBpm == null) {
    return {
      runId: run.id,
      date,
      distanceKm,
      avgHrBpm: null,
      temperatureC: run.correctedTemperatureC,
      heatOffsetBpm: 0,
      adjustedAvgHr: null,
      zone: null,
      label: null,
      driftFlag: false,
      reasons: ['No average HR on this run — cannot classify intensity.'],
      confidence: 'low',
    };
  }

  const heatOffsetBpm = run.correctedTemperatureC != null ? heatHrOffset(run.correctedTemperatureC) : 0;
  const adjustedAvgHr = run.avgHrBpm - heatOffsetBpm;
  const c = classifyHr(adjustedAvgHr, maxHr);
  const label = labelForZone(c.zone);
  const driftFlag = c.zone >= 4;

  const reasons: string[] = [];
  // Display a self-consistent subtraction: round the offset and derive the shown adjusted HR from THAT
  // (avg − roundedOffset), so the text never reads e.g. "150 heat-adjusted to 148 (−3 bpm)". The precise
  // `adjustedAvgHr` above is still what drives the zone classification. Gate on the ROUNDED value so a
  // sub-0.5 offset (apparent temp just over 20°C) falls through to the plain line, never "(−0 bpm)".
  const shownOffset = Math.round(heatOffsetBpm);
  if (shownOffset > 0) {
    reasons.push(
      `Avg HR ${run.avgHrBpm}; heat-adjusted to ${run.avgHrBpm - shownOffset} ` +
        `(−${shownOffset} bpm for ${run.correctedTemperatureC?.toFixed(0)}°C).`,
    );
  } else {
    reasons.push(`Avg HR ${run.avgHrBpm}.`);
  }
  reasons.push(
    c.isSoftBoundary
      ? `Lands in Z${c.zone}, right on the soft ~${z3z4LineBpm(maxHr)} Z3/Z4 line — estimated from max HR, not a hard verdict.`
      : `Lands in Z${c.zone}.`,
  );
  if (driftFlag) {
    reasons.push('FLAG: even heat-adjusted, the average sits in Z4. If this was meant to be easy, it ran hot — check fatigue/heat before drawing conclusions.');
  }

  return {
    runId: run.id,
    date,
    distanceKm,
    avgHrBpm: run.avgHrBpm,
    temperatureC: run.correctedTemperatureC,
    heatOffsetBpm,
    adjustedAvgHr,
    zone: c.zone,
    label,
    driftFlag,
    confidence: c.isSoftBoundary ? 'low' : 'medium',
    reasons,
  };
}
