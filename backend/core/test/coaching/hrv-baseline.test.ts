import { describe, expect, it } from 'vitest';
import type { RecoveryDay } from '../../src/domain/types.ts';
import { hrvBaseline, hrvFlag, MIN_BASELINE_READINGS } from '../../src/coaching/hrv-baseline.ts';

const ASOF = '2026-06-28';

const day = (date: string, hrv: number | null): RecoveryDay => ({
  date,
  hrvOvernightMs: hrv,
  sleepScore: null,
  restingHrBpm: null,
  bodyBattery: null,
  source: 'garmin_mcp',
});

const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// 13 readings spread across 2026-06-01..06-13 (well outside the 7-day short window) + 7
// readings across the 7 days ending ASOF (the short window) = 20 total, exactly MIN_BASELINE_READINGS.
const OLDER_13 = [40, 42, 38, 41, 39, 43, 37, 40, 42, 44, 38, 36, 41];
const RECENT_7 = [43, 39, 40, 42, 38, 41, 45];

function readyDays(): RecoveryDay[] {
  const days: RecoveryDay[] = [];
  OLDER_13.forEach((v, i) => days.push(day(addDaysIso('2026-06-01', i), v)));
  RECENT_7.forEach((v, i) => days.push(day(addDaysIso(ASOF, i - 6), v)));
  return days;
}

// Hand-computed (see task notes): ln() of the 20 values above.
const EXPECTED_BASELINE_SD = 0.05935189794752586;
const EXPECTED_SWC = EXPECTED_BASELINE_SD * 0.5;
const EXPECTED_SHORT_MEAN = 3.7155902214887897; // mean(ln(RECENT_7)) — the SHORT window only
const LOW_THRESHOLD_MS = 39.881568408405535; // exp(EXPECTED_SHORT_MEAN - EXPECTED_SWC)

describe('hrvBaseline', () => {
  it('matches a hand-computed mean/sd/swc for a known series', () => {
    const baseline = hrvBaseline(readyDays(), ASOF);
    expect(baseline.nReadings).toBe(20);
    expect(baseline.ready).toBe(true);
    expect(baseline.mean).toBeCloseTo(EXPECTED_SHORT_MEAN, 6);
    expect(baseline.sd).toBeCloseTo(EXPECTED_BASELINE_SD, 6);
    expect(baseline.swc).toBeCloseTo(EXPECTED_SWC, 6);
  });

  it('is not ready with fewer than MIN_BASELINE_READINGS, and hrvFlag switches itself off', () => {
    const sparseDays = OLDER_13.slice(0, 10).map((v, i) => day(addDaysIso('2026-06-01', i), v));
    expect(sparseDays.length).toBeLessThan(MIN_BASELINE_READINGS);
    const baseline = hrvBaseline(sparseDays, '2026-06-10');
    expect(baseline.nReadings).toBe(10);
    expect(baseline.ready).toBe(false);
    expect(hrvFlag(30, baseline)).toBe('unknown');
  });

  it('skips null and non-positive readings without leaking NaN into the mean/sd', () => {
    const days = [day('2026-06-01', 40), day('2026-06-02', null), day('2026-06-03', -5), day('2026-06-04', 42), day('2026-06-05', 0)];
    const baseline = hrvBaseline(days, '2026-06-05');
    expect(baseline.nReadings).toBe(2); // only 40 and 42 are usable
    expect(Number.isNaN(baseline.mean)).toBe(false);
    expect(Number.isNaN(baseline.sd)).toBe(false);
    expect(baseline.mean).toBeCloseTo(3.7132745361986523, 6);
    expect(baseline.sd).toBeCloseTo(0.0344998559394104, 6);
  });

  it('returns null sd/swc (not NaN) with fewer than 2 usable readings, mean still computed', () => {
    const days = [day('2026-06-01', 40), day('2026-06-02', null)];
    const baseline = hrvBaseline(days, '2026-06-02');
    expect(baseline.nReadings).toBe(1);
    expect(baseline.mean).toBeCloseTo(Math.log(40), 10);
    expect(baseline.sd).toBeNull();
    expect(baseline.swc).toBeNull();
  });
});

describe('hrvFlag', () => {
  it("flags 'low' just below mean-swc", () => {
    const baseline = hrvBaseline(readyDays(), ASOF);
    expect(hrvFlag(39, baseline)).toBe('low');
    expect(Math.log(39)).toBeLessThan(EXPECTED_SHORT_MEAN - EXPECTED_SWC);
  });

  it("flags 'normal' just above mean-swc", () => {
    const baseline = hrvBaseline(readyDays(), ASOF);
    expect(hrvFlag(41, baseline)).toBe('normal');
    expect(Math.log(41)).toBeGreaterThan(EXPECTED_SHORT_MEAN - EXPECTED_SWC);
  });

  it('sits right at the documented ~39.88ms threshold', () => {
    const baseline = hrvBaseline(readyDays(), ASOF);
    expect(hrvFlag(Math.ceil(LOW_THRESHOLD_MS), baseline)).toBe('normal');
    expect(hrvFlag(Math.floor(LOW_THRESHOLD_MS), baseline)).toBe('low');
  });

  it("returns 'unknown' for a null today reading even with a ready baseline", () => {
    const baseline = hrvBaseline(readyDays(), ASOF);
    expect(baseline.ready).toBe(true);
    expect(hrvFlag(null, baseline)).toBe('unknown');
  });

  it("returns 'unknown' for a non-positive today reading", () => {
    const baseline = hrvBaseline(readyDays(), ASOF);
    expect(hrvFlag(0, baseline)).toBe('unknown');
    expect(hrvFlag(-10, baseline)).toBe('unknown');
  });
});
