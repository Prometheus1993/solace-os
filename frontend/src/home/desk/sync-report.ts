import type { DashboardDTO } from '@solace/core';
import { round1 } from '../../tokens.ts';
import type { StatKey } from './hologram-state.ts';

/** The fields of the `POST /api/sync-garmin` summary the showcase uses (the server sends more). */
export type SyncSummary = { runsImported: number; recoveryDaysWritten: number };

/** What the dashboard said about the body before and after a sync. The summary has no distance, so km is the change in the run total. */
export type SyncSnapshot = { totalRunKm: number; stats: Record<StatKey, { level: number; value: number }> };

export const syncSnapshot = (dto: Pick<DashboardDTO, 'totals' | 'stats'>): SyncSnapshot => ({
  totalRunKm: dto.totals.totalRunKm,
  stats: {
    stamina: { level: dto.stats.stamina.level, value: dto.stats.stamina.value },
    strength: { level: dto.stats.strength.level, value: dto.stats.strength.value },
    leanness: { level: dto.stats.leanness.level, value: dto.stats.leanness.value },
  },
});

export type SyncStatChange = { stat: StatKey; fromLevel: number; toLevel: number; valueDelta: number };
export type SyncReport = { at: Date; runs: number; km: number; wellnessDays: number; statChanges: SyncStatChange[] };

const STAT_ORDER: readonly StatKey[] = ['stamina', 'strength', 'leanness'];

export function buildSyncReport(before: SyncSnapshot, after: SyncSnapshot, summary: SyncSummary, at: Date): SyncReport {
  const statChanges = STAT_ORDER.flatMap((stat): SyncStatChange[] => {
    const from = before.stats[stat], to = after.stats[stat];
    const valueDelta = round1(to.value - from.value);
    return from.level === to.level && valueDelta === 0 ? [] : [{ stat, fromLevel: from.level, toLevel: to.level, valueDelta }];
  });
  return { at, runs: summary.runsImported, km: Math.max(0, round1(after.totalRunKm - before.totalRunKm)), wellnessDays: summary.recoveryDaysWritten, statChanges };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clock = (at: Date) => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

/** `SYNCED 14:32`. */
export const syncStamp = (report: SyncReport): string => `SYNCED ${clock(report.at)}`;

/** One short line per thing the sync brought, in display order; a quiet sync says so. */
export function syncReportLines(report: SyncReport): string[] {
  const lines = [
    report.runs === 0 ? 'NO NEW RUNS' : `${plural(report.runs, 'NEW RUN', 'NEW RUNS')} · +${report.km} KM`,
    report.wellnessDays === 0 ? 'NO NEW WELLNESS DAYS' : plural(report.wellnessDays, 'WELLNESS DAY', 'WELLNESS DAYS'),
  ];
  for (const c of report.statChanges) {
    const name = c.stat.toUpperCase();
    lines.push(c.fromLevel === c.toLevel ? `${name} ${c.valueDelta > 0 ? '+' : '−'}${Math.abs(c.valueDelta)}` : `${name} LV ${c.fromLevel} → ${c.toLevel}`);
  }
  if (report.statChanges.length === 0) lines.push('NO STAT CHANGES');
  return lines;
}
