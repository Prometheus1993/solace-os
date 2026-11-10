import { describe, expect, it } from 'vitest';
import { computeStrength, type ScoredStrengthSet } from '../../src/gamification/index.ts';
import type { WeightPoint } from '../../src/domain/types.ts';

// The PRE-#13 formula, kept here as the reference: key-lift index = (bench + squat + sumo) / 3
// (missing lift = 0) on one ladder, and index ÷ bodyweight on another.
const OLD_KEY_LIFT_LADDER = [
  { min: 60, bonus: 3 },
  { min: 80, bonus: 6 },
  { min: 100, bonus: 10 },
  { min: 120, bonus: 14 },
  { min: 150, bonus: 17 },
  { min: 180, bonus: 20 },
];
const OLD_RELATIVE_LADDER = [
  { min: 0.6, bonus: 3 },
  { min: 0.8, bonus: 6 },
  { min: 1.0, bonus: 10 },
  { min: 1.25, bonus: 14 },
  { min: 1.75, bonus: 20 },
];
const ladder = (l: { min: number; bonus: number }[], v: number): number => l.reduce((b, r) => (v >= r.min ? r.bonus : b), 0);
const oldBonus = (bench: number, squat: number, sumo: number, bw: number): number => {
  const index = (bench + squat + sumo) / 3;
  return ladder(OLD_KEY_LIFT_LADDER, index) + ladder(OLD_RELATIVE_LADDER, index / bw);
};

const D1 = '2026-07-01';
const D2 = '2026-07-08';
const lifts = (bench: number, squat: number, sumo: number): ScoredStrengthSet[] =>
  [
    ['Bench Press', bench],
    ['Squat', squat],
    ['Sumo Deadlift', sumo],
  ].flatMap(([name, kg]) =>
    (kg as number) > 0
      ? [{ exerciseName: name as string, equipment: 'barbell' as const, realLoadKg: kg as number, reps: null, durationSeconds: null, excludedFromTrend: false, sessionDateIso: D1 }]
      : [],
  );
const bonusOf = (s: ReturnType<typeof computeStrength>): number => s.breakdown.filter((b) => b.label !== 'Total lifted').reduce((a, b) => a + b.level, 0);
const weigh = (kg: number): WeightPoint => ({ id: 0, date: '2026-06-01', weightKg: kg, bodyFatPct: null, source: 'manual', notes: null });

describe('STRENGTH #13: the per-lift bonuses never pay less than the old averaged bonuses', () => {
  // A literal "any input" guarantee is impossible with three capped per-lift ladders: bench 300 alone
  // was worth 10 under the old average (index 100) but a single lift can earn at most 7 now.
  // It holds on this domain: every lift 0-140 kg, bodyweight 60-200 kg (grid; rungs are 5 kg apart or less).
  it('new key-lift + relative bonus >= old, every lift 0..140 kg, bodyweight 60..200 kg', () => {
    const grid: number[] = [];
    for (let kg = 0; kg <= 140; kg += 5) grid.push(kg);
    for (const kg of [39.9, 49.9, 59.9, 69.9, 79.9, 99.9, 119.9]) grid.push(kg);
    let checked = 0;
    for (const bw of [60, 70, 80, 90, 100, 108, 120, 150, 200]) {
      for (const b of grid) {
        for (const s of grid) {
          for (const d of grid) {
            const now = bonusOf(computeStrength(lifts(b, s, d), D2, [weigh(bw)]));
            const before = oldBonus(b, s, d, bw);
            if (now < before) throw new Error(`drop at bench ${b} squat ${s} sumo ${d} bw ${bw}: old ${before} new ${now}`);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100_000);
  });

  it('bench max 55 kg only, bodyweight 79 kg: old bonus 0, new bonus 6', () => {
    expect(oldBonus(55, 0, 0, 79)).toBe(0);
    expect(bonusOf(computeStrength(lifts(55, 0, 0), D2, [weigh(79)]))).toBe(6); // 2 key-lift + 4 relative
  });

  it('documents the limit: a single 300 kg lift pays less than the old average did', () => {
    expect(oldBonus(300, 0, 0, 100)).toBe(10 + 10);
    expect(bonusOf(computeStrength(lifts(300, 0, 0), D2, [weigh(100)]))).toBe(14);
  });
});
