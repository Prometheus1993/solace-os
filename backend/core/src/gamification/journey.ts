/**
 * The journey of each stat track since its fresh start, read from the append-only stat history.
 * Display only: the start reading plus one point per day, so a UI can show how far a stat moved.
 */
import type { StatHistoryEntry, StatName } from '../domain/types.ts';
import { LEANNESS_FRESH_START, STRENGTH_FRESH_START } from './goals.ts';

export interface StatJourney {
  /** Date of the first reading on/after the track's fresh start. */
  sinceDate: string;
  startValue: number;
  startLevel: number;
  /** One point per day (that day's last reading), oldest first, at most the newest JOURNEY_MAX_POINTS. */
  points: Array<{ date: string; value: number }>;
}

export type JourneyView = Record<'stamina' | 'strength' | 'leanness', StatJourney | null>;

export const JOURNEY_MAX_POINTS = 40;

/** STAMINA has no reset: its journey starts at its first reading. */
const TRACKS: Array<{ key: keyof JourneyView; stat: StatName; freshStart: string }> = [
  { key: 'stamina', stat: 'STAMINA', freshStart: '' },
  { key: 'strength', stat: 'STRENGTH', freshStart: STRENGTH_FRESH_START },
  { key: 'leanness', stat: 'LEANNESS', freshStart: LEANNESS_FRESH_START },
];

export function computeJourney(history: ReadonlyArray<StatHistoryEntry>): JourneyView {
  const view: JourneyView = { stamina: null, strength: null, leanness: null };
  for (const { key, stat, freshStart } of TRACKS) {
    const rows = history
      .filter((e) => e.stat === stat && e.date >= freshStart)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const first = rows[0];
    if (!first) continue;
    const lastOfDay = new Map<string, number>();
    for (const e of rows) lastOfDay.set(e.date, e.value);
    const points = [...lastOfDay.entries()].map(([date, value]) => ({ date, value })).slice(-JOURNEY_MAX_POINTS);
    view[key] = { sinceDate: first.date, startValue: first.value, startLevel: first.level, points };
  }
  return view;
}
