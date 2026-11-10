/**
 * Compose every recovery + run + progress signal into one dated coaching report.
 * Pure and deterministic: it takes plain domain data + config + an asOf date and
 * returns a structured report with explicit confidence on each claim, so the
 * coach can explain itself and never over-states a soft estimate.
 */
import type { AthleteConfig } from '../domain/athlete-config.ts';
import type { RecoveryDay, Run, WeightPoint } from '../domain/types.ts';
import { diffDays, unixToIsoDate } from '../domain/dates.ts';
import { rollingBodyBattery, rollingHrv, rollingRestingHr, rollingSleep, type RecoveryWindow } from './recovery-windows.ts';
import { dailyReadiness, type ReadinessResult, type RecoverySnapshot } from './readiness.ts';
import { classifyRun, type RunRead } from './run-classifier.ts';
import { interpretProgress, type ProgressNarrative } from './read-together.ts';

export interface CoachingModel {
  asOf: string;
  runs: Run[];
  recoveryDays: RecoveryDay[];
  weightPoints: WeightPoint[];
}

export interface DriftTrend {
  flaggedRecent: number;
  consideredRecent: number;
  note: string;
}

export interface CoachingReport {
  date: string;
  readiness: ReadinessResult;
  recovery: RecoverySnapshot;
  recentRunReads: RunRead[];
  driftTrend: DriftTrend;
  progress: ProgressNarrative;
}

const RECENT_RUN_COUNT = 5;

const byTime = (a: Run, b: Run): number => a.startTimeUtc - b.startTimeUtc;

interface HalfStats {
  weeklyKm: number | null;
  avgHr: number | null;
}

function halfStats(runs: Run[]): HalfStats {
  if (runs.length === 0) return { weeklyKm: null, avgHr: null };
  const km = runs.reduce((sum, r) => sum + r.totalDistanceM / 1000, 0);
  const first = unixToIsoDate(runs[0]!.startTimeUtc);
  const last = unixToIsoDate(runs[runs.length - 1]!.startTimeUtc);
  const weeks = Math.max(1, diffDays(first, last) / 7);
  const hrs = runs.map((r) => r.avgHrBpm).filter((h): h is number => h != null);
  const avgHr = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null;
  return { weeklyKm: km / weeks, avgHr };
}

function restingHrTrend(days: RecoveryDay[]): number | null {
  const withRhr = days.filter((d) => d.restingHrBpm != null).sort((a, b) => a.date.localeCompare(b.date));
  if (withRhr.length < 2) return null;
  const mid = Math.floor(withRhr.length / 2);
  const mean = (xs: RecoveryDay[]) => xs.reduce((a, b) => a + (b.restingHrBpm as number), 0) / xs.length;
  return mean(withRhr.slice(mid)) - mean(withRhr.slice(0, mid));
}

export function buildCoachingReport(model: CoachingModel, config: AthleteConfig): CoachingReport {
  const { asOf, recoveryDays, weightPoints } = model;
  const runs = [...model.runs].sort(byTime);

  const todayDay = recoveryDays.find((d) => d.date === asOf);
  const recovery: RecoverySnapshot = {
    hrv: rollingHrv(recoveryDays, asOf),
    sleep: rollingSleep(recoveryDays, asOf),
    restingHr: rollingRestingHr(recoveryDays, asOf),
    bodyBattery: rollingBodyBattery(recoveryDays, asOf),
    today: {
      hrv: todayDay?.hrvOvernightMs ?? null,
      sleep: todayDay?.sleepScore ?? null,
      restingHr: todayDay?.restingHrBpm ?? null,
      bodyBattery: todayDay?.bodyBattery ?? null,
    },
  };
  const readiness = dailyReadiness(recovery, config);

  const recentRunReads = runs.slice(-RECENT_RUN_COUNT).map((r) => classifyRun(r, config.maxHr));
  const considered = recentRunReads.filter((r) => r.zone != null);
  const flaggedRecent = considered.filter((r) => r.driftFlag).length;
  const driftTrend: DriftTrend = {
    flaggedRecent,
    consideredRecent: considered.length,
    note:
      considered.length === 0
        ? 'No HR data on recent runs to judge drift.'
        : considered.length >= 3 && flaggedRecent >= Math.ceil(considered.length / 2)
          ? 'Pattern: several recent easy-ish runs ran into Z4 even after heat correction — ease the easy days and check recovery.'
          : 'Drift flags are isolated, not a pattern — train on.',
  };

  // Progress: split runs into earlier vs recent halves.
  const mid = Math.floor(runs.length / 2);
  const early = halfStats(runs.slice(0, mid));
  const recent = halfStats(runs.slice(mid));

  const sortedWeights = [...weightPoints].sort((a, b) => a.date.localeCompare(b.date));
  let weightChangeKg: number | null = null;
  let weightWeeks = 0;
  if (sortedWeights.length >= 2) {
    const first = sortedWeights[0]!;
    const last = sortedWeights[sortedWeights.length - 1]!;
    weightChangeKg = last.weightKg - first.weightKg;
    weightWeeks = Math.max(1, diffDays(first.date, last.date) / 7);
  }

  const progress = interpretProgress({
    weeklyVolumeKmEarly: early.weeklyKm,
    weeklyVolumeKmRecent: recent.weeklyKm,
    weightChangeKg,
    weightWeeks,
    restingHrTrendBpm: restingHrTrend(recoveryDays),
    avgHrEarly: early.avgHr,
    avgHrRecent: recent.avgHr,
  });

  return { date: asOf, readiness, recovery, recentRunReads, driftTrend, progress };
}

export type { RecoveryWindow };
