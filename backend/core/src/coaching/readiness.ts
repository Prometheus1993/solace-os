/**
 * Daily readiness gate. The difference between a dumb plan and a real coach:
 * check recovery BEFORE prescribing hard work. Judges TODAY's HRV, sleep, and
 * resting HR against the athlete's baseline — a bad night shows up the same
 * morning, not diluted 1/7th across a week. Falls back to the rolling window,
 * per signal, when today has no reading yet (e.g. before the morning sync) —
 * and degrades confidence a step when it does, since the call then rests on a
 * diluted average instead of fresh data.
 */
import type { AthleteConfig } from '../domain/athlete-config.ts';
import type { Confidence } from '../domain/types.ts';
import type { RecoveryWindow } from './recovery-windows.ts';

export type ReadinessRecommendation = 'go_hard' | 'go_easy' | 'rest';

export interface ReadinessResult {
  recommendation: ReadinessRecommendation;
  rationale: string[];
  confidence: Confidence;
}

export interface RecoverySnapshot {
  hrv: RecoveryWindow;
  sleep: RecoveryWindow;
  restingHr: RecoveryWindow;
  /** Morning body battery (rolling). Surfaced in the UI; not a gate input yet. */
  bodyBattery: RecoveryWindow;
  /** Today's raw readings (the `recovery_days` row for `asOf`), null per field when there is no
   * row yet (e.g. before the morning sync) or the row doesn't carry that field. The gate below
   * reads these FIRST, falling back to the matching rolling window above per signal. */
  today: {
    hrv: number | null;
    sleep: number | null;
    restingHr: number | null;
    bodyBattery: number | null;
  };
}

/** Below 92% of the HRV baseline counts as suppressed. */
const HRV_LOW_FRACTION = 0.92;
const POOR_SLEEP_SCORE = 55;
const ELEVATED_RHR_DELTA = 5;

const worst = (a: Confidence, b: Confidence): Confidence => {
  const order: Confidence[] = ['low', 'medium', 'high'];
  return order[Math.min(order.indexOf(a), order.indexOf(b))] as Confidence;
};

/** One step worse: high -> medium -> low -> low (low has no lower step). */
const degrade = (c: Confidence): Confidence => (c === 'high' ? 'medium' : 'low');

type SignalSource = 'today' | 'window' | 'none';

/** A single recovery signal resolved to either today's raw reading or the rolling-window
 * fallback, plus which of the two it came from (drives both the rationale text and the
 * confidence degradation below). 'none' means neither today nor the window has a value —
 * not a fallback that happened, just no data at all. */
interface ResolvedSignal {
  value: number | null;
  source: SignalSource;
}

function resolveSignal(todayValue: number | null, window: RecoveryWindow): ResolvedSignal {
  if (todayValue != null) return { value: todayValue, source: 'today' };
  return { value: window.value, source: window.value != null ? 'window' : 'none' };
}

export function dailyReadiness(snapshot: RecoverySnapshot, config: AthleteConfig): ReadinessResult {
  const { hrv, sleep, restingHr, today } = snapshot;
  const rationale: string[] = [];

  const hrvSignal = resolveSignal(today.hrv, hrv);
  const sleepSignal = resolveSignal(today.sleep, sleep);
  const rhrSignal = resolveSignal(today.restingHr, restingHr);

  if (hrvSignal.value == null && sleepSignal.value == null) {
    return {
      recommendation: 'go_easy',
      rationale: ['No HRV or sleep data yet'],
      confidence: 'low',
    };
  }

  const hrvLow = hrvSignal.value != null && hrvSignal.value < config.hrvBaselineMs * HRV_LOW_FRACTION;
  const sleepPoor = sleepSignal.value != null && sleepSignal.value < POOR_SLEEP_SCORE;
  const rhrElevated = rhrSignal.value != null && rhrSignal.value > config.restingHrBaseline + ELEVATED_RHR_DELTA;

  if (hrvLow) {
    rationale.push(`HRV low${hrvSignal.source === 'today' ? '' : ' (7-day avg)'}: ${hrvSignal.value!.toFixed(0)} (normal ~${Math.round(config.hrvBaselineMs)})`);
  }
  if (sleepPoor) {
    rationale.push(`Sleep score low${sleepSignal.source === 'today' ? '' : ' (7-day avg)'}: ${sleepSignal.value!.toFixed(0)} (below ${POOR_SLEEP_SCORE})`);
  }
  if (rhrElevated) {
    rationale.push(`Resting HR high${rhrSignal.source === 'today' ? '' : ' (3-day avg)'}: ${rhrSignal.value!.toFixed(0)} (normal ~${Math.round(config.restingHrBaseline)})`);
  }

  let recommendation: ReadinessRecommendation;
  if (hrvLow && sleepPoor) {
    recommendation = rhrElevated ? 'rest' : 'go_easy';
  } else if (hrvLow || sleepPoor || rhrElevated) {
    recommendation = 'go_easy';
  } else {
    recommendation = 'go_hard';
  }

  // Confidence starts from the WINDOWS that back up whichever value was used: HRV + sleep
  // always, and resting HR when it drove a go-easy/rest (it's the soft signal the baseline
  // says to hedge on) — unchanged from before today's reading was factored in.
  let confidence = worst(hrv.confidence, sleep.confidence);
  if (rhrElevated) confidence = worst(confidence, restingHr.confidence);

  // Any contributing signal that had no reading for today and fell back to its rolling window
  // degrades confidence one more step: the call now rests (at least partly) on a diluted average
  // instead of a fresh reading.
  const fellBackToWindow =
    hrvSignal.source === 'window' || sleepSignal.source === 'window' || (rhrElevated && rhrSignal.source === 'window');
  if (fellBackToWindow) {
    confidence = degrade(confidence);
  }

  return { recommendation, rationale, confidence };
}
