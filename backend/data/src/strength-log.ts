import {
  STRENGTH_FRESH_START,
  unixToIsoDate,
  type Clock,
  type Repository,
  type StrengthLogExercise,
  type StrengthLogSession,
} from '@solace/core';
import { ingestManualStrengthSession } from './ingest-pipeline.ts';
import {
  MANUAL_STRENGTH_DEFAULT_TITLE,
  isHoldSet,
  toRawStrengthSession,
  type ManualStrengthSessionInput,
} from './importers/manual-strength-importer.ts';
import { recomputeStats } from './recompute-service.ts';

// The STRENGTH-tab session log: the web path onto the SAME funnel every strength import uses
// (validate → conventions → hash dedupe → same-day guard → recompute), plus list / replace / delete.

/** Web-path sanity bounds: a fat-finger would otherwise write a permanent level_up row. */
export const MAX_WEIGHT_KG = 500;
export const MAX_REPS = 100;

export type LogStrengthResult =
  | { status: 'saved'; sessionId: number; strength: { value: number; level: number } }
  | { status: 'already_logged'; sessionId: number }
  | { status: 'same_day'; existingSessionId: number; date: string }
  | { status: 'refused'; reason: 'future_date' | 'before_reset' | 'bounds' | 'not_found' | 'archived' };

export interface LogStrengthOptions {
  allowSameDay?: boolean;
  /** Edit: replace this session instead of adding a new one. */
  replaceId?: number | undefined;
}

/** Every post-reset session, newest first, with consecutive same-name sets folded into one exercise. */
export async function listLoggedStrengthSessions(repo: Repository): Promise<StrengthLogSession[]> {
  const [sessions, sets] = await Promise.all([repo.getStrengthSessions(), repo.getStrengthSets()]);
  const setsBySession = new Map<number, typeof sets>();
  for (const s of sets) {
    const bucket = setsBySession.get(s.sessionId);
    if (bucket) bucket.push(s);
    else setsBySession.set(s.sessionId, [s]);
  }
  const out: StrengthLogSession[] = [];
  for (const session of sessions) {
    const date = unixToIsoDate(session.startTimeUtc);
    if (date < STRENGTH_FRESH_START) continue;
    const exercises: StrengthLogExercise[] = [];
    for (const s of setsBySession.get(session.id) ?? []) {
      const set = s.durationSeconds != null && s.reps == null ? { seconds: s.durationSeconds } : { reps: s.reps ?? 0, weightKg: s.rawWeight ?? 0 };
      const last = exercises.at(-1);
      if (last && last.name === s.exerciseName) last.sets.push(set);
      else exercises.push({ name: s.exerciseName, sets: [set] });
    }
    out.push({ id: session.id, date, notes: session.title === MANUAL_STRENGTH_DEFAULT_TITLE ? null : session.title, exercises });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

/** Log (or, with `replaceId`, edit) one session. Never throws for a caller mistake; recomputes once per actual write. */
export async function logStrengthSession(
  repo: Repository,
  clock: Clock,
  input: ManualStrengthSessionInput,
  opts: LogStrengthOptions = {},
): Promise<LogStrengthResult> {
  const { allowSameDay = false, replaceId } = opts;
  if (input.date > clock.today()) return { status: 'refused', reason: 'future_date' };
  if (input.date < STRENGTH_FRESH_START) return { status: 'refused', reason: 'before_reset' };
  for (const ex of input.exercises) {
    for (const s of ex.sets) {
      if (!isHoldSet(s) && (s.weightKg > MAX_WEIGHT_KG || s.reps > MAX_REPS)) return { status: 'refused', reason: 'bounds' };
    }
  }

  const raw = toRawStrengthSession(input);

  if (replaceId === undefined) {
    const r = await ingestManualStrengthSession(repo, raw, { allowSameDay });
    if (r.sameDayConflict) return { status: 'same_day', ...r.sameDayConflict };
    if (r.alreadyImported && r.session) return { status: 'already_logged', sessionId: r.session.id };
    return { status: 'saved', sessionId: r.session!.id, strength: (await recomputeStats(repo, clock)).strength };
  }

  const sessions = await repo.getStrengthSessions();
  const target = sessions.find((s) => s.id === replaceId);
  if (!target) return { status: 'refused', reason: 'not_found' };
  if (unixToIsoDate(target.startTimeUtc) < STRENGTH_FRESH_START) return { status: 'refused', reason: 'archived' };

  // Probe the funnel without writing: it yields the corrected input and tells us if this content already exists.
  const probe = await ingestManualStrengthSession(repo, raw, { dryRun: true, allowSameDay: true });
  if (probe.alreadyImported && probe.session && probe.session.id !== replaceId) {
    return { status: 'already_logged', sessionId: probe.session.id };
  }
  // Only a date CHANGE can collide: editing one of a legitimate same-day pair must not demand a confirm.
  if (!allowSameDay && input.date !== unixToIsoDate(target.startTimeUtc)) {
    const clash = sessions.find((s) => s.id !== replaceId && unixToIsoDate(s.startTimeUtc) === input.date);
    if (clash) return { status: 'same_day', existingSessionId: clash.id, date: input.date };
  }
  const { session } = await repo.replaceStrengthSession(replaceId, probe.sessionInput);
  return { status: 'saved', sessionId: session.id, strength: (await recomputeStats(repo, clock)).strength };
}

/** Delete a post-reset session and recompute once. */
export async function deleteLoggedStrengthSession(
  repo: Repository,
  clock: Clock,
  id: number,
): Promise<{ status: 'deleted' } | { status: 'refused'; reason: 'not_found' | 'archived' }> {
  const target = (await repo.getStrengthSessions()).find((s) => s.id === id);
  if (!target) return { status: 'refused', reason: 'not_found' };
  if (unixToIsoDate(target.startTimeUtc) < STRENGTH_FRESH_START) return { status: 'refused', reason: 'archived' };
  await repo.deleteStrengthSession(id);
  await recomputeStats(repo, clock);
  return { status: 'deleted' };
}
