import { DEFAULT_GOALS, type StoredGoals } from '../domain/athlete-config.ts';

/**
 * Targets (single-user), editable in VITALS and stored in athlete_config. They calibrate LEANNESS and
 * the goal-quests. Core stays pure: callers pass the resolved goals in. A goal the athlete has not set
 * falls back to the neutral DEFAULT_GOALS.
 */
export interface GoalValues {
  weightKg: number;
  bodyFatPct: number;
  paceMinPerKm: number;
  weeklyKm: number;
}

/** One goal as the UI sees it: the value in force + whether the athlete set it (else it is the default). */
export interface GoalField {
  value: number;
  userSet: boolean;
}
export type GoalsView = Record<keyof GoalValues, GoalField>;

/** Stored goals (null = unset) → the values in force. No argument = all defaults. */
export function resolveGoals(stored?: StoredGoals): GoalValues {
  return {
    weightKg: stored?.weightKg ?? DEFAULT_GOALS.weightKg,
    bodyFatPct: stored?.bodyFatPct ?? DEFAULT_GOALS.bodyFatPct,
    paceMinPerKm: stored?.paceMinPerKm ?? DEFAULT_GOALS.paceMinPerKm,
    weeklyKm: stored?.weeklyKm ?? DEFAULT_GOALS.weeklyKm,
  };
}

export function goalsView(stored: StoredGoals): GoalsView {
  const v = resolveGoals(stored);
  const f = (k: keyof GoalValues): GoalField => ({ value: v[k], userSet: stored[k] != null });
  return { weightKg: f('weightKg'), bodyFatPct: f('bodyFatPct'), paceMinPerKm: f('paceMinPerKm'), weeklyKm: f('weeklyKm') };
}

/** LEANNESS LV100: target fat mass in kg = goal weight × goal body-fat %. */
export const targetFatMassKg = (g: GoalValues): number => g.weightKg * (g.bodyFatPct / 100);

/** Fixed pace rungs, slowest → fastest (min/km). The pace quest targets the next unreached rung. */
const PACE_RUNGS: ReadonlyArray<number> = [8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0];

/** Fixed weekly-volume rungs, ascending (km/wk). */
const WEEKLY_KM_RUNGS: ReadonlyArray<number> = [10, 15, 20, 30, 40, 50];

/** Pace ladder for a goal: the fixed rungs strictly slower than the goal, then the goal as the last rung. */
export function paceLadder(goalMinPerKm: number): number[] {
  return [...PACE_RUNGS.filter((r) => r > goalMinPerKm), goalMinPerKm];
}

/** Weekly-volume ladder for a goal: the fixed rungs strictly below the goal, then the goal as the last rung. */
export function weeklyKmLadder(goalKm: number): number[] {
  return [...WEEKLY_KM_RUNGS.filter((r) => r < goalKm), goalKm];
}

/** Where the bar sits at 0% for the FIRST pace rung (no previous rung to measure from). */
export const PACE_LADDER_FLOOR = 9.0;

export interface LadderStep {
  /** The next unreached rung (the last rung when all are reached). */
  next: number;
  /** The rung below it, or null when `next` is the first rung. */
  prev: number | null;
  /** True when every rung is already reached. */
  allReached: boolean;
}

/**
 * Next unreached rung + previous rung. `lowerIsBetter` (pace): a rung is reached when
 * value <= rung; otherwise (volume) when value >= rung. Exactly on a rung = reached.
 * `rungs` must be ordered from easiest to hardest.
 */
export function ladderStep(rungs: ReadonlyArray<number>, value: number, lowerIsBetter: boolean): LadderStep {
  const reached = (r: number): boolean => (lowerIsBetter ? value <= r : value >= r);
  const i = rungs.findIndex((r) => !reached(r));
  if (i === -1) return { next: rungs[rungs.length - 1]!, prev: rungs.length > 1 ? rungs[rungs.length - 2]! : null, allReached: true };
  return { next: rungs[i]!, prev: i > 0 ? rungs[i - 1]! : null, allReached: false };
}

/** Strength restart: the STRENGTH stat counts only sessions on/after this date,
 * so earlier history doesn't inflate it. Configurable here in code. */
export const STRENGTH_FRESH_START = '2026-06-22';

/** Leanness restart: the LEANNESS progress fraction anchors to the earliest weigh-in
 * on/after this date, not the whole history — so an earlier weigh-in doesn't
 * distort the "how far have you come" mirror. Configurable here in code. */
export const LEANNESS_FRESH_START = '2026-05-29';
