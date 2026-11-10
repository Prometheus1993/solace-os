import { DEFAULT_CONFIG, type Clock, type UnixSeconds } from '@solace/core';
import { describe, expect, it } from 'vitest';
import {
  deleteLoggedStrengthSession,
  listLoggedStrengthSessions,
  logStrengthSession,
  migrate,
  openDatabase,
  SqliteRepository,
  type ManualStrengthSessionInput,
} from '../src/index.ts';

const clock: Clock = { now: () => 0 as UnixSeconds, today: () => '2026-10-20' };

const session = (over: Partial<ManualStrengthSessionInput> = {}): ManualStrengthSessionInput => ({
  date: '2026-10-06',
  notes: 'Push day',
  exercises: [
    { name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }, { reps: 5, weightKg: 100 }] },
    { name: 'Lat Pulldown', sets: [{ reps: 12, weightKg: 70 }] },
  ],
  ...over,
});

async function setup() {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new SqliteRepository(db);
  await repo.saveAthleteConfig(DEFAULT_CONFIG);
  return { repo };
}

describe('logStrengthSession (new)', () => {
  it('saves, then reports a repeat as already_logged, a different same-day session as same_day, and allowSameDay saves', async () => {
    const { repo } = await setup();
    const first = await logStrengthSession(repo, clock, session());
    expect(first.status).toBe('saved');
    expect(await repo.getStrengthSessions()).toHaveLength(1);

    const again = await logStrengthSession(repo, clock, session({ notes: 'renamed' }));
    expect(again).toMatchObject({ status: 'already_logged' });
    expect(await repo.getStrengthSessions()).toHaveLength(1);

    const other = session({ exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 120 }] }] });
    const clash = await logStrengthSession(repo, clock, other);
    expect(clash).toMatchObject({ status: 'same_day', date: '2026-10-06' });
    expect(await repo.getStrengthSessions()).toHaveLength(1);

    expect((await logStrengthSession(repo, clock, other, { allowSameDay: true })).status).toBe('saved');
    expect(await repo.getStrengthSessions()).toHaveLength(2);
  });

  it('refuses future, pre-reset and out-of-bounds input without writing anything', async () => {
    const { repo } = await setup();
    expect(await logStrengthSession(repo, clock, session({ date: '2026-10-21' }))).toEqual({ status: 'refused', reason: 'future_date' });
    expect(await logStrengthSession(repo, clock, session({ date: '2026-06-21' }))).toEqual({ status: 'refused', reason: 'before_reset' });
    const heavy = session({ exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weightKg: 501 }] }] });
    expect(await logStrengthSession(repo, clock, heavy)).toEqual({ status: 'refused', reason: 'bounds' });
    const reps = session({ exercises: [{ name: 'Bench Press', sets: [{ reps: 101, weightKg: 50 }] }] });
    expect(await logStrengthSession(repo, clock, reps)).toEqual({ status: 'refused', reason: 'bounds' });
    expect(await repo.getStrengthSessions()).toHaveLength(0);
    expect(await repo.getStrengthSets()).toHaveLength(0);
  });
});

describe('logStrengthSession (replace)', () => {
  it('swaps the sets and a notes-only edit rewrites the title', async () => {
    const { repo } = await setup();
    const saved = await logStrengthSession(repo, clock, session());
    if (saved.status !== 'saved') throw new Error('setup');

    const edited = session({ exercises: [{ name: 'Squat', sets: [{ reps: 3, weightKg: 140 }] }] });
    const r = await logStrengthSession(repo, clock, edited, { replaceId: saved.sessionId });
    expect(r.status).toBe('saved');
    const sets = await repo.getStrengthSets();
    expect(sets.map((s) => s.exerciseName)).toEqual(['Squat']);
    expect(await repo.getStrengthSessions()).toHaveLength(1);

    const notesOnly = await logStrengthSession(repo, clock, { ...edited, notes: 'Leg day' }, { replaceId: (await repo.getStrengthSessions())[0]!.id });
    expect(notesOnly.status).toBe('saved');
    expect((await repo.getStrengthSessions())[0]!.title).toBe('Leg day');
    expect(await repo.getStrengthSets()).toHaveLength(1);
  });

  it('refuses to move a session onto an occupied day, leaving the original untouched', async () => {
    const { repo } = await setup();
    const a = await logStrengthSession(repo, clock, session({ date: '2026-10-06' }));
    const b = await logStrengthSession(repo, clock, session({ date: '2026-10-08', exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }] }] }));
    if (a.status !== 'saved' || b.status !== 'saved') throw new Error('setup');

    const move = await logStrengthSession(repo, clock, session({ date: '2026-10-06', exercises: [{ name: 'Squat', sets: [{ reps: 6, weightKg: 100 }] }] }), {
      replaceId: b.sessionId,
    });
    expect(move).toMatchObject({ status: 'same_day', existingSessionId: a.sessionId });
    const squat = (await repo.getStrengthSets()).filter((s) => s.exerciseName === 'Squat');
    expect(squat.map((s) => s.reps)).toEqual([5]);
  });

  it('edits one of a legitimate same-day pair in place without a same_day confirm', async () => {
    const { repo } = await setup();
    const a = await logStrengthSession(repo, clock, session());
    const b = await logStrengthSession(repo, clock, session({ exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 120 }] }] }), { allowSameDay: true });
    if (a.status !== 'saved' || b.status !== 'saved') throw new Error('setup');
    const edit = await logStrengthSession(repo, clock, session({ exercises: [{ name: 'Squat', sets: [{ reps: 6, weightKg: 120 }] }] }), { replaceId: b.sessionId });
    expect(edit.status).toBe('saved');
    expect(await repo.getStrengthSessions()).toHaveLength(2);
  });

  it('reports already_logged when the new content matches another session, deleting nothing', async () => {
    const { repo } = await setup();
    const a = await logStrengthSession(repo, clock, session({ date: '2026-10-06' }));
    const b = await logStrengthSession(repo, clock, session({ date: '2026-10-08', exercises: [{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }] }] }));
    if (a.status !== 'saved' || b.status !== 'saved') throw new Error('setup');

    const r = await logStrengthSession(repo, clock, session({ date: '2026-10-06' }), { replaceId: b.sessionId });
    expect(r).toEqual({ status: 'already_logged', sessionId: a.sessionId });
    expect(await repo.getStrengthSessions()).toHaveLength(2);
    expect((await repo.getStrengthSets()).some((s) => s.exerciseName === 'Squat')).toBe(true);
  });

  it('404-style refusal for an unknown id', async () => {
    const { repo } = await setup();
    expect(await logStrengthSession(repo, clock, session(), { replaceId: 999 })).toEqual({ status: 'refused', reason: 'not_found' });
  });
});

describe('deleteLoggedStrengthSession', () => {
  it('removes the session, its sets', async () => {
    const { repo } = await setup();
    const saved = await logStrengthSession(repo, clock, session());
    if (saved.status !== 'saved') throw new Error('setup');

    expect(await deleteLoggedStrengthSession(repo, clock, saved.sessionId)).toEqual({ status: 'deleted' });
    expect(await repo.getStrengthSessions()).toHaveLength(0);
    expect(await repo.getStrengthSets()).toHaveLength(0);
    expect(await deleteLoggedStrengthSession(repo, clock, saved.sessionId)).toEqual({ status: 'refused', reason: 'not_found' });
  });

  it('refuses an archived (pre-reset) session', async () => {
    const { repo } = await setup();
    const old = await repo.saveStrengthSession({
      session: { sourceRowHash: 'old', title: 'Archive', startTimeUtc: Math.floor(Date.parse('2026-01-05T00:00:00Z') / 1000), pre2022: false, loggingConvention: 'total_weight' },
      sets: [],
    });
    expect(await deleteLoggedStrengthSession(repo, clock, old.session.id)).toEqual({ status: 'refused', reason: 'archived' });
    expect(await logStrengthSession(repo, clock, session(), { replaceId: old.session.id })).toEqual({ status: 'refused', reason: 'archived' });
    expect(await repo.getStrengthSessions()).toHaveLength(1);
  });
});

describe('listLoggedStrengthSessions', () => {
  it('round-trips what was typed, newest first, folding consecutive same-name sets and nulling the default title', async () => {
    const { repo } = await setup();
    await logStrengthSession(repo, clock, {
      date: '2026-10-06',
      exercises: [
        { name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }] },
        { name: 'Bench Press', sets: [{ reps: 8, weightKg: 80 }] },
        { name: 'Pull-Up', sets: [{ reps: 10, weightKg: 0 }] },
      ],
    });
    await logStrengthSession(repo, clock, session({ date: '2026-10-13' }));
    const list = await listLoggedStrengthSessions(repo);
    expect(list.map((s) => s.date)).toEqual(['2026-10-13', '2026-10-06']);
    expect(list[0]!.notes).toBe('Push day');
    expect(list[1]!.notes).toBeNull();
    expect(list[1]!.exercises).toEqual([
      { name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }, { reps: 8, weightKg: 80 }] },
      { name: 'Pull-Up', sets: [{ reps: 10, weightKg: 0 }] },
    ]);
  });
});

describe('hold sets ({ seconds })', () => {
  const planked = (seconds = 60): ManualStrengthSessionInput =>
    session({
      notes: 'Core',
      exercises: [
        { name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }] },
        { name: 'Plank', sets: [{ seconds }, { seconds }, { seconds }] },
      ],
    });

  it('saves seconds with no reps/load, and lists them back as { seconds }', async () => {
    const { repo } = await setup();
    const saved = await logStrengthSession(repo, clock, planked());
    expect(saved.status).toBe('saved');

    const plank = (await repo.getStrengthSets()).filter((s) => s.exerciseName === 'Plank');
    expect(plank).toHaveLength(3);
    for (const s of plank) {
      expect(s).toMatchObject({ durationSeconds: 60, reps: null, rawWeight: null, realLoadKg: null, weightKgNormalized: null, excludedFromTrend: true });
    }
    const loaded = (await repo.getStrengthSets()).filter((s) => s.exerciseName === 'Bench Press');
    expect(loaded.every((s) => s.durationSeconds === null && !s.excludedFromTrend)).toBe(true);

    const [listed] = await listLoggedStrengthSessions(repo);
    expect(listed!.exercises).toEqual([
      { name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }] },
      { name: 'Plank', sets: [{ seconds: 60 }, { seconds: 60 }, { seconds: 60 }] },
    ]);
  });

  it('a hold-only session logs, keeps STRENGTH at LV0 (no tonnage, no points)', async () => {
    const { repo } = await setup();
    const onlyHold = session({ exercises: [{ name: 'Dead Hang', sets: [{ seconds: 45 }] }] });
    const r = await logStrengthSession(repo, clock, onlyHold);
    expect(r).toMatchObject({ status: 'saved', strength: { value: 0, level: 0 } });
  });

  it('hold sets add nothing to the STRENGTH value of the same session', async () => {
    const a = await setup();
    const withHold = await logStrengthSession(a.repo, clock, planked());
    const b = await setup();
    const without = await logStrengthSession(b.repo, clock, session({ notes: 'Core', exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weightKg: 100 }] }] }));
    if (withHold.status !== 'saved' || without.status !== 'saved') throw new Error('setup');
    expect(withHold.strength).toEqual(without.strength);
  });

  it('edits seconds in place (replace) and deletes the session with its hold sets', async () => {
    const { repo } = await setup();
    const saved = await logStrengthSession(repo, clock, planked(60));
    if (saved.status !== 'saved') throw new Error('setup');

    const edited = await logStrengthSession(repo, clock, planked(90), { replaceId: saved.sessionId });
    if (edited.status !== 'saved') throw new Error('edit');
    const [listed] = await listLoggedStrengthSessions(repo);
    expect(listed!.exercises[1]).toEqual({ name: 'Plank', sets: [{ seconds: 90 }, { seconds: 90 }, { seconds: 90 }] });

    expect(await deleteLoggedStrengthSession(repo, clock, edited.sessionId)).toEqual({ status: 'deleted' });
    expect(await repo.getStrengthSets()).toHaveLength(0);
  });
});
