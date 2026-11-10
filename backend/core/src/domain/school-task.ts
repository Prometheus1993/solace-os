import type { SchoolTask } from './types.ts';
import { diffDays } from './dates.ts';

/** Days until the deadline (negative once passed). Pure over `today` (the injected clock's date). */
export function schoolTaskDaysUntil(t: Pick<SchoolTask, 'deadline'>, today: string): number {
  return diffDays(today, t.deadline);
}

/** Overdue = still open and the deadline is before today. A done task is never overdue. */
export function schoolTaskOverdue(t: Pick<SchoolTask, 'done' | 'deadline'>, today: string): boolean {
  return !t.done && t.deadline < today;
}

/**
 * Open tasks first by deadline ascending (title as the tie-break); done tasks after, most recently
 * finished first. Returns a new array.
 */
export function sortSchoolTasks<T extends Pick<SchoolTask, 'done' | 'deadline' | 'doneDate' | 'title'>>(tasks: ReadonlyArray<T>): T[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.done) return a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title);
    return (b.doneDate ?? b.deadline).localeCompare(a.doneDate ?? a.deadline) || a.title.localeCompare(b.title);
  });
}
