import { describe, expect, it } from 'vitest';
import { buildSyncReport, syncReportLines, syncSnapshot, syncStamp, type SyncSnapshot } from './sync-report.ts';

const snap = (km: number, stamina: [number, number], strength: [number, number] = [20, 20.4], leanness: [number, number] = [40, 40.1]): SyncSnapshot => ({
  totalRunKm: km,
  stats: {
    stamina: { level: stamina[0], value: stamina[1] },
    strength: { level: strength[0], value: strength[1] },
    leanness: { level: leanness[0], value: leanness[1] },
  },
});
const at = new Date(2026, 10, 13, 9, 5);

describe('sync report', () => {
  it('lists new runs with the km added, wellness days and a level-up', () => {
    const r = buildSyncReport(snap(243.9, [31, 31.2]), snap(255.3, [32, 32.0]), { runsImported: 2, recoveryDaysWritten: 3 }, at);
    expect(r).toMatchObject({ runs: 2, km: 11.4, wellnessDays: 3 });
    expect(r.statChanges).toEqual([{ stat: 'stamina', fromLevel: 31, toLevel: 32, valueDelta: 0.8 }]);
    expect(syncReportLines(r)).toEqual(['2 NEW RUNS · +11.4 KM', '3 WELLNESS DAYS', 'STAMINA LV 31 → 32']);
    expect(syncStamp(r)).toBe('SYNCED 09:05');
  });
  it('uses singular words and a value-only change when the level stays', () => {
    const r = buildSyncReport(snap(10, [5, 5.0]), snap(15.5, [5, 5.6]), { runsImported: 1, recoveryDaysWritten: 1 }, at);
    expect(syncReportLines(r)).toEqual(['1 NEW RUN · +5.5 KM', '1 WELLNESS DAY', 'STAMINA +0.6']);
  });
  it('says so when the sync brought nothing', () => {
    const r = buildSyncReport(snap(10, [5, 5]), snap(10, [5, 5]), { runsImported: 0, recoveryDaysWritten: 0 }, at);
    expect(syncReportLines(r)).toEqual(['NO NEW RUNS', 'NO NEW WELLNESS DAYS', 'NO STAT CHANGES']);
  });
  it('shows a stat that fell (LEANNESS can move both ways) and never a negative km', () => {
    const r = buildSyncReport(snap(10, [5, 5], undefined, [40, 40.1]), snap(9.9, [5, 5], undefined, [39, 39.2]), { runsImported: 0, recoveryDaysWritten: 1 }, at);
    expect(r.km).toBe(0);
    expect(syncReportLines(r)).toContain('LEANNESS LV 40 → 39');
  });
  it('reads a snapshot from the dashboard', () => {
    const dto = { totals: { totalRunKm: 12.5 }, stats: { stamina: { level: 3, value: 3.2 }, strength: { level: 1, value: 1.1 }, leanness: { level: 2, value: 2.2 } } } as never;
    expect(syncSnapshot(dto)).toEqual(snap(12.5, [3, 3.2], [1, 1.1], [2, 2.2]));
  });
});
