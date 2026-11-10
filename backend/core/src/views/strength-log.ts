// Wire types for the STRENGTH-tab session log (`/api/strength`). Types only; the DashboardDTO is unchanged.

/** A rep set, or a hold set (`{ seconds }`: plank, dead hang; no reps, no load). */
export type StrengthLogSet =
  | {
      reps: number;
      /** The weight as typed (stored `raw_weight`): TOTAL per set, 0 = bodyweight. */
      weightKg: number;
    }
  | { seconds: number };

export interface StrengthLogExercise {
  name: string;
  sets: StrengthLogSet[];
}

export interface StrengthLogSession {
  id: number;
  date: string;
  notes: string | null;
  exercises: StrengthLogExercise[];
}

export interface StrengthLogList {
  sessions: StrengthLogSession[];
}

export interface StrengthLogSaved {
  ok: true;
  status: 'saved' | 'already_logged';
  sessionId: number;
  /** The recomputed STRENGTH stat after a write; null when nothing was written. */
  strength: { value: number; level: number } | null;
}

export interface StrengthLogSameDay {
  ok: false;
  error: 'same_day';
  existingSessionId: number;
  date: string;
}

export type StrengthLogResult = StrengthLogSaved | StrengthLogSameDay;
