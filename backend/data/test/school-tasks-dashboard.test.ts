import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type Clock, type UnixSeconds } from '@solace/core';
import { assembleDashboard, migrate, openDatabase, SqliteRepository } from '../src/index.ts';

const clockOn = (today: string): Clock => ({ now: () => 0 as UnixSeconds, today: () => today });

describe('DashboardDTO.schoolTasks (wired via assembleDashboard)', () => {
  it('lists stored tasks with derived daysUntil/overdue, open first by deadline, then done', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const r = new SqliteRepository(db);
    await r.saveAthleteConfig(DEFAULT_CONFIG);
    await r.addSchoolTask({ title: 'Later', kind: 'task', deadline: '2026-11-20', course: null, notes: null, done: false, doneDate: null });
    await r.addSchoolTask({ title: 'Late', kind: 'other', deadline: '2026-11-01', course: null, notes: null, done: false, doneDate: null });
    await r.addSchoolTask({ title: 'Finished', kind: 'company_visit', deadline: '2026-10-01', course: 'Internship', notes: null, done: true, doneDate: '2026-10-02' });

    const dto = await assembleDashboard(r, clockOn('2026-11-05'));
    expect(dto!.schoolTasks.map((t) => [t.title, t.daysUntil, t.overdue, t.done])).toEqual([
      ['Late', -4, true, false],
      ['Later', 15, false, false],
      ['Finished', -35, false, true],
    ]);
  });
});
