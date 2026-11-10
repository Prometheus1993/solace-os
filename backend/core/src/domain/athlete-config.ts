/**
 * Athlete configuration + neutral example defaults.
 *
 * The defaults are placeholders for a fresh install, not real data: `seed` writes
 * them only when no config exists, and the athlete edits them afterwards. The
 * values that drive coaching (maxHr, convention dates, units) are configurable on
 * purpose — the engine must recompute when they change rather than bake them in.
 */

/** Reference strength loads (real, corrected kg). */
export interface StrengthReference {
  /** Barbell bench press, total kg incl. bar. */
  benchPressKg: number;
  /** Dumbbell incline press, total of both dumbbells. */
  dbInclineKg: number;
  /** Lat pulldown (machine, as-logged). */
  latPulldownKg: number;
}

/** The four editable targets as stored: null = never set, the neutral default applies (see goals.ts). */
export interface StoredGoals {
  weightKg: number | null;
  bodyFatPct: number | null;
  paceMinPerKm: number | null;
  weeklyKm: number | null;
}

/** Neutral example targets used for every goal the athlete has not set. */
export const DEFAULT_GOALS = { weightKg: 75, bodyFatPct: 15, paceMinPerKm: 6.0, weeklyKm: 30 } as const;

export interface AthleteConfig {
  age: number;
  heightCm: number | null;
  /** False until the height has been checked; nothing critical depends on it yet. */
  heightConfirmed: boolean;
  /** Measured max heart rate; prefer a measured value over an age formula (220-age). */
  maxHr: number;
  restingHrBaseline: number;
  hrvBaselineMs: number;
  /** Load conventions only apply from this date; earlier data is not comparable. */
  hevyConventionStart: string;
  /**
   * The athlete switched to logging TOTAL weight from the first session after
   * this date. Sessions strictly after it skip the +20/x2 correction.
   */
  hevyTotalWeightSwitchDate: string;
  /** Fallback for heat lookup when a run has no GPS. */
  homeLat: number | null;
  homeLon: number | null;
  /** "You were here once" quest targets. */
  peakLoads: StrengthReference;
  /** Editable targets (VITALS); calibrate LEANNESS and the goal-quests. */
  goals: StoredGoals;
}

export const DEFAULT_CONFIG: AthleteConfig = {
  age: 30,
  heightCm: 175,
  heightConfirmed: false,
  maxHr: 190,
  restingHrBaseline: 60,
  hrvBaselineMs: 50,
  hevyConventionStart: '2022-01-01',
  hevyTotalWeightSwitchDate: '2026-04-04',
  homeLat: null,
  homeLon: null,
  peakLoads: { benchPressKg: 80, dbInclineKg: 30, latPulldownKg: 60 },
  goals: { weightKg: null, bodyFatPct: null, paceMinPerKm: null, weeklyKm: null },
};

/** The example shoe to seed on a fresh install (no mileage yet). */
export const DEFAULT_SHOE = {
  model: 'Example running shoe',
  priorCountedKm: 0,
  notes: 'Example shoe; edit the model and starting distance. Runs logged are added on top.',
} as const;
