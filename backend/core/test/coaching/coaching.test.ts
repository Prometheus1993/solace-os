import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/domain/athlete-config.ts';
import type { RecoveryDay, Run } from '../../src/domain/types.ts';
import { lastCompletedRecoveryWeek, rollingHrv } from '../../src/coaching/recovery-windows.ts';
import { dailyReadiness } from '../../src/coaching/readiness.ts';
import { classifyRun } from '../../src/coaching/run-classifier.ts';
import { interpretProgress } from '../../src/coaching/read-together.ts';
import { buildCoachingReport } from '../../src/coaching/coaching-engine.ts';

// Explicit baselines: these tests pin readiness thresholds, so they must not depend on the example defaults.
const TEST_CONFIG = { ...DEFAULT_CONFIG, maxHr: 190, restingHrBaseline: 58, hrvBaselineMs: 40 };

const ASOF = '2026-06-18';

const makeRun = (over: Partial<Run> & { id: number; startTimeUtc: number }): Run => ({
  sourceFileHash: `h${over.id}`,
  startTimeLocal: '',
  sport: 'running',
  totalDistanceM: 5000,
  totalDurationS: 1800,
  avgHrBpm: 160,
  maxHrBpm: 175,
  avgEnhancedSpeedMps: 2.5,
  avgCadence: 85,
  avgPowerW: null,
  startLatDeg: null,
  startLonDeg: null,
  elevationGainM: null,
  temperatureSource: 'none',
  correctedTemperatureC: null,
  shoeId: null,
  ...over,
});

const day = (date: string, hrv: number | null, sleep: number | null): RecoveryDay => ({
  date,
  sleepScore: sleep,
  hrvOvernightMs: hrv,
  restingHrBpm: null,
  bodyBattery: null,
  source: 'garmin_csv',
});

const fullDay = (date: string, hrv: number | null, sleep: number | null, restingHr: number | null, bodyBattery: number | null): RecoveryDay => ({
  date,
  sleepScore: sleep,
  hrvOvernightMs: hrv,
  restingHrBpm: restingHr,
  bodyBattery,
  source: 'garmin_csv',
});

const window = (value: number | null, confidence: 'low' | 'medium' | 'high' = 'high') => ({
  value,
  nDays: value == null ? 0 : 7,
  windowDays: 7,
  coverage: value == null ? 0 : 1,
  confidence,
});

describe('rolling recovery windows', () => {
  it('averages available days and skips nulls; one bad night does not dominate', () => {
    const days = [
      day('2026-06-12', 42, 70),
      day('2026-06-13', 42, 70),
      day('2026-06-14', 42, 70),
      day('2026-06-15', 28, 70), // one bad night
      day('2026-06-16', 42, 70),
      day('2026-06-17', 42, 70),
      day('2026-06-18', 42, 70),
    ];
    const hrv = rollingHrv(days, ASOF);
    expect(hrv.value).toBe(40); // (42*6 + 28) / 7
    expect(hrv.nDays).toBe(7);
  });
});

describe('lastCompletedRecoveryWeek (display-only weekly overview, NOT the readiness gate)', () => {
  it('rolls over from one Mon–Sun block to the next exactly at Monday, no stored state', () => {
    const days = [
      fullDay('2026-06-01', 40, 70, 55, 80), // Mon of the week-before-last
      fullDay('2026-06-07', 44, 74, 57, 84), // Sun of the week-before-last
      fullDay('2026-06-08', 30, 60, 50, 70), // Mon of the week that becomes "last" once asOf crosses into the next one
      fullDay('2026-06-14', 34, 64, 52, 74), // Sun of that same week
    ];
    // Sunday asOf is still inside the week starting 06-08 -> the last COMPLETED week is 06-01..06-07.
    const sunday = lastCompletedRecoveryWeek(days, '2026-06-14');
    expect(sunday.weekStart).toBe('2026-06-01');
    expect(sunday.weekEnd).toBe('2026-06-07');
    expect(sunday.hrv).toBe(42); // (40 + 44) / 2

    // Monday asOf: a new week has begun -> the last completed week rolls forward to 06-08..06-14.
    const monday = lastCompletedRecoveryWeek(days, '2026-06-15');
    expect(monday.weekStart).toBe('2026-06-08');
    expect(monday.weekEnd).toBe('2026-06-14');
    expect(monday.hrv).toBe(32); // (30 + 34) / 2
  });

  it('averages only non-null values per field and counts DAYS-WITH-ANY-READING (not per-field) for nDays', () => {
    const days = [
      fullDay('2026-06-08', 40, 70, null, 80), // resting HR missing this day
      fullDay('2026-06-09', 44, null, 55, null), // sleep + body battery missing this day
      // 06-10..06-13: no recovery_day row at all (a real gap in the export)
      fullDay('2026-06-14', 36, 74, 57, 84),
    ];
    const week = lastCompletedRecoveryWeek(days, '2026-06-15');
    expect(week.hrv).toBe(40); // (40 + 44 + 36) / 3
    expect(week.sleep).toBe(72); // (70 + 74) / 2 — 06-09's null skipped
    expect(week.restingHr).toBe(56); // (55 + 57) / 2 — 06-08's null skipped
    expect(week.bodyBattery).toBe(82); // (80 + 84) / 2 — 06-09's null skipped
    expect(week.nDays).toBe(3); // 06-08/06-09/06-14 each carried >=1 reading; the 4 fully-missing days don't count
  });

  it('an all-null field returns null while the other fields still compute', () => {
    const days = [fullDay('2026-06-08', 40, 70, null, 80), fullDay('2026-06-09', 44, 74, null, 84)];
    const week = lastCompletedRecoveryWeek(days, '2026-06-15');
    expect(week.restingHr).toBeNull();
    expect(week.hrv).toBe(42);
    expect(week.nDays).toBe(2);
  });

  it('an empty week (no recovery_day rows at all) returns nulls + nDays 0, with correct boundaries still derived', () => {
    const week = lastCompletedRecoveryWeek([], '2026-06-15');
    expect(week).toEqual({ weekStart: '2026-06-08', weekEnd: '2026-06-14', hrv: null, sleep: null, restingHr: null, bodyBattery: null, nDays: 0 });
  });
});

// No reading for asOf in any field — every signal falls back to its rolling window.
const noToday = { hrv: null, sleep: null, restingHr: null, bodyBattery: null };

describe('readiness gate (judges TODAY vs baseline, window is the fallback)', () => {
  it('clears hard training when recovery is fine today', () => {
    const r = dailyReadiness(
      { hrv: window(42), sleep: window(70), restingHr: window(null), bodyBattery: window(null), today: { hrv: 42, sleep: 70, restingHr: null, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_hard');
  });

  it("today's bad HRV alone downgrades to easy, even though the 7-day window is fine — the OLD rolling-average gate would NOT have caught this", () => {
    const hrvWindow = window(42); // 7-day mean is fine: nowhere near the 36.8ms (92% of 40ms) threshold.
    expect(hrvWindow.value! < TEST_CONFIG.hrvBaselineMs * 0.92).toBe(false); // proves the old window-only check would not have fired
    const r = dailyReadiness(
      { hrv: hrvWindow, sleep: window(70), restingHr: window(null), bodyBattery: window(null), today: { hrv: 30, sleep: 70, restingHr: null, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_easy');
    expect(r.rationale.join(' ')).toMatch(/HRV low: 30 \(normal ~40\)/);
  });

  it('all three signals bad TODAY -> rest', () => {
    const r = dailyReadiness(
      { hrv: window(42), sleep: window(70), restingHr: window(55), bodyBattery: window(null), today: { hrv: 30, sleep: 40, restingHr: 65, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('rest');
  });

  it('a single bad-today signal does NOT produce rest unless all three align', () => {
    const r = dailyReadiness(
      { hrv: window(42), sleep: window(70), restingHr: window(55), bodyBattery: window(null), today: { hrv: 30, sleep: 70, restingHr: 55, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_easy');
  });

  it('downgrades to easy on suppressed HRV + poor sleep today, regardless of plan', () => {
    const r = dailyReadiness(
      { hrv: window(42), sleep: window(70), restingHr: window(null), bodyBattery: window(null), today: { hrv: 34, sleep: 50, restingHr: null, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_easy');
  });

  it('rests when HRV + sleep are down AND resting HR is elevated, all today', () => {
    const r = dailyReadiness(
      { hrv: window(42), sleep: window(70), restingHr: window(55), bodyBattery: window(null), today: { hrv: 34, sleep: 50, restingHr: 64, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('rest');
  });

  it('a resting-HR-driven easy day inherits the resting-HR WINDOW confidence when today has no resting-HR reading (not falsely high)', () => {
    // HRV + sleep are fine today, high-confidence; resting HR has no reading today so it falls
    // back to a low-confidence window that happens to be elevated.
    const r = dailyReadiness(
      { hrv: window(42), sleep: window(70), restingHr: window(64, 'low'), bodyBattery: window(null), today: { hrv: 42, sleep: 70, restingHr: null, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_easy');
    expect(r.confidence).toBe('low'); // resting HR drove it; stays low even after the fallback degrade (already the floor)
  });

  it('falls back to the rolling window when today has no reading, says so in the rationale, and degrades confidence one step', () => {
    // The 7-day HRV window is genuinely low (34ms); today's HRV row does not exist yet, so the
    // gate falls back to that window instead of skipping the signal.
    const r = dailyReadiness(
      { hrv: window(34), sleep: window(70), restingHr: window(null), bodyBattery: window(null), today: { hrv: null, sleep: 70, restingHr: null, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_easy');
    expect(r.confidence).toBe('medium'); // worst(high, high) = high, degraded one step for the fallback
    expect(r.rationale.join(' ')).toMatch(/HRV low \(7-day avg\): 34 \(normal ~40\)/);
  });

  it('defaults to easy (low confidence) with no recovery data at all, today or window', () => {
    const r = dailyReadiness(
      { hrv: window(null), sleep: window(null), restingHr: window(null), bodyBattery: window(null), today: noToday },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_easy');
    expect(r.confidence).toBe('low');
  });

  it('reads a real sleep score of 0 as a measurement (poor), not as missing data falling back to a healthy window', () => {
    // sleep window is 70 (healthy) — a truthiness bug would fall back to it and miss the crash.
    const r = dailyReadiness(
      { hrv: window(42), sleep: window(70), restingHr: window(null), bodyBattery: window(null), today: { hrv: 42, sleep: 0, restingHr: null, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_easy');
    expect(r.rationale.join(' ')).toMatch(/Sleep score low: 0 \(below 55\)/);
    expect(r.rationale.join(' ')).not.toMatch(/7-day avg/);
  });

  it('reads a real HRV reading of 0 as a measurement (below baseline), not as missing data falling back to a healthy window', () => {
    // HRV window is 42ms (healthy) — a truthiness bug would fall back to it and miss the crash.
    const r = dailyReadiness(
      { hrv: window(42), sleep: window(70), restingHr: window(null), bodyBattery: window(null), today: { hrv: 0, sleep: 70, restingHr: null, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_easy');
    expect(r.rationale.join(' ')).toMatch(/HRV low: 0 \(normal ~40\)/);
    expect(r.rationale.join(' ')).not.toMatch(/7-day avg/);
  });

  it('does not claim a signal "fell back to a rolling average" when that average is itself absent', () => {
    // HRV has neither a today reading nor a window value (both null) — it contributed nothing,
    // it did not "fall back". Sleep is fine today so the no-data early return doesn't fire.
    const r = dailyReadiness(
      { hrv: window(null), sleep: window(70), restingHr: window(null), bodyBattery: window(null), today: { hrv: null, sleep: 70, restingHr: null, bodyBattery: null } },
      TEST_CONFIG,
    );
    expect(r.recommendation).toBe('go_hard');
    expect(r.confidence).toBe('high'); // no fallback actually happened, so no degrade
    expect(r.rationale.join(' ')).not.toMatch(/7-day avg/);
  });
});

describe('run classifier (heat-corrected, soft-boundary aware)', () => {
  it('classifies a 150 bpm run as upper Z3, not Z4 (corrected error #1)', () => {
    const read = classifyRun(makeRun({ id: 1, startTimeUtc: 100, avgHrBpm: 150 }), 190);
    expect(read.zone).toBe(3);
    expect(read.driftFlag).toBe(false);
    expect(read.confidence).toBe('low'); // near the soft Z3/Z4 line
  });

  it('does not flag a 156 bpm run in the heat once heat is subtracted', () => {
    const read = classifyRun(makeRun({ id: 2, startTimeUtc: 100, avgHrBpm: 156, correctedTemperatureC: 30 }), 190);
    expect(read.heatOffsetBpm).toBe(5);
    expect(read.adjustedAvgHr).toBe(151);
    expect(read.driftFlag).toBe(false);
  });

  it('flags a 156 bpm run with no heat as Z4 drift', () => {
    const read = classifyRun(makeRun({ id: 3, startTimeUtc: 100, avgHrBpm: 156 }), 190);
    expect(read.zone).toBe(4);
    expect(read.driftFlag).toBe(true);
  });
});

describe('read-together (never "slower")', () => {
  it('reads lighter + stable HR + more volume as progress', () => {
    const n = interpretProgress({
      weeklyVolumeKmEarly: 10,
      weeklyVolumeKmRecent: 20,
      weightChangeKg: -3,
      weightWeeks: 8,
      restingHrTrendBpm: -4.5,
      avgHrEarly: 164,
      avgHrRecent: 164,
    });
    expect(n.headline.toLowerCase()).toContain('progress');
    expect(n.headline.toLowerCase()).not.toContain('slow');
    expect(n.confidence).toBe('high');
  });

  it('flags efficiency as low-confidence when resting HR data is thin', () => {
    const n = interpretProgress({
      weeklyVolumeKmEarly: 10,
      weeklyVolumeKmRecent: 20,
      weightChangeKg: null,
      weightWeeks: 0,
      restingHrTrendBpm: null,
      avgHrEarly: 164,
      avgHrRecent: 164,
    });
    expect(n.points.join(' ')).toMatch(/Resting HR: not enough data yet/);
    expect(n.confidence).toBe('low');
  });

  it('writes short label-first points with ↑/↓ direction and no advice text', () => {
    const n = interpretProgress({
      weeklyVolumeKmEarly: 5.6,
      weeklyVolumeKmRecent: 3.2,
      weightChangeKg: -0.14,
      weightWeeks: 55 / 7,
      restingHrTrendBpm: 3,
      avgHrEarly: 164,
      avgHrRecent: 164,
    });
    expect(n.points).toEqual(['Km/week 6 → 3 ↓', 'Resting HR +3.0 bpm ↑', 'Weight \u22120.1 kg']);
  });
});

describe('coaching engine integration', () => {
  it('produces a dated report composing recovery, runs and progress', () => {
    const runs = [
      makeRun({ id: 1, startTimeUtc: 1_710_000_000, avgHrBpm: 150 }),
      makeRun({ id: 2, startTimeUtc: 1_711_000_000, avgHrBpm: 164 }),
      makeRun({ id: 3, startTimeUtc: 1_712_000_000, avgHrBpm: 170 }),
      makeRun({ id: 4, startTimeUtc: 1_713_000_000, avgHrBpm: 162 }),
    ];
    const recoveryDays = [day('2026-06-16', 42, 70), day('2026-06-17', 41, 68), day('2026-06-18', 40, 66)];
    const report = buildCoachingReport({ asOf: ASOF, runs, recoveryDays, weightPoints: [] }, TEST_CONFIG);

    expect(report.date).toBe(ASOF);
    expect(['go_hard', 'go_easy', 'rest']).toContain(report.readiness.recommendation);
    expect(report.recentRunReads).toHaveLength(4);
    expect(report.progress.headline).toBeTruthy();
  });

  it('wires recovery.today from the RecoveryDay row at asOf', () => {
    const recoveryDays = [fullDay('2026-06-17', 41, 68, 58, 70), fullDay(ASOF, 40, 66, 55, 75)];
    const report = buildCoachingReport({ asOf: ASOF, runs: [], recoveryDays, weightPoints: [] }, TEST_CONFIG);
    expect(report.recovery.today).toEqual({ hrv: 40, sleep: 66, restingHr: 55, bodyBattery: 75 });
  });

  it('leaves recovery.today all-null (no crash) when there is no RecoveryDay row for asOf', () => {
    const recoveryDays = [fullDay('2026-06-17', 41, 68, 58, 70)]; // no row for ASOF itself
    const report = buildCoachingReport({ asOf: ASOF, runs: [], recoveryDays, weightPoints: [] }, TEST_CONFIG);
    expect(report.recovery.today).toEqual({ hrv: null, sleep: null, restingHr: null, bodyBattery: null });
  });

  it('leaves recovery.today all-null when the asOf row exists but every field on it is null', () => {
    const recoveryDays = [fullDay(ASOF, null, null, null, null)];
    const report = buildCoachingReport({ asOf: ASOF, runs: [], recoveryDays, weightPoints: [] }, TEST_CONFIG);
    expect(report.recovery.today).toEqual({ hrv: null, sleep: null, restingHr: null, bodyBattery: null });
  });
});
