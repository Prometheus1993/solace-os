import type { DashboardMission } from '@solace/core';

// Pure notification planning: which notifications are due now, and which were already shown. No Electron.

export interface Note {
  /** Stable id: a note with a key that was already shown is not shown again. */
  key: string;
  title: string;
  body: string;
}

export type MissionDay = Pick<DashboardMission, 'id' | 'course' | 'examDate' | 'daysUntil' | 'resitDate' | 'resitDaysUntil'>;

/** Exam and resit notes go out in the morning only: 06:00 up to 12:00 local time. */
export function isMorning(hour: number): boolean {
  return hour >= 6 && hour < 12;
}

/** One note per exam or resit that is today (the server already derived the day counts). */
export function examNotes(missions: readonly MissionDay[]): Note[] {
  const notes: Note[] = [];
  for (const m of missions) {
    if (m.daysUntil === 0) notes.push({ key: `exam:${m.id}:${m.examDate}`, title: 'Exam today', body: m.course });
    if (m.resitDaysUntil === 0) notes.push({ key: `resit:${m.id}:${m.resitDate}`, title: 'Resit today', body: m.course });
  }
  return notes;
}

/** A Garmin login lasts about 6 months; warn from 5.5 months (165 days) after the token store was written. */
export const TOKEN_WARN_AGE_MS = 165 * 24 * 60 * 60 * 1000;

/** `mtimeMs` = modification time of the token store, or null when there is none (Garmin not set up). */
export function tokenReauthDue(mtimeMs: number | null, nowMs: number): boolean {
  return mtimeMs !== null && nowMs - mtimeMs >= TOKEN_WARN_AGE_MS;
}

export const GARMIN_REAUTH_BODY = 'Sign in to Garmin again: see README, "Garmin sync".';

export interface PlanInput {
  /** Missions from `GET /api/dashboard`. */
  missions: readonly MissionDay[];
  /** Local date `YYYY-MM-DD`. */
  today: string;
  /** Local hour 0-23. */
  hour: number;
  tokenMtimeMs: number | null;
  nowMs: number;
  /** Keys returned as `notified` by the previous plan. */
  notified: readonly string[];
}

/**
 * Everything due now minus what was already shown. `notified` is the full set of due keys: store it and pass it
 * back next time. Keys that are no longer due drop out, so the list never grows. The token note repeats once a day.
 */
export function planNotifications(input: PlanInput): { show: Note[]; notified: string[] } {
  const due = isMorning(input.hour) ? examNotes(input.missions) : [];
  if (tokenReauthDue(input.tokenMtimeMs, input.nowMs)) {
    due.push({ key: `garmin-token:${input.today}`, title: 'Garmin login expires soon', body: GARMIN_REAUTH_BODY });
  }
  return { show: due.filter((n) => !input.notified.includes(n.key)), notified: due.map((n) => n.key) };
}
