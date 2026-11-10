import type { DashboardDTO, VitalPoint } from '@solace/core';

export const SCAN_POINTS = [
  { id: 'sleep', label: 'SLEEP', position: [0, 2.03, .08], anchor: [-.86, 2.08, .12] },
  { id: 'hrv', label: 'HRV', position: [.12, 1.57, .2], anchor: [.86, 1.87, .12] },
  { id: 'bodyBattery', label: 'BATTERY', position: [-.12, 1.2, .19], anchor: [-.86, 1.35, .12] },
  { id: 'strength', label: 'POWER', position: [.51, 1.32, .03], anchor: [.86, 1.25, .12] },
  { id: 'stamina', label: 'ENDURANCE', position: [-.19, .55, .06], anchor: [-.86, .63, .12] },
  { id: 'leanness', label: 'COMPOSITION', position: [.2, 1, .13], anchor: [.86, .63, .12] },
] as const;
export type ScanMetric = typeof SCAN_POINTS[number]['id'];
export type ScannerData = Pick<DashboardDTO, 'recovery' | 'vitals' | 'stats' | 'dataFreshness'>;

export function recoveryReading(dto: Pick<ScannerData, 'recovery' | 'vitals' | 'dataFreshness'>, id: 'sleep' | 'hrv' | 'bodyBattery') {
  const today = dto.recovery.today[id];
  const window = dto.recovery[id];
  return {
    value: today ?? window.value,
    source: today != null ? 'TODAY' : window.value != null ? `${window.windowDays}-DAY AVERAGE` : 'NO SIGNAL',
    coverage: `${window.nDays}/${window.windowDays} days in rolling window`,
    stale: dto.dataFreshness.recoveryDaysStale,
    points: dto.vitals[id],
  };
}

/** Date-proportional, unsmoothed chart: missing dates remain gaps in time, not fabricated readings. */
export function historyPlot(points: VitalPoint[]) {
  const valid = points.filter(p => Number.isFinite(p.value) && Number.isFinite(Date.parse(p.date))).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (valid.length < 2) return null;
  const start = Date.parse(valid[0].date), end = Date.parse(valid.at(-1)!.date);
  if (start === end) return null;
  const min = Math.min(...valid.map(p => p.value)), max = Math.max(...valid.map(p => p.value));
  const xy = valid.map(p => `${8 + (Date.parse(p.date) - start) / (end - start) * 284},${max === min ? 45 : 80 - (p.value - min) / (max - min) * 70}`).join(' ');
  return { xy, min, max, start: valid[0].date, end: valid.at(-1)!.date, count: valid.length };
}
