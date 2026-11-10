import type { DashboardDTO } from '@solace/core';

/** Distinct course names of the school tasks ('Unsorted' for none), sorted. */
export const courseNames = (tasks: DashboardDTO['schoolTasks']) =>
  [...new Set(tasks.map(task => task.course ?? 'Unsorted'))].sort((a, b) => a.localeCompare(b));
