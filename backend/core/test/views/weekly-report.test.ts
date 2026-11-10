import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildDashboard, buildWeeklyReport, type DashboardInput, type RecoveryDay, type Run, type ScoredStrengthSet, type WeightPoint } from '../../src/index.ts';

// asOf = Wed 2026-10-28. Current week Mon 10-26..; last completed week = Mon 10-19..Sun 10-25;
// the week before = Mon 10-12..Sun 10-18.
const ASOF = '2026-10-28';

const run = (localDateTime: string, km: number, over: Partial<Run> = {}): Run => ({
  id: 0,
  sourceFileHash: `h-${localDateTime}-${km}`,
  startTimeUtc: 0,
  startTimeLocal: localDateTime,
  sport: 'running',
  totalDistanceM: km * 1000,
  totalDurationS: km * 360, // 6:00/km
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
  ...over,
});

const set = (sessionDateIso: string, over: Partial<ScoredStrengthSet> = {}): ScoredStrengthSet => ({
  exerciseName: 'Bench Press',
  equipment: 'barbell',
  realLoadKg: 50,
  reps: 10,
  durationSeconds: null,
  excludedFromTrend: false,
  sessionDateIso,
  ...over,
});

const day = (date: string, over: Partial<RecoveryDay> = {}): RecoveryDay => ({
  date,
  sleepScore: null,
  hrvOvernightMs: null,
  restingHrBpm: null,
  bodyBattery: null,
  source: 'garmin_mcp',
  ...over,
});

const weigh = (date: string, weightKg: number): WeightPoint => ({ id: 0, date, weightKg, bodyFatPct: null, source: 'manual', notes: null });

const report = (p: { runs?: Run[]; sets?: ScoredStrengthSet[]; days?: RecoveryDay[]; weights?: WeightPoint[]; asOf?: string } = {}) =>
  buildWeeklyReport(p.asOf ?? ASOF, p.runs ?? [], p.sets ?? [], p.days ?? [], p.weights ?? []);

describe('weekly report: week boundaries', () => {
  it('resolves the two weeks', () => {
    const r = report();
    expect([r.lastWeek.start, r.lastWeek.end]).toEqual(['2026-10-19', '2026-10-25']);
    expect([r.weekBefore.start, r.weekBefore.end]).toEqual(['2026-10-12', '2026-10-18']);
  });

  it('Sunday 23:59 is in the week, Monday 00:00 of the current week is not', () => {
    const r = report({ runs: [run('2026-10-25T23:59:00', 5), run('2026-10-26T00:00:00', 7), run('2026-10-19T00:00:00', 3)] });
    expect(r.runs.lastWeek).toBe(2);
    expect(r.distanceKm.lastWeek).toBe(8);
  });

  it('rolls over on Monday: asOf Mon 2026-10-26 still reports 10-19..10-25', () => {
    expect(report({ asOf: '2026-10-26' }).lastWeek.start).toBe('2026-10-19');
    expect(report({ asOf: '2026-11-01' }).lastWeek.start).toBe('2026-10-19');
    expect(report({ asOf: '2026-11-02' }).lastWeek.start).toBe('2026-10-26');
  });
});

describe('weekly report: runs', () => {
  it('count, km, distance-weighted pace, HR only over runs with HR', () => {
    const r = report({
      runs: [
        run('2026-10-20T08:00:00', 10, { avgHrBpm: 150 }), // 6:00/km
        run('2026-10-22T08:00:00', 5, { avgHrBpm: null, totalDurationS: 5 * 300 }), // 5:00/km
      ],
    });
    expect(r.runs.lastWeek).toBe(2);
    expect(r.distanceKm.lastWeek).toBe(15);
    expect(r.paceMinPerKm.lastWeek).toBeCloseTo((10 * 6 + 5 * 5) / 15, 6);
    expect(r.avgHrBpm.lastWeek).toBe(150);
  });

  it('null, never 0, when there is no data; no direction against a null side', () => {
    const r = report({ runs: [run('2026-10-20T08:00:00', 5)] });
    expect(r.runs.weekBefore).toBeNull();
    expect(r.distanceKm.weekBefore).toBeNull();
    expect(r.avgHrBpm.lastWeek).toBeNull();
    expect(r.runs.direction).toBeNull();
    expect(r.weekBefore.hasData).toBe(false);
    expect(r.lastWeek.hasData).toBe(true);
  });
});

describe('weekly report: strength', () => {
  it('hold-only session counts as a session but has null tonnage', () => {
    const r = report({ sets: [set('2026-10-21', { realLoadKg: null, reps: null, durationSeconds: 60, exerciseName: 'Plank' })] });
    expect(r.strengthSessions.lastWeek).toBe(1);
    expect(r.kgLifted.lastWeek).toBeNull();
  });

  it('tonnage = load x reps over loaded sets, holds excluded; sessions = distinct dates', () => {
    const r = report({
      sets: [
        set('2026-10-20'), // 500
        set('2026-10-20', { realLoadKg: 60, reps: 5 }), // 300
        set('2026-10-23', { realLoadKg: null, reps: null, durationSeconds: 45 }),
        set('2026-10-14', { realLoadKg: 100, reps: 1 }),
      ],
    });
    expect(r.strengthSessions.lastWeek).toBe(2);
    expect(r.kgLifted.lastWeek).toBe(800);
    expect(r.kgLifted.weekBefore).toBe(100);
    expect(r.kgLifted.direction).toBe('up');
  });

  it('sessions before STRENGTH_FRESH_START are ignored', () => {
    const r = report({ asOf: '2026-06-30', sets: [set('2026-06-16')] }); // week before = 06-15..06-21
    expect(r.strengthSessions.weekBefore).toBeNull();
  });
});

describe('weekly report: vitals and weight', () => {
  it('averages skip nulls', () => {
    const r = report({ days: [day('2026-10-19', { hrvOvernightMs: 60 }), day('2026-10-20', { hrvOvernightMs: 70, sleepScore: 80 }), day('2026-10-21')] });
    expect(r.hrvMs.lastWeek).toBe(65);
    expect(r.sleepScore.lastWeek).toBe(80);
    expect(r.restingHrBpm.lastWeek).toBeNull();
  });

  it('body battery averages the week and skips nulls; null when none', () => {
    const r = report({ days: [day('2026-10-19', { bodyBattery: 60 }), day('2026-10-20', { bodyBattery: 81 }), day('2026-10-21')] });
    expect(r.bodyBattery.lastWeek).toBe(70.5);
    expect(r.bodyBattery.weekBefore).toBeNull();
    expect(r.bodyBattery.direction).toBeNull();
  });

  it('weight change needs a weigh-in in the week and one before it', () => {
    const r = report({ weights: [weigh('2026-10-10', 80), weigh('2026-10-20', 79.5), weigh('2026-10-24', 79)] });
    expect(r.weightChangeKg.lastWeek).toBe(-1); // 79 - 80
    expect(r.weightChangeKg.weekBefore).toBeNull(); // nothing in 10-12..10-18
    expect(report({ weights: [weigh('2026-10-20', 79)] }).weightChangeKg.lastWeek).toBeNull(); // no prior weigh-in
    expect(report({ weights: [weigh('2026-10-10', 80)] }).weightChangeKg.lastWeek).toBeNull(); // none in the week
  });
});

describe('weekly report: arrows', () => {
  const kmPair = (last: number, before: number) =>
    report({ runs: [run('2026-10-20T08:00:00', last), run('2026-10-14T08:00:00', before)] }).distanceKm.direction;

  it('up / down / same with a 2% tolerance', () => {
    expect(kmPair(11, 10)).toBe('up');
    expect(kmPair(9, 10)).toBe('down');
    expect(kmPair(10.1, 10)).toBe('same'); // +1%
    expect(kmPair(10.2, 10)).toBe('same'); // exactly 2%
    expect(kmPair(10.3, 10)).toBe('up');
  });

  it('weight uses an absolute 0.1 kg band', () => {
    const w = (lastW: number, beforeW: number) =>
      report({ weights: [weigh('2026-10-01', 80), weigh('2026-10-15', 80 + beforeW), weigh('2026-10-22', 80 + beforeW + lastW)] }).weightChangeKg.direction;
    expect(w(0.1, 0)).toBe('same');
    expect(w(0.5, 0)).toBe('up');
    expect(w(-0.5, 0)).toBe('down');
  });
});

describe('DashboardDTO.weeklyReport', () => {
  it('exists on the DTO', () => {
    const input: DashboardInput = {
      asOf: ASOF, config: DEFAULT_CONFIG, runs: [run('2026-10-20T08:00:00', 5)], recoveryDays: [], weightPoints: [], scoredStrengthSets: [], shoe: null,
      statHistory: [], series: [], volumes: [], copies: [], purchases: [], purchaseItems: [], exams: [], schoolTasks: [],
    };
    const dto = buildDashboard(input);
    expect(dto.weeklyReport.lastWeek.start).toBe('2026-10-19');
    expect(dto.weeklyReport.runs.lastWeek).toBe(1);
    expect(dto.progress).toBeDefined();
  });
});
