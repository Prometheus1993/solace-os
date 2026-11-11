import { describe, expect, it } from 'vitest';
import { examNotes, isMorning, planNotifications, tokenReauthDue, TOKEN_WARN_AGE_MS, type MissionDay, type PlanInput } from '../src/notifications.ts';

const mission = (over: Partial<MissionDay>): MissionDay => ({
  id: 1,
  course: 'Statistics',
  examDate: '2026-01-12',
  daysUntil: 5,
  resitDate: null,
  resitDaysUntil: null,
  ...over,
});

const NOW = Date.UTC(2026, 0, 12, 8);
const input = (over: Partial<PlanInput>): PlanInput => ({
  missions: [],
  today: '2026-01-12',
  hour: 8,
  tokenMtimeMs: null,
  nowMs: NOW,
  notified: [],
  ...over,
});

describe('isMorning', () => {
  it('is 06:00 up to 12:00', () => {
    expect([5, 6, 11, 12].map(isMorning)).toEqual([false, true, true, false]);
  });
});

describe('examNotes', () => {
  it('notes an exam that is today and skips other days', () => {
    expect(examNotes([mission({ daysUntil: 0 }), mission({ id: 2, daysUntil: 1 }), mission({ id: 3, daysUntil: -1 })])).toEqual([
      { key: 'exam:1:2026-01-12', title: 'Exam today', body: 'Statistics' },
    ]);
  });
  it('notes a resit that is today', () => {
    expect(examNotes([mission({ daysUntil: -200, resitDate: '2026-08-20', resitDaysUntil: 0 })])).toEqual([
      { key: 'resit:1:2026-08-20', title: 'Resit today', body: 'Statistics' },
    ]);
  });
});

describe('tokenReauthDue', () => {
  it('is due from 165 days after the token store was written', () => {
    expect(tokenReauthDue(NOW - TOKEN_WARN_AGE_MS + 1, NOW)).toBe(false);
    expect(tokenReauthDue(NOW - TOKEN_WARN_AGE_MS, NOW)).toBe(true);
  });
  it('is never due without a token store', () => {
    expect(tokenReauthDue(null, NOW)).toBe(false);
  });
});

describe('planNotifications', () => {
  const examToday = [mission({ daysUntil: 0 })];
  it('shows an exam note in the morning, once', () => {
    const first = planNotifications(input({ missions: examToday }));
    expect(first.show.map((n) => n.key)).toEqual(['exam:1:2026-01-12']);
    const second = planNotifications(input({ missions: examToday, notified: first.notified }));
    expect(second.show).toEqual([]);
    expect(second.notified).toEqual(first.notified);
  });
  it('shows no exam note outside the morning', () => {
    expect(planNotifications(input({ missions: examToday, hour: 14 })).show).toEqual([]);
  });
  it('shows the token note at any hour, again on the next day, and drops old keys', () => {
    const old = NOW - TOKEN_WARN_AGE_MS;
    const day1 = planNotifications(input({ hour: 20, tokenMtimeMs: old }));
    expect(day1.show.map((n) => n.key)).toEqual(['garmin-token:2026-01-12']);
    expect(planNotifications(input({ hour: 21, tokenMtimeMs: old, notified: day1.notified })).show).toEqual([]);
    const day2 = planNotifications(input({ today: '2026-01-13', tokenMtimeMs: old, notified: day1.notified }));
    expect(day2.show.map((n) => n.key)).toEqual(['garmin-token:2026-01-13']);
    expect(day2.notified).toEqual(['garmin-token:2026-01-13']);
  });
  it('shows nothing when nothing is due', () => {
    expect(planNotifications(input({ missions: [mission({})], tokenMtimeMs: NOW }))).toEqual({ show: [], notified: [] });
  });
});
