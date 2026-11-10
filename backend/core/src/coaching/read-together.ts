/**
 * Read weight + distance + HR TOGETHER, never in isolation.
 * "You got slower" is wrong if the athlete is also lighter and ran further at a
 * stable HR — the honest read is "lighter, ran further, HR stable, progressing."
 * The reliable efficiency signal is the falling RESTING HR, not noisy pace-vs-HR
 * (corrected error #2). When resting-HR data is thin (early in a Garmin sync, or
 * CSV-only imports), efficiency claims are explicitly low-confidence.
 */
import type { Confidence } from '../domain/types.ts';

export interface ProgressInputs {
  weeklyVolumeKmEarly: number | null;
  weeklyVolumeKmRecent: number | null;
  /** recent − early kg; negative means weight lost. */
  weightChangeKg: number | null;
  weightWeeks: number;
  /** recent − early resting HR; negative means improving. null if <2 resting-HR days. */
  restingHrTrendBpm: number | null;
  avgHrEarly: number | null;
  avgHrRecent: number | null;
}

export interface ProgressNarrative {
  headline: string;
  points: string[];
  confidence: Confidence;
}

const HR_STABLE_BPM = 3;

/** Explicit sign with a real minus (U+2212); zero stays unsigned. */
const signed = (n: number, digits: number): string => {
  const t = Math.abs(n).toFixed(digits);
  return n > 0 ? `+${t}` : n < 0 ? `\u2212${t}` : t;
};

export function interpretProgress(input: ProgressInputs): ProgressNarrative {
  const points: string[] = [];

  const volEarly = input.weeklyVolumeKmEarly;
  const volRecent = input.weeklyVolumeKmRecent;
  const volumeUp = volEarly != null && volRecent != null && volRecent > volEarly + 1;
  // "training at least as much" must NOT fire when volume fell — only when it held or rose (±1 km tolerance).
  const volumeNotDown = volEarly != null && volRecent != null && volRecent >= volEarly - 1;
  if (volEarly != null && volRecent != null) {
    const early = Math.round(volEarly);
    const recent = Math.round(volRecent);
    points.push(`Km/week ${early} → ${recent}${recent > early ? ' ↑' : recent < early ? ' ↓' : ''}`);
  }

  const lighter = input.weightChangeKg != null && input.weightChangeKg < 0;
  const hrStable =
    input.avgHrEarly != null && input.avgHrRecent != null && Math.abs(input.avgHrRecent - input.avgHrEarly) <= HR_STABLE_BPM;

  // The efficiency claim comes ONLY from resting HR.
  if (input.restingHrTrendBpm != null) {
    const d = input.restingHrTrendBpm;
    points.push(`Resting HR ${signed(d, 1)} bpm${d > 0 ? ' ↑' : d < 0 ? ' ↓' : ''}`);
  } else {
    points.push('Resting HR: not enough data yet');
  }

  if (input.weightChangeKg != null) {
    points.push(`Weight ${signed(input.weightChangeKg, 1)} kg`);
  }

  // The read-together headline: structurally refuses a "slower" conclusion.
  let headline: string;
  if (lighter && hrStable && volumeNotDown) {
    headline = 'Lighter, training at least as much, HR stable — that reads as progress, not a regression.';
  } else if (volumeUp) {
    headline = 'Aerobic base is building (volume up).';
  } else {
    headline = 'Steady — keep the easy days easy and let the base build.';
  }

  const noEfficiency = input.restingHrTrendBpm == null;
  const thinWeight = input.weightChangeKg == null || input.weightWeeks < 4;
  const confidence: Confidence = noEfficiency && thinWeight ? 'low' : noEfficiency || thinWeight ? 'medium' : 'high';

  return { headline, points, confidence };
}
