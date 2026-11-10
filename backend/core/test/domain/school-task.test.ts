import { describe, expect, it } from 'vitest';
import { type SchoolTask, schoolTaskDaysUntil, schoolTaskOverdue, sortSchoolTasks } from '../../src/index.ts';

const t = (over: Partial<SchoolTask>): SchoolTask => ({ id: 0, title: 'T', kind: 'task', deadline: '2026-07-01', course: null, notes: null, done: false, doneDate: null, createdAt: 0, ...over });

describe('school task derived helpers (pure over an injected today)', () => {
  it('daysUntil is signed: future positive, today 0, past negative', () => {
    expect(schoolTaskDaysUntil(t({ deadline: '2026-06-24' }), '2026-06-21')).toBe(3);
    expect(schoolTaskDaysUntil(t({ deadline: '2026-06-21' }), '2026-06-21')).toBe(0);
    expect(schoolTaskDaysUntil(t({ deadline: '2026-06-20' }), '2026-06-21')).toBe(-1);
  });

  it('overdue = open and deadline strictly before today; due today is not overdue; done is never overdue', () => {
    expect(schoolTaskOverdue(t({ deadline: '2026-06-20' }), '2026-06-21')).toBe(true);
    expect(schoolTaskOverdue(t({ deadline: '2026-06-21' }), '2026-06-21')).toBe(false);
    expect(schoolTaskOverdue(t({ deadline: '2026-06-20', done: true, doneDate: '2026-06-19' }), '2026-06-21')).toBe(false);
  });

  it('sorts open tasks by deadline asc (title tie-break) and puts done tasks after, latest finished first', () => {
    const sorted = sortSchoolTasks([
      t({ id: 1, title: 'B', deadline: '2026-07-05' }),
      t({ id: 2, title: 'D1', deadline: '2026-06-01', done: true, doneDate: '2026-05-30' }),
      t({ id: 3, title: 'A', deadline: '2026-07-05' }),
      t({ id: 4, title: 'C', deadline: '2026-06-30' }),
      t({ id: 5, title: 'D2', deadline: '2026-06-02', done: true, doneDate: '2026-06-02' }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual([4, 3, 1, 5, 2]);
  });

  it('does not mutate its input', () => {
    const input = [t({ id: 1, deadline: '2026-07-05' }), t({ id: 2, deadline: '2026-06-01' })];
    sortSchoolTasks(input);
    expect(input.map((x) => x.id)).toEqual([1, 2]);
  });
});
