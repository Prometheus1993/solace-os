import { describe, expect, it } from 'vitest';
import { computeDataFreshness, DEFAULT_CONFIG, buildDashboard, type DashboardInput, type RecoveryDay, type Run } from '../../src/index.ts';

const recoveryDay = (date: string): RecoveryDay => ({
  date,
  sleepScore: null,
  hrvOvernightMs: null,
  restingHrBpm: null,
  bodyBattery: null,
  source: 'garmin_mcp',
});

const run = (localDate: string): Run => ({
  id: 0,
  sourceFileHash: `h-${localDate}`,
  startTimeUtc: Math.floor(new Date(`${localDate}T12:00:00Z`).getTime() / 1000),
  startTimeLocal: `${localDate}T12:00:00`,
  sport: 'running',
  totalDistanceM: 5000,
  totalDurationS: 1800,
  avgHrBpm: null,
  maxHrBpm: null,
  avgEnhancedSpeedMps: null,
  avgCadence: null,
  avgPowerW: null,
  startLatDeg: null,
  startLonDeg: null,
  elevationGainM: null,
  temperatureSource: 'none',
  correctedTemperatureC: null,
  shoeId: null,
});

const baseInput = (over: Partial<DashboardInput>): DashboardInput => ({
  asOf: '2026-09-12',
  config: DEFAULT_CONFIG,
  runs: [],
  recoveryDays: [],
  weightPoints: [],
  scoredStrengthSets: [],
  shoe: null,
  statHistory: [],
  series: [],
  volumes: [],
  copies: [],
  purchases: [],
  purchaseItems: [],
  exams: [],
  schoolTasks: [],
  ...over,
});

describe('computeDataFreshness (pure)', () => {
  it('fresh: latest date equals asOf → 0 days stale', () => {
    const f = computeDataFreshness(['2026-09-12'], ['2026-09-12'], '2026-09-12');
    expect(f).toEqual({
      recoveryLatestDate: '2026-09-12',
      recoveryDaysStale: 0,
      runsLatestDate: '2026-09-12',
      runsDaysStale: 0,
    });
  });

  it('1 day stale', () => {
    const f = computeDataFreshness(['2026-09-11'], ['2026-09-11'], '2026-09-12');
    expect(f.recoveryDaysStale).toBe(1);
    expect(f.runsDaysStale).toBe(1);
  });

  it('many days stale, picks the MAX date among several rows', () => {
    const f = computeDataFreshness(
      ['2026-08-01', '2026-08-24', '2026-08-10'],
      ['2026-07-01'],
      '2026-09-12',
    );
    expect(f.recoveryLatestDate).toBe('2026-08-24');
    expect(f.recoveryDaysStale).toBe(19);
    expect(f.runsLatestDate).toBe('2026-07-01');
    expect(f.runsDaysStale).toBe(73);
  });

  it('no data at all → every field null', () => {
    const f = computeDataFreshness([], [], '2026-09-12');
    expect(f).toEqual({
      recoveryLatestDate: null,
      recoveryDaysStale: null,
      runsLatestDate: null,
      runsDaysStale: null,
    });
  });

  it('a future-dated reading clamps to 0, never negative', () => {
    const f = computeDataFreshness(['2026-09-20'], ['2026-09-30'], '2026-09-12');
    expect(f.recoveryDaysStale).toBe(0);
    expect(f.runsDaysStale).toBe(0);
  });
});

describe('DashboardDTO.dataFreshness (wired through buildDashboard)', () => {
  it('derives from the newest recovery_days row and the newest run, relative to asOf', () => {
    const dto = buildDashboard(
      baseInput({
        asOf: '2026-09-12',
        recoveryDays: [recoveryDay('2026-08-10'), recoveryDay('2026-08-24')],
        runs: [run('2026-09-01')],
      }),
    );
    expect(dto.dataFreshness.recoveryLatestDate).toBe('2026-08-24');
    expect(dto.dataFreshness.recoveryDaysStale).toBe(19);
    expect(dto.dataFreshness.runsLatestDate).toBe('2026-09-01');
    expect(dto.dataFreshness.runsDaysStale).toBe(11);
  });

  it('no recovery/run rows → nulls throughout', () => {
    const dto = buildDashboard(baseInput({}));
    expect(dto.dataFreshness).toEqual({
      recoveryLatestDate: null,
      recoveryDaysStale: null,
      runsLatestDate: null,
      runsDaysStale: null,
    });
  });
});
