import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildDashboard, type DashboardInput, type RecoveryDay, type Run } from '../../src/index.ts';

// asOf is a Sunday (2026-09-13); its own ISO week is Mon 2026-09-07..Sun 2026-09-13, so the last
// COMPLETED Mon–Sun week is 2026-08-31..2026-09-06 — same boundary `lastCompletedRecoveryWeek`
// resolves for the same asOf.
const ASOF = '2026-09-13';

const recoveryDay = (date: string, hrvOvernightMs: number | null = null): RecoveryDay => ({
  date,
  sleepScore: null,
  hrvOvernightMs,
  restingHrBpm: null,
  bodyBattery: null,
  source: 'garmin_mcp',
});

const run = (localDate: string, km: number): Run => ({
  id: 0,
  sourceFileHash: `h-${localDate}-${km}`,
  startTimeUtc: Math.floor(new Date(`${localDate}T12:00:00Z`).getTime() / 1000),
  startTimeLocal: `${localDate}T12:00:00`,
  sport: 'running',
  totalDistanceM: km * 1000,
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
  asOf: ASOF,
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

describe('DashboardDTO.coachContext', () => {
  it('computes longest30dKm / runsLast30d / lastWeekRunKm / weeklyKm28d for a fixed run set', () => {
    const dto = buildDashboard(
      baseInput({
        runs: [
          run('2026-09-01', 10), // in the last completed week AND the trailing 30 days
          run('2026-08-20', 15), // in the trailing 30 days only — the longest of the three
          run('2026-07-01', 50), // outside both windows — must not leak in anywhere
        ],
      }),
    );
    expect(dto.coachContext.longest30dKm).toBe(15);
    expect(dto.coachContext.runsLast30d).toBe(2);
    expect(dto.coachContext.lastWeekRunKm).toBe(10);
    expect(dto.coachContext.weeklyKm28d).toBe(6.3);
  });

  it('longest30dKm is 0 with no runs in the trailing 30 days', () => {
    const dto = buildDashboard(baseInput({ runs: [run('2026-01-01', 42)] }));
    expect(dto.coachContext.longest30dKm).toBe(0);
    expect(dto.coachContext.runsLast30d).toBe(0);
    expect(dto.coachContext.lastWeekRunKm).toBe(0);
  });

  it('longest30dKm/lastWeekRunKm are exactly the ValidatorHistory shape explainPlanWeek takes', () => {
    const dto = buildDashboard(baseInput({ runs: [run('2026-09-01', 10)] }));
    const history = { longest30dKm: dto.coachContext.longest30dKm, lastWeekRunKm: dto.coachContext.lastWeekRunKm };
    expect(history).toEqual({ longest30dKm: 10, lastWeekRunKm: 10 });
  });
});

describe('DashboardDTO.hrv', () => {
  it("todayFlag is 'unknown' with a too-short baseline history, even with a today reading", () => {
    const dto = buildDashboard(
      baseInput({
        recoveryDays: [
          recoveryDay('2026-09-09', 40),
          recoveryDay('2026-09-10', 41),
          recoveryDay('2026-09-11', 39),
          recoveryDay('2026-09-12', 42),
          recoveryDay(ASOF, 20), // a very low today reading — must still not be flagged without a ready baseline
        ],
      }),
    );
    expect(dto.hrv.baseline.ready).toBe(false);
    expect(dto.hrv.todayFlag).toBe('unknown');
  });
});

// Regression for two defects: sparse runs followed by a long gap (last run 27 Aug, asOf 13 Sep).
describe('DashboardDTO.coachContext after a break (regression)', () => {
  const sparseRuns = [run('2026-07-30', 7), run('2026-08-04', 5), run('2026-08-11', 4.4), run('2026-08-19', 3.6), run('2026-08-25', 6.4)];

  it('weeklyKm28d is anchored on asOf and decays during inactivity (not anchored on the latest run)', () => {
    const dto = buildDashboard(baseInput({ runs: sparseRuns }));
    // 28 days ending 2026-09-13 start on 2026-08-17: only the 19 Aug and 25 Aug runs count. (3.6 + 6.4) * 7 / 28 = 2.5
    expect(dto.coachContext.weeklyKm28d).toBe(2.5);
  });

  it('reports the last week that HAD runs when the last completed week was empty', () => {
    const dto = buildDashboard(baseInput({ runs: sparseRuns }));
    expect(dto.coachContext.lastWeekRunKm).toBe(0); // 31 Aug..6 Sep: no runs
    expect(dto.coachContext.lastActiveWeekRunKm).toBe(6.4); // 24..30 Aug: the 25 Aug run
    expect(dto.coachContext.lastActiveWeekStart).toBe('2026-08-24');
    expect(dto.coachContext.longest30dKm).toBe(6.4); // the 7 km of 30 Jul is outside the 30 days
  });

  it('lastActiveWeek is null when no completed week in the 8-week look-back had runs', () => {
    const dto = buildDashboard(baseInput({ runs: [run('2026-06-01', 10)] }));
    expect(dto.coachContext.lastActiveWeekRunKm).toBeNull();
    expect(dto.coachContext.lastActiveWeekStart).toBeNull();
  });

  it("lastActiveWeek equals last week when last week had runs, and ignores the in-progress week", () => {
    const dto = buildDashboard(baseInput({ runs: [run('2026-09-02', 5), run('2026-09-10', 20)] })); // 10 Sep is in asOf's own week
    expect(dto.coachContext.lastWeekRunKm).toBe(5);
    expect(dto.coachContext.lastActiveWeekRunKm).toBe(5);
    expect(dto.coachContext.lastActiveWeekStart).toBe('2026-08-31');
  });
});
