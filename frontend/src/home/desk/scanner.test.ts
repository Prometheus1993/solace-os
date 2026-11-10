import { describe, expect, it } from 'vitest';
import { historyPlot, recoveryReading } from './scanner-data.ts';
import type { ScannerData } from './scanner-data.ts';

const window = { value: 65, nDays: 3, windowDays: 7, coverage: 3 / 7, confidence: 'low' as const };
const input = {
  recovery: { today: { sleep: 0, hrv: null, bodyBattery: null, restingHr: null }, sleep: window, hrv: window, bodyBattery: { ...window, value: null }, restingHr: window },
  vitals: { sleep: [], hrv: [], bodyBattery: [], bodyFat: [], weight: [], restingHr: [] },
  dataFreshness: { recoveryDaysStale: 4 } as ScannerData['dataFreshness'],
};

describe('scanner readings', () => {
  it('preserves zero today instead of substituting the average', () => {
    expect(recoveryReading(input, 'sleep')).toMatchObject({ value: 0, source: 'TODAY', stale: 4 });
  });
  it('labels window fallback and keeps missing values missing', () => {
    expect(recoveryReading(input, 'hrv')).toMatchObject({ value: 65, source: '7-DAY AVERAGE', coverage: '3/7 days in rolling window' });
    expect(recoveryReading(input, 'bodyBattery')).toMatchObject({ value: null, source: 'NO SIGNAL', points: [] });
  });
  it('uses calendar distance rather than evenly spacing missing days', () => {
    const plot = historyPlot([{ date: '2026-11-05', value: 70 }, { date: '2026-11-01', value: 50 }, { date: '2026-11-02', value: 60 }]);
    expect(plot).toMatchObject({ xy: '8,80 79,45 292,10', min: 50, max: 70, count: 3 });
  });
  it('does not invent trends with one date and keeps constant histories finite', () => {
    expect(historyPlot([])).toBeNull();
    expect(historyPlot([{ date: '2026-11-01', value: 70 }])).toBeNull();
    expect(historyPlot([{ date: '2026-11-01', value: 70 }, { date: '2026-11-02', value: 70 }])?.xy).toBe('8,45 292,45');
  });
});
