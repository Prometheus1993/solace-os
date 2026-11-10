import type { Equipment } from '@solace/core';

/** Generic raw strength set, shared by every strength importer (manual entry today). */
export interface RawStrengthSet {
  exerciseTitleRaw: string;
  supersetId: string | null;
  setIndex: number | null;
  setType: string;
  rawWeight: number | null;
  rawWeightUnit: 'kg' | 'lbs';
  reps: number | null;
  rpe: number | null;
  distanceMiles: number | null;
  durationSeconds: number | null;
  /** Pre-classified equipment/name (no "(Equipment)" tag). */
  equipment?: Equipment;
  exerciseName?: string;
}

export interface RawStrengthSession {
  title: string;
  startTimeRaw: string;
  startTimeUtc: number;
  sessionDateIso: string;
  sourceRowHash: string;
  sets: RawStrengthSet[];
}
