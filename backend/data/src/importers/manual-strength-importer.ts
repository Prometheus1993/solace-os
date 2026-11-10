import { classifyEquipmentFromName } from '@solace/core';
import { hashHex } from '../hash.ts';
import type { RawStrengthSession, RawStrengthSet } from './strength-import-types.ts';

/**
 * Manual strength-session entry — the athlete logs a gym
 * session by hand as JSON. There is no Garmin-strength importer.
 *
 * `weightKg` is the athlete's own TOTAL weight per set (the post-switch
 * convention: bar included, both dumbbells
 * summed; 0 = bodyweight). Equipment is classified from the free-text exercise
 * NAME (`classifyEquipmentFromName`) so the
 * result feeds the SAME conventions funnel (`buildStrengthSessionInput` in
 * `ingest-pipeline.ts`) — a manual session is not a second correction path.
 */

/** A rep set (reps × total kg) or a hold set (seconds only: plank, dead hang). Exactly one kind. */
export type ManualStrengthSetInput = { reps: number; weightKg: number } | { seconds: number };

/** Hold sets run 1 s to 1 h. */
export const MAX_HOLD_SECONDS = 3600;

export const isHoldSet = (s: ManualStrengthSetInput): s is { seconds: number } => 'seconds' in s;

export interface ManualStrengthExerciseInput {
  name: string;
  sets: ManualStrengthSetInput[];
}

export interface ManualStrengthSessionInput {
  date: string;
  /** Becomes the session's `title` (a manual session has no workout name, so notes fill that role). */
  notes?: string;
  exercises: ManualStrengthExerciseInput[];
}

/** The session title a manual session gets when it has no notes. */
export const MANUAL_STRENGTH_DEFAULT_TITLE = 'Manual strength session';

/** Thrown by {@link validateManualStrengthInput} on any malformed/invalid input. */
export class ManualStrengthValidationError extends Error {}

function fail(message: string): never {
  throw new ManualStrengthValidationError(message);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A REAL calendar date (rejects e.g. "2026-02-30"): re-derive the ISO prefix from a
 * UTC Date and require it to round-trip, same check as the server's `isoOf`. */
function isRealIsoDate(iso: string): boolean {
  if (!ISO_DATE_RE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate the manual-entry shape:
 * `{ date, notes?, exercises: [{ name, sets: [{ reps, weightKg } | { seconds }] }] }`.
 * Throws {@link ManualStrengthValidationError} with a specific message on the first
 * problem found — never returns a partially-valid result. Unknown top-level keys
 * (e.g. a leftover `durationMin`) are silently ignored, not rejected — only the
 * keys named above are ever read off the parsed object.
 */
export function validateManualStrengthInput(raw: unknown): ManualStrengthSessionInput {
  if (!isPlainObject(raw)) fail('Expected a JSON object at the top level.');

  const date = raw['date'];
  if (typeof date !== 'string' || !isRealIsoDate(date)) {
    fail(`"date" must be a real calendar date "YYYY-MM-DD" (got ${JSON.stringify(date)}).`);
  }

  let notes: string | undefined;
  const rawNotes = raw['notes'];
  if (rawNotes !== undefined) {
    if (typeof rawNotes !== 'string') fail('"notes" must be a string when present.');
    const trimmed = rawNotes.trim();
    if (trimmed) notes = trimmed;
  }

  const rawExercises = raw['exercises'];
  if (!Array.isArray(rawExercises) || rawExercises.length === 0) {
    fail('"exercises" must be a non-empty array.');
  }

  const exercises: ManualStrengthExerciseInput[] = rawExercises.map((rawEx: unknown, exIdx: number) => {
    if (!isPlainObject(rawEx)) fail(`exercises[${exIdx}] must be an object.`);
    const name = typeof rawEx['name'] === 'string' ? rawEx['name'].trim() : '';
    if (!name) fail(`exercises[${exIdx}].name must be a non-empty string.`);

    const rawSets = rawEx['sets'];
    if (!Array.isArray(rawSets) || rawSets.length === 0) {
      fail(`exercises[${exIdx}] ("${name}") must have a non-empty "sets" array.`);
    }

    const sets: ManualStrengthSetInput[] = rawSets.map((rawSet: unknown, setIdx: number) => {
      if (!isPlainObject(rawSet)) fail(`exercises[${exIdx}] ("${name}") sets[${setIdx}] must be an object.`);
      if (rawSet['seconds'] !== undefined) {
        if (rawSet['reps'] !== undefined || rawSet['weightKg'] !== undefined) {
          fail(`exercises[${exIdx}] ("${name}") sets[${setIdx}] is either reps + weightKg or seconds, not both.`);
        }
        const seconds = rawSet['seconds'];
        if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_HOLD_SECONDS) {
          fail(`exercises[${exIdx}] ("${name}") sets[${setIdx}].seconds must be a whole number from 1 to ${MAX_HOLD_SECONDS} (got ${JSON.stringify(seconds)}).`);
        }
        return { seconds };
      }
      const reps = rawSet['reps'];
      if (typeof reps !== 'number' || !Number.isInteger(reps) || reps <= 0) {
        fail(`exercises[${exIdx}] ("${name}") sets[${setIdx}].reps must be a positive integer (got ${JSON.stringify(reps)}).`);
      }
      const weightKg = rawSet['weightKg'];
      if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 0) {
        fail(`exercises[${exIdx}] ("${name}") sets[${setIdx}].weightKg must be a number >= 0 (got ${JSON.stringify(weightKg)}).`);
      }
      return { reps, weightKg };
    });

    return { name, sets };
  });

  return {
    date,
    ...(notes !== undefined ? { notes } : {}),
    exercises,
  };
}

/** Stable content for the dedupe hash: date + exercises + sets, in file order. `notes` is
 * metadata, not training content, and is deliberately excluded — annotating an already-logged
 * session must not change its identity or let it re-import as "new". */
function canonicalContent(input: ManualStrengthSessionInput): string {
  return JSON.stringify({
    date: input.date,
    exercises: input.exercises.map((e) => ({
      name: e.name,
      sets: e.sets.map((s) => (isHoldSet(s) ? { seconds: s.seconds } : { reps: s.reps, weightKg: s.weightKg })),
    })),
  });
}

export function manualStrengthSourceHash(input: ManualStrengthSessionInput): string {
  return hashHex(`manual-strength|${canonicalContent(input)}`);
}

/** Build the `RawStrengthSession` the shared conventions funnel expects — same shape an
 * importer produces, so `buildStrengthSessionInput`/`ingestManualStrengthSession`
 * need no manual-entry-specific branch. */
export function toRawStrengthSession(input: ManualStrengthSessionInput): RawStrengthSession {
  const startTimeUtc = Math.floor(Date.parse(`${input.date}T00:00:00Z`) / 1000);
  const sets: RawStrengthSet[] = [];
  for (const ex of input.exercises) {
    const equipment = classifyEquipmentFromName(ex.name);
    for (const s of ex.sets) {
      const hold = isHoldSet(s);
      sets.push({
        exerciseTitleRaw: ex.name,
        exerciseName: ex.name,
        equipment,
        supersetId: null,
        setIndex: null,
        setType: 'normal',
        rawWeight: hold ? null : s.weightKg,
        rawWeightUnit: 'kg',
        reps: hold ? null : s.reps,
        rpe: null,
        distanceMiles: null,
        durationSeconds: hold ? s.seconds : null,
      });
    }
  }
  return {
    title: input.notes ?? MANUAL_STRENGTH_DEFAULT_TITLE,
    startTimeRaw: input.date,
    startTimeUtc,
    sessionDateIso: input.date,
    sourceRowHash: manualStrengthSourceHash(input),
    sets,
  };
}
