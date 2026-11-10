import { describe, expect, it } from 'vitest';
import type { Run } from '../../src/domain/types.ts';
import { DEFAULT_GOALS } from '../../src/domain/athlete-config.ts';
import {
  goalQuests,
  goalsView,
  ladderStep,
  paceLadder,
  resolveGoals,
  weeklyKmLadder,
} from '../../src/gamification/index.ts';

// Example goals for the quest assertions below.
const GOALS = { weightKg: 82, bodyFatPct: 14, paceMinPerKm: 5.5, weeklyKm: 30 };
const PACE_LADDER_MIN_PER_KM = paceLadder(GOALS.paceMinPerKm);
const WEEKLY_KM_LADDER = weeklyKmLadder(GOALS.weeklyKm);

const mkRun = (id: number, localDate: string, km: number, durationS: number): Run => ({
  id,
  sourceFileHash: `h${id}`,
  startTimeUtc: Date.parse(`${localDate}T08:00:00Z`) / 1000,
  startTimeLocal: `${localDate}T10:00:00`,
  sport: 'running',
  totalDistanceM: km * 1000,
  totalDurationS: durationS,
  avgHrBpm: 150,
  maxHrBpm: 170,
  avgEnhancedSpeedMps: (km * 1000) / durationS,
  avgCadence: 85,
  avgPowerW: null,
  startLatDeg: null,
  startLonDeg: null,
  elevationGainM: null,
  temperatureSource: 'none',
  correctedTemperatureC: null,
  shoeId: null,
});

describe('ladders', () => {
  it('goal on an existing rung: that rung is the last one, no duplicate', () => {
    expect(paceLadder(6.0)).toEqual([8.5, 8.0, 7.5, 7.0, 6.5, 6.0]);
    expect(weeklyKmLadder(30)).toEqual([10, 15, 20, 30]);
    expect(paceLadder(5.0)).toEqual([8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0]);
    expect(weeklyKmLadder(50)).toEqual([10, 15, 20, 30, 40, 50]);
  });

  it('goal between rungs: slower/lower fixed rungs, then the goal', () => {
    expect(paceLadder(6.2)).toEqual([8.5, 8.0, 7.5, 7.0, 6.5, 6.2]);
    expect(weeklyKmLadder(35)).toEqual([10, 15, 20, 30, 35]);
  });

  it('goal easier than the first rung: the goal is the only rung', () => {
    expect(paceLadder(9.5)).toEqual([9.5]);
    expect(weeklyKmLadder(5)).toEqual([5]);
  });

  it('goal harder than all rungs: all fixed rungs, then the goal', () => {
    expect(paceLadder(4.5)).toEqual([8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5]);
    expect(weeklyKmLadder(80)).toEqual([10, 15, 20, 30, 40, 50, 80]);
  });

  it('pace quest with a goal easier than the floor keeps a sane bar and is done at the goal', () => {
    const slow = { ...GOALS, paceMinPerKm: 10 };
    const q = goalQuests([mkRun(1, '2026-10-05', 5, 12 * 60 * 5)], [], slow).find((x) => x.key === 'pace')!;
    expect(q.target).toBe(10);
    expect(q.pct).toBe(0);
    expect(q.done).toBe(false);
    const done = goalQuests([mkRun(1, '2026-10-05', 5, 9.5 * 60 * 5)], [], slow).find((x) => x.key === 'pace')!;
    expect(done.done).toBe(true);
  });

  it('resolveGoals / goalsView: null falls back to the neutral default and reports userSet', () => {
    expect(resolveGoals()).toEqual(DEFAULT_GOALS);
    const v = goalsView({ weightKg: 82, bodyFatPct: null, paceMinPerKm: null, weeklyKm: 40 });
    expect(v).toEqual({
      weightKg: { value: 82, userSet: true },
      bodyFatPct: { value: DEFAULT_GOALS.bodyFatPct, userSet: false },
      paceMinPerKm: { value: DEFAULT_GOALS.paceMinPerKm, userSet: false },
      weeklyKm: { value: 40, userSet: true },
    });
  });

  it('ladderStep pace (lower is better), exact boundary = reached', () => {
    expect(ladderStep(PACE_LADDER_MIN_PER_KM, 8.7, true)).toEqual({ next: 8.5, prev: null, allReached: false });
    expect(ladderStep(PACE_LADDER_MIN_PER_KM, 8.5, true)).toEqual({ next: 8.0, prev: 8.5, allReached: false });
    expect(ladderStep(PACE_LADDER_MIN_PER_KM, 7.2, true)).toEqual({ next: 7.0, prev: 7.5, allReached: false });
    expect(ladderStep(PACE_LADDER_MIN_PER_KM, 5.4, true)).toEqual({ next: 5.5, prev: 6.0, allReached: true });
  });

  it('ladderStep volume (higher is better), exact boundary = reached', () => {
    expect(ladderStep(WEEKLY_KM_LADDER, 0, false)).toEqual({ next: 10, prev: null, allReached: false });
    expect(ladderStep(WEEKLY_KM_LADDER, 10, false)).toEqual({ next: 15, prev: 10, allReached: false });
    expect(ladderStep(WEEKLY_KM_LADDER, 25, false)).toEqual({ next: 30, prev: 20, allReached: false });
    expect(ladderStep(WEEKLY_KM_LADDER, 35, false)).toEqual({ next: 30, prev: 20, allReached: true });
  });
});

describe('goalQuests ladders', () => {
  it('pace: 8.7 min/km → target 8.5 from floor 9.0, pct 60, not done', () => {
    const q = goalQuests([mkRun(1, '2026-10-05', 5, 8.7 * 60 * 5)], [], GOALS).find((x) => x.key === 'pace')!;
    expect(q.current).toBe(8.7);
    expect(q.target).toBe(8.5);
    expect(q.label).toBe('Sub-8:30/km');
    expect(q.pct).toBe(60);
    expect(q.done).toBe(false);
    expect(q.detail).toContain('end goal sub-5:30/km');
  });

  it('pace: a reached rung advances the target but is not done', () => {
    const q = goalQuests([mkRun(1, '2026-10-05', 5, 7.2 * 60 * 5)], [], GOALS).find((x) => x.key === 'pace')!;
    expect(q.target).toBe(7.0);
    expect(q.pct).toBe(60); // (7.5-7.2)/(7.5-7.0)
    expect(q.done).toBe(false);
  });

  it('pace: done only at the end goal', () => {
    const q = goalQuests([mkRun(1, '2026-10-05', 5, 5.4 * 60 * 5)], [], GOALS).find((x) => x.key === 'pace')!;
    expect(q.done).toBe(true);
    expect(q.target).toBe(5.5);
  });

  it('volume: 5 km/wk avg → target 10, pct 50, not done', () => {
    // 20 km in the 28-day window → 5 km/wk
    const q = goalQuests([mkRun(1, '2026-10-05', 20, 6000)], [], GOALS).find((x) => x.key === 'volume')!;
    expect(q.current).toBe(5);
    expect(q.target).toBe(10);
    expect(q.label).toBe('≥ 10 km/wk');
    expect(q.pct).toBe(50);
    expect(q.done).toBe(false);
    expect(q.detail).toBe('now 5 km/wk (28-day avg) · end goal 30 km/wk');
  });

  it('volume: a reached rung is not done; 30 is', () => {
    const mid = goalQuests([mkRun(1, '2026-10-05', 100, 30000)], [], GOALS).find((x) => x.key === 'volume')!; // 25 km/wk
    expect(mid.target).toBe(30);
    expect(mid.pct).toBe(50); // (25-20)/(30-20)
    expect(mid.done).toBe(false);
    const top = goalQuests([mkRun(1, '2026-10-05', 120, 36000)], [], GOALS).find((x) => x.key === 'volume')!; // 30 km/wk
    expect(top.done).toBe(true);
  });
});
