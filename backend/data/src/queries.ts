import { unixToIsoDate, type Repository, type ScoredStrengthSet } from '@solace/core';

/**
 * Join strength sets to their session date, producing the recency-aware input
 * the gamification engine needs (current vs peak loads). Kept out of the
 * Repository interface — it is a read-side convenience over existing queries.
 */
export async function scoredStrengthSets(repo: Repository): Promise<ScoredStrengthSet[]> {
  const [sessions, sets] = await Promise.all([repo.getStrengthSessions(), repo.getStrengthSets()]);
  const dateById = new Map(sessions.map((s) => [s.id, unixToIsoDate(s.startTimeUtc)]));
  return sets.map((s) => ({
    exerciseName: s.exerciseName,
    equipment: s.equipment,
    realLoadKg: s.realLoadKg,
    reps: s.reps,
    durationSeconds: s.durationSeconds,
    excludedFromTrend: s.excludedFromTrend,
    sessionDateIso: dateById.get(s.sessionId) ?? '0000-00-00',
  }));
}
