import { describe, expect, it } from 'vitest';
import { addDaysIso } from '../../src/domain/dates.ts';
import { round1 } from '../../src/domain/math.ts';
import type { Run, StatHistoryEntry, WeightPoint } from '../../src/domain/types.ts';
import {
  compositeStat,
  computeLeanness,
  computeStamina,
  computeStrength,
  detectLevelUps,
  goalQuests,
  levelForValue,
  scoreForValue,
  LEANNESS_FRESH_START,
  STRENGTH_FRESH_START,
  tierForLevel,
  valueForLevel,
  type LevelCurve,
  type NewStat,
  type ScoredStrengthSet,
} from '../../src/gamification/index.ts';

// Example goals for these assertions: target fat mass = 82 x 0.14 = 11.48 kg.
/** A date `n` days from the LEANNESS restart anchor. */
const fromLean = (n: number): string => addDaysIso(LEANNESS_FRESH_START, n);
const GOALS = { weightKg: 82, bodyFatPct: 14, paceMinPerKm: 5.5, weeklyKm: 30 };

// Generic curve fixtures for exercising levelForValue / valueForLevel / compositeStat.
const STAT_CURVES = {
  STAMINA: { vMax: 120, exponent: 1.3 },
  STRENGTH: { vMax: 140, exponent: 1.2 },
} as const satisfies Record<string, LevelCurve>;

const run = (id: number, startTimeUtc: number, km: number, durationS = 1800): Run => ({
  id,
  sourceFileHash: `h${id}`,
  startTimeUtc,
  startTimeLocal: '',
  sport: 'running',
  totalDistanceM: km * 1000,
  totalDurationS: durationS,
  avgHrBpm: 160,
  maxHrBpm: 175,
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

/** A run at `min:sec` finish time over `km` — for pace-ladder tests. */
const runAtTime = (id: number, startTimeUtc: number, km: number, timeSec: number): Run => run(id, startTimeUtc, km, timeSec);

/** Many short (< 5 km, so they never touch the longest/pace bonuses) runs summing
 * to exactly `totalKm` — isolates the STAMINA base curve for reference-value tests. */
function manyShortRuns(totalKm: number): Run[] {
  const CHUNK = 4; // km, safely under the 5 km "PR candidate" / longest-bonus floor
  const runs: Run[] = [];
  let remaining = totalKm;
  let i = 0;
  while (remaining > 1e-9) {
    const km = Math.min(CHUNK, remaining);
    runs.push(run(i + 1, BASE + i * 86400, km));
    remaining = round1(remaining - km);
    i++;
  }
  return runs;
}

const sset = (
  name: string,
  equipment: ScoredStrengthSet['equipment'],
  kg: number | null,
  date: string,
  excluded = false,
  reps: number | null = 5,
): ScoredStrengthSet => ({ exerciseName: name, equipment, realLoadKg: kg, reps, durationSeconds: null, excludedFromTrend: excluded, sessionDateIso: date });

/** A hold set as storage keeps it: seconds only, no load/reps, excluded from trend. */
const hold = (name: string, date: string, seconds = 60): ScoredStrengthSet => ({
  exerciseName: name,
  equipment: 'barbell',
  realLoadKg: null,
  reps: null,
  durationSeconds: seconds,
  excludedFromTrend: true,
  sessionDateIso: date,
});

const weight = (date: string, kg: number, bf: number | null = null): WeightPoint => ({
  id: 0,
  date,
  weightKg: kg,
  bodyFatPct: bf,
  source: 'manual',
  notes: null,
});

const BASE = Math.floor(Date.UTC(2026, 4, 1) / 1000);

describe('level curve', () => {
  it('maps 0 to LV0 and vMax to LV100, monotonically', () => {
    for (const curve of Object.values(STAT_CURVES)) {
      expect(levelForValue(0, curve)).toBe(0);
      expect(levelForValue(curve.vMax, curve)).toBe(100);
      expect(levelForValue(curve.vMax * 2, curve)).toBe(100); // clamped
      expect(levelForValue(curve.vMax / 2, curve)).toBeGreaterThan(0);
      expect(levelForValue(curve.vMax / 2, curve)).toBeLessThan(100);
    }
  });

  it('valueForLevel is the inverse of levelForValue (±1 at float boundaries)', () => {
    const curve = STAT_CURVES.STAMINA;
    for (const lv of [10, 25, 50, 75]) {
      const back = levelForValue(valueForLevel(lv, curve), curve);
      expect(back).toBeGreaterThanOrEqual(lv - 1);
      expect(back).toBeLessThanOrEqual(lv);
    }
  });

  it('assigns RPG tiers by band', () => {
    expect(tierForLevel(5).name).toBe('Novice');
    expect(tierForLevel(14).name).toBe('Apprentice');
    expect(tierForLevel(40).name).toBe('Adept');
    expect(tierForLevel(60).name).toBe('Veteran');
    expect(tierForLevel(80).name).toBe('Elite');
    expect(tierForLevel(100).name).toBe('Mythic');
  });
});

describe('compositeStat (weighted blend of sub-scores)', () => {
  it('scoreForValue is the un-floored level; vMax → 100', () => {
    expect(scoreForValue(0, STAT_CURVES.STAMINA)).toBe(0);
    expect(scoreForValue(120, STAT_CURVES.STAMINA)).toBe(100);
  });

  it('blends equal-weight subs and drops zero-weight factors', () => {
    const sub = (scored: number, curve = STAT_CURVES.STAMINA, weight = 1) => ({ label: 'x', scored, shown: scored, unit: 'u', curve, weight });
    // both at vMax → 100
    expect(compositeStat([sub(120), sub(120)]).level).toBe(100);
    // one at vMax (100), one at 0 → 50
    expect(compositeStat([sub(120), sub(0)]).level).toBe(50);
    // a zero-weight factor is excluded from the blend AND the breakdown
    const c = compositeStat([sub(120), sub(0, STAT_CURVES.STAMINA, 0)]);
    expect(c.level).toBe(100);
    expect(c.breakdown).toHaveLength(1);
  });
});

describe('computeStamina (cumulative total + longest-ever & best-PR-ever milestone bonuses)', () => {
  it('blends the 3 lifetime factors into one level with a breakdown, over the FULL history (no window)', () => {
    const runs = [run(1, BASE, 5), run(2, BASE + 7 * 86400, 5), run(3, BASE + 14 * 86400, 5), run(4, BASE + 21 * 86400, 5)];
    const s = computeStamina(runs);
    expect(s.breakdown.map((b) => b.label)).toEqual(['Total', 'Longest', 'Pace']);
    expect(s.breakdown[0]!.value).toBe(20); // sum of ALL 4 runs, not a rolling window
    expect(s.value).toBeGreaterThan(0);
    expect(s.level).toBeGreaterThanOrEqual(0);
    expect(s.level).toBeLessThanOrEqual(100);
    expect(s.confidence).toBe('high');
    expect(s.tier.name).toBeTruthy();
  });

  it('more cumulative distance yields a higher level', () => {
    const small = computeStamina([run(1, BASE, 4), run(2, BASE + 7 * 86400, 4)]);
    const big = computeStamina([run(1, BASE, 40), run(2, BASE + 7 * 86400, 40)]);
    expect(big.level).toBeGreaterThan(small.level);
  });

  it('no runs → LV0', () => {
    expect(computeStamina([]).level).toBe(0);
  });

  // --- FIX 2: the zero-runs case is expressed in the model's OWN units (points), --
  // not a curve, which no longer describes this stat at all.
  it('no runs → the exact points-based zero shape (toNext/nextLevelValue = 1 point, not a curve threshold)', () => {
    expect(computeStamina([])).toEqual({
      value: 0,
      level: 0,
      progressPct: 0,
      toNext: 1,
      nextLevelValue: 1,
      tier: tierForLevel(0),
      confidence: 'high',
      note: 'No runs yet.',
      breakdown: [
        { label: 'Total', value: 0, unit: 'km', level: 0 },
        { label: 'Longest', value: 0, unit: 'km', level: 0 },
        { label: 'Pace', value: 0, unit: 'min/km', level: 0 },
      ],
    });
  });

  // --- FIX 3: exact PR floor boundary (>= nominal*0.98, no upper bound) ------------
  it('PR floor boundary (5k): a run at exactly nominal*0.98 qualifies as a PR candidate; just under it does not', () => {
    // 5k floor = 5 * 0.98 = 4.9 km exactly. The code's check is `< floor`, so a run
    // AT the floor still qualifies. Pro-rated to 5000m: 2646 * 5000/4900 = 2700s
    // exactly — the 45:00 rung (bonus 3).
    const atFloor = computeStamina([runAtTime(1, BASE, 4.9, 2646)]);
    expect(atFloor.breakdown[2]!.level).toBe(3);

    // 5 * 0.9799 = 4.8995 km — a hair under the floor, so it earns NO PR candidate
    // at all (not just a lower rung): the pace bonus is 0, same as no run existing.
    const justUnder = computeStamina([runAtTime(1, BASE, 5 * 0.9799, 2646)]);
    expect(justUnder.breakdown[2]!.level).toBe(0);
  });

  // --- FIX 3: long-run pro-rating banks a shorter-distance PR — INTENTIONAL, ------
  // by design: the PR floor has NO upper distance
  // bound (docs/FORMULAS.md STAMINA): pro-rating a long run's steady pace down to a
  // shorter nominal distance is physiologically CONSERVATIVE (it under-credits
  // relative to what Riegel's endurance formula would predict for a real short
  // effort at that fitness), so a marathon banking a "5k" PR is not a bug to "fix".
  it('INTENTIONAL: a single marathon-length run at a steady fast pace banks a 5k pace bonus (no 5k ever run)', () => {
    // 42.195 km in 9800s (2:43:20) — a steady pace fast enough that pro-rating it
    // down to every nominal distance (5k/10k/HM/FM) reaches the ladder's top rung
    // (bonus 20); ties break toward the earliest-iterated distance, so the reported
    // best PR is attributed to the 5k, purely from this one long run.
    const s = computeStamina([run(1, BASE, 42.195, 9800)]);
    expect(s.breakdown[2]!.level).toBe(20);
    expect(s.note).toContain('best 5k');
  });

  // --- an invented block of 11 short early runs, the anchor case ---
  it('anchor case: 11 short runs, 53 km total, longest 7 km, best 5k ~44:33 (pro-rated) → LV17-18', () => {
    const kmMin: [number, number][] = [
      [3.5, 36], [5.2, 56], [4.8, 50], [5.0, 52], [4.4, 44], [4.0, 41], [7.0, 66], [5.5, 49], [4.5, 45], [4.9, 50], [4.2, 43],
    ];
    const runs = kmMin.map(([km, min], i) => run(i + 1, BASE + i * 86400, km, min * 60));
    const s = computeStamina(runs);
    expect(s.breakdown[0]!.value).toBe(53); // total km
    expect(s.breakdown[1]!.value).toBe(7); // longest single run
    expect(s.value).toBeCloseTo(18.0, 1); // base ~12.0 + longest 3 + pace 3
    expect(s.level).toBeGreaterThanOrEqual(17);
    expect(s.level).toBeLessThanOrEqual(18);
    expect(s.note).toContain('53 km total');
    expect(s.note).toContain('longest 7 km');
    expect(s.note).toContain('best 5k 44:33');
  });

  // --- base curve reference values (docs/FORMULAS.md) ------------------------------
  // NOTE: the formula as specified is `60 * clamp(totalKm/2500,0,1) ** (1/2.4)`; computed
  // literally it reproduces 55/100/2500 km exactly but 250/500/1000 km land a bit above
  // the originally-drafted reference numbers (21.5/28.7/38.3) — 23.0/30.7/41.0 instead.
  // These assertions match what the SPECIFIED FORMULA actually computes (verified
  // independently), not the drafted numbers, per "implement exactly what is specified"
  // taking precedence over a rounded illustrative table.
  it.each([
    [55, 12.2],
    [100, 15.7],
    [250, 23.0],
    [500, 30.7],
    [1000, 41.0],
    [2500, 60.0],
  ])('base(%s km total) ≈ %s pts (isolated via many sub-5km runs so longest/pace stay 0)', (totalKm, expectedBase) => {
    const s = computeStamina(manyShortRuns(totalKm));
    expect(s.breakdown[1]!.level).toBe(0); // longest bonus untouched
    expect(s.breakdown[2]!.level).toBe(0); // pace bonus untouched
    expect(s.value).toBeCloseTo(expectedBase, 1);
  });

  // --- longest-run-ever ladder: hard steps, no interpolation -----------------------
  it('longest bonus is a hard step: 9.99 km stays at the 5 km rung (3 pts), 10 km crosses to 6 pts', () => {
    const below = computeStamina([run(1, BASE, 9.99)]);
    const at = computeStamina([run(1, BASE, 10)]);
    expect(below.breakdown[1]!.level).toBe(3);
    expect(at.breakdown[1]!.level).toBe(6);
  });

  it('below the first longest rung (< 5 km) → 0 bonus', () => {
    const s = computeStamina([run(1, BASE, 4.9)]);
    expect(s.breakdown[1]!.level).toBe(0);
  });

  // --- best-ever-PR pace ladder: hard steps, MAX across the 4 nominal distances ----
  it('a 5k PR of exactly 25:00 → pace bonus 15 (the 25:00 rung), not 13 or 17', () => {
    const s = computeStamina([runAtTime(1, BASE, 5, 25 * 60)]);
    expect(s.breakdown[2]!.level).toBe(15);
  });

  it('a first slow 10k never lowers the pace bonus already earned by a good 5k (MAX, not average)', () => {
    const fast5k = computeStamina([runAtTime(1, BASE, 5, 22 * 60 + 30)]); // 22:30 → 17 pts
    const withSlow10k = computeStamina([runAtTime(1, BASE, 5, 22 * 60 + 30), runAtTime(2, BASE + 86400, 10, 70 * 60)]); // a slow first 10k
    expect(fast5k.breakdown[2]!.level).toBe(17);
    expect(withSlow10k.breakdown[2]!.level).toBe(17); // unchanged — never dragged down
    expect(withSlow10k.value).toBeGreaterThanOrEqual(fast5k.value); // and the stat overall never drops
  });

  it('pro-rates a non-exact distance at its average pace onto the nearest-qualifying nominal distance', () => {
    // 5.5 km in 48:00 pro-rated to 5 km → 48:00 * 5/5.5 = 43:38 (2618s) → the 45:00 rung (3 pts)
    const s = computeStamina([run(1, BASE, 5.5, 48 * 60)]);
    expect(s.breakdown[2]!.level).toBe(3);
    expect(s.note).toContain('best 5k 43:38');
  });

  // --- monotonicity: the whole point of the redesign — never decreases -------------
  describe('monotonicity: computeStamina never drops as runs accumulate (several run shapes)', () => {
    const assertMonotonic = (runs: Run[]) => {
      let prev = 0;
      for (let i = 1; i <= runs.length; i++) {
        const s = computeStamina(runs.slice(0, i));
        expect(s.value).toBeGreaterThanOrEqual(prev);
        prev = s.value;
      }
    };

    it('steady easy runs of increasing distance', () => {
      assertMonotonic([5, 6, 7, 8, 9, 10, 12, 15, 18, 21.1].map((km, i) => run(i + 1, BASE + i * 86400, km)));
    });

    it('a fast short PR followed by a slow long run', () => {
      assertMonotonic([
        runAtTime(1, BASE, 5, 20 * 60), // a very fast 5k PR (20:00 → 20 pts)
        run(2, BASE + 86400, 30, 60 * 200), // then a slow 30 km long run (longest bonus 17 pts)
      ]);
    });

    it('a slow long run followed by a fast short PR', () => {
      assertMonotonic([
        run(1, BASE, 30, 60 * 200), // a slow 30 km long run first
        runAtTime(2, BASE + 86400, 5, 20 * 60), // then a very fast 5k PR
      ]);
    });

    it('mixed distances and paces, real-world-ish', () => {
      const kmMinPairs: [number, number][] = [
        [3.5, 36], [5.2, 56], [4.8, 50], [5.0, 52], [4.4, 44], [4.0, 41], [7.0, 66], [5.5, 49], [4.5, 45], [4.9, 50], [4.2, 43],
        [10, 62], [21.1, 130], [3, 40], [42.2, 260],
      ];
      assertMonotonic(kmMinPairs.map(([km, min], i) => run(i + 1, BASE + i * 86400, km, min * 60)));
    });
  });
});

describe('computeStrength (additive: tonnage base + key-lift & relative milestone bonuses)', () => {
  const FRESH = STRENGTH_FRESH_START;
  const D1 = '2026-07-01';
  const D2 = '2026-07-08';
  const D3 = '2026-07-15';
  const squat = (kg: number, date: string, reps = 5) => sset('Squat', 'barbell', kg, date, false, reps);
  const bench = (kg: number, date: string, reps = 1) => sset('Bench Press', 'barbell', kg, date, false, reps);
  const sumo = (kg: number, date: string, reps = 1) => sset('Sumo Deadlift', 'barbell', kg, date, false, reps);
  /** All three pool lifts at `kg` → key-lift index == kg. */
  const all3 = (kg: number, date: string) => [bench(kg, date), squat(kg, date, 1), sumo(kg, date)];
  const row = (s: ReturnType<typeof computeStrength>, label: string) => s.breakdown.find((b) => b.label === label)!;
  const bw = (kg: number, date = fromLean(3)) => weight(date, kg);
  const dayBeforeFresh = addDaysIso(FRESH, -1);

  it('no counted sessions → LV0, empty breakdown, points-to-LV1 semantics, no note', () => {
    const s = computeStrength([], D1);
    expect(s).toMatchObject({ value: 0, level: 0, toNext: 1, nextLevelValue: 1, confidence: 'high', breakdown: [], note: '', lastSessionDaysAgo: null });
  });

  it('lastSessionDaysAgo = whole days since the latest post-reset session (hold or load)', () => {
    expect(computeStrength([bench(50, D1)], D3).lastSessionDaysAgo).toBe(14);
    expect(computeStrength([bench(50, D1), bench(50, D2)], D3).lastSessionDaysAgo).toBe(7);
    expect(computeStrength([bench(50, '2026-06-01')], D3).lastSessionDaysAgo).toBeNull(); // pre-reset: never counts
    expect(computeStrength([hold('Plank', D2)], D3)).toMatchObject({ level: 0, breakdown: [], lastSessionDaysAgo: 7 });
  });

  it('base curve reference points: 60 * (tonnage/750000)^(1/2.4), capped at 60', () => {
    const at = (kg: number) => computeStrength([sset('Leg Press', 'machine', kg, D1, false, 1)], D2); // volume only: no key-lift bonus
    expect(at(75_000).value).toBe(round1(60 * Math.pow(0.1, 1 / 2.4))); // ≈ 23.0
    expect(at(375_000).value).toBe(round1(60 * Math.pow(0.5, 1 / 2.4))); // ≈ 44.9
    expect(at(750_000).value).toBe(60);
    expect(at(5_000_000).value).toBe(60); // capped
    expect(row(at(75_000), 'Total lifted').level).toBe(22); // floor(base)
    expect(row(at(75_000), 'Total lifted').value).toBe(75_000); // total kg
  });

  it('tonnage = Σ realLoad·reps over every counted session (all sessions, no window)', () => {
    const s = computeStrength([squat(100, addDaysIso(FRESH, 1), 5), squat(100, '2026-10-01', 5)], '2026-10-02');
    expect(row(s, 'Total lifted').value).toBe(1000);
  });

  it('breakdown rows are Total lifted / Best lifts / Lifts ÷ body weight with level = points contributed; confidence high', () => {
    const s = computeStrength(all3(70, D1), D2, [bw(76)]);
    expect(s.breakdown.map((b) => b.label)).toEqual(['Total lifted', 'Best lifts', 'Lifts ÷ body weight']);
    expect(row(s, 'Best lifts')).toMatchObject({ value: 210, unit: 'kg', level: 12 }); // 3 × 4 pts (rung 70)
    expect(row(s, 'Lifts ÷ body weight')).toMatchObject({ value: 2.76, unit: '×bw', level: 18 }); // 3 × 6 pts (70/76 = 0.92 ≥ 0.9)
    expect(s.confidence).toBe('high');
    expect(s.note).toBe('');
    expect(s.level).toBe(Math.floor(s.value));
  });

  it('per-lift ladder: every lift climbs its OWN rungs (hard steps), bonus = sum capped at 20', () => {
    const rungs: [number, number][] = [[39.9, 0], [40, 1], [50, 2], [60, 3], [70, 4], [80, 5], [99.9, 5], [100, 6], [120, 7], [500, 7]];
    for (const [kg, pts] of rungs) {
      expect(row(computeStrength([bench(kg, D1)], D2), 'Best lifts').level, `bench ${kg}`).toBe(pts);
      expect(row(computeStrength([squat(kg, D1, 1)], D2), 'Best lifts').level, `squat ${kg}`).toBe(pts);
      expect(row(computeStrength([sumo(kg, D1)], D2), 'Best lifts').level, `sumo ${kg}`).toBe(pts);
    }
    expect(row(computeStrength(all3(120, D1), D2), 'Best lifts').level).toBe(20); // 21 capped
    expect(row(computeStrength([bench(120, D1), squat(60, D1, 1), sumo(90, D1), bench(100, D2)], D3), 'Best lifts')).toMatchObject({ value: 270, level: 7 + 3 + 5 }); // maxes 120+60+90
  });

  it('a bench-only athlete with a ~55 kg bench max already earns key-lift AND relative points', () => {
    const s = computeStrength([bench(55, D1, 5)], D2, [bw(79)]);
    expect(row(s, 'Best lifts')).toMatchObject({ value: 55, level: 2 });
    expect(row(s, 'Lifts ÷ body weight')).toMatchObject({ value: 0.69, level: 4 }); // 55/79 = 0.696 ≥ 0.6
  });

  it('relative ladder rungs are hard steps per lift (bodyweight 80 kg)', () => {
    const rungs: [number, number][] = [[15.9, 0], [16, 1], [28, 2], [40, 3], [48, 4], [60, 5], [72, 6], [88, 7]];
    for (const [kg, pts] of rungs) expect(row(computeStrength([bench(kg, D1)], D2, [bw(80)]), 'Lifts ÷ body weight').level, `${kg}`).toBe(pts);
  });

  it('no bodyweight ever → relative 0; weigh-ins dated after the latest session are ignored', () => {
    expect(row(computeStrength(all3(180, D1), D2), 'Lifts ÷ body weight').level).toBe(0);
    expect(row(computeStrength(all3(180, D1), D3, [bw(76, D2)]), 'Lifts ÷ body weight').level).toBe(0);
    expect(row(computeStrength(all3(180, D1), D3, [weight(D1, Number.NaN), weight(D1, 0), weight(D1, -5)]), 'Lifts ÷ body weight').level).toBe(0);
  });

  it('relative uses the MIN weigh-in on/before the latest session date', () => {
    const s = computeStrength([...all3(100, D1), ...all3(100, D2)], D3, [bw(90, '2026-06-30'), bw(76, '2026-07-05'), bw(70, D3)]);
    expect(row(s, 'Lifts ÷ body weight').value).toBe(3.94); // 300/76; the 70 kg weigh-in is after the last session
  });

  it('displayed values are floored, never rounded up into an uncredited rung', () => {
    const s = computeStrength([bench(99.99, D1)], D2, [bw(80)]); // 99.99 kg: no 100 rung; 1.2498 ×bw
    expect(row(s, 'Best lifts')).toMatchObject({ value: 99.9, level: 5 });
    expect(row(s, 'Lifts ÷ body weight')).toMatchObject({ value: 1.24, level: 7 });
  });

  it('adding a new lift (or a heavier one) never lowers the value', () => {
    const base = [bench(60, D1, 5)];
    const w = [bw(80)];
    const v0 = computeStrength(base, D2, w).value;
    const v1 = computeStrength([...base, squat(20, D1, 1)], D2, w).value;
    const v2 = computeStrength([...base, squat(20, D1, 1), sumo(20, D1)], D2, w).value;
    expect(v1).toBeGreaterThanOrEqual(v0);
    expect(v2).toBeGreaterThanOrEqual(v1);
  });

  it('hold sets (no load) never feed tonnage, lift points or the bench/squat maxes', () => {
    const plain = computeStrength([bench(60, D1, 5)], D2, [bw(80)]);
    const withHold = computeStrength([bench(60, D1, 5), hold('Plank', D1), hold('Bench Press', D1)], D2, [bw(80)]);
    expect(withHold).toEqual(plain);
  });

  it('fresh start: sessions before STRENGTH_FRESH_START never count; excluded sets never count', () => {
    const old = computeStrength([bench(140, '2026-03-15', 5), squat(500, dayBeforeFresh, 100)], '2026-08-01', [bw(80)]);
    expect(old.level).toBe(0);
    expect(old.breakdown).toEqual([]);
    const onDay = computeStrength(all3(99, FRESH), '2026-08-01');
    expect(row(onDay, 'Best lifts').value).toBe(297);
    const mixed = computeStrength([...all3(99, FRESH), bench(140, dayBeforeFresh), sset('Bench Press', 'barbell', 140, D1, true)], D2);
    expect(row(mixed, 'Best lifts').value).toBe(297);
    expect(computeStrength([bench(100, '2026-03-15')], D2, [], '2000-01-01').level).toBeGreaterThan(0); // custom fresh start
  });

  describe('monotonicity: inserting any session or weigh-in at any date never lowers the level', () => {
    it('back-dated lighter lift: bench 120 on 07-08, then a back-dated sumo 20 on 07-01 → key-lift bonus does not drop', () => {
      const before = computeStrength([bench(120, '2026-07-08')], D3);
      const after = computeStrength([bench(120, '2026-07-08'), sumo(20, '2026-07-01')], D3);
      expect(row(after, 'Best lifts').level).toBeGreaterThanOrEqual(row(before, 'Best lifts').level);
      expect(after.level).toBeGreaterThanOrEqual(before.level);
    });

    it('later heavier weigh-in: bench 125 at bw 76, then a 77 kg weigh-in on/before the PR date → does not drop', () => {
      const sessions = all3(125, D2);
      for (const date of [fromLean(3), D1, D2]) {
        const before = computeStrength(sessions, D3, [bw(76, fromLean(3))]);
        const after = computeStrength(sessions, D3, [bw(76, fromLean(3)), bw(77, date)]);
        expect(after.level).toBeGreaterThanOrEqual(before.level);
        expect(row(after, 'Lifts ÷ body weight').level).toBe(row(before, 'Lifts ÷ body weight').level);
      }
      // also when the only prior weigh-in is older than LEANNESS_FRESH_START
      const old = computeStrength(sessions, D3, [bw(76, fromLean(-58))]);
      expect(computeStrength(sessions, D3, [bw(76, fromLean(-58)), bw(77, fromLean(12))]).level).toBeGreaterThanOrEqual(old.level);
    });

    it('property: random sessions AND weigh-ins inserted in random date order never decrease the level', () => {
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
      const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
      const dateOf = () => {
        const d = new Date(Date.UTC(2026, 5, 22 + int(0, 120)));
        return d.toISOString().slice(0, 10);
      };
      const makeSet = (): ScoredStrengthSet => {
        const date = dateOf();
        const kg = int(10, 160);
        const reps = int(1, 12);
        switch (int(0, 3)) {
          case 0: return bench(kg, date, reps);
          case 1: return sumo(kg, date, reps);
          case 2: return squat(kg, date, reps);
          default: return squat(kg, date, reps);
        }
      };
      for (let trial = 0; trial < 60; trial++) {
        const sets: ScoredStrengthSet[] = [];
        const weights: WeightPoint[] = [];
        let prev = 0;
        for (let step = 0; step < 40; step++) {
          if (rnd() < 0.3) {
            weights.push(weight(dateOf(), int(60, 130)));
          } else if (rnd() < 0.3 && sets.length) {
            // add another exercise to an EXISTING session day
            const day = sets[int(0, sets.length - 1)]!.sessionDateIso;
            sets.push(rnd() < 0.5 ? sumo(int(10, 160), day, int(1, 12)) : bench(int(10, 160), day, int(1, 12)));
          } else {
            sets.push(makeSet());
          }
          const level = computeStrength(sets, '2027-01-01', weights).level;
          expect(level).toBeGreaterThanOrEqual(prev);
          prev = level;
        }
      }
    });
  });
});

describe('goalQuests (leanness / pace / volume)', () => {
  it('produces three goal quests with bounded pct', () => {
    const runs = [run(1, BASE, 5), run(2, BASE + 7 * 86400, 5)];
    const q = goalQuests(runs, [weight(fromLean(-58), 92, 27), weight(LEANNESS_FRESH_START, 88, 25)], GOALS);
    expect(q.map((x) => x.key).sort()).toEqual(['leanness', 'pace', 'volume']);
    for (const x of q) {
      expect(x.pct).toBeGreaterThanOrEqual(0);
      expect(x.pct).toBeLessThanOrEqual(100);
    }
    const lean = q.find((x) => x.key === 'leanness')!;
    expect(lean.label).toContain('82kg @ 14%');
    expect(lean.target).toBe(11.5);
  });

  it('leanness quest falls back to weight when no body-fat % is logged', () => {
    const lean = goalQuests([], [weight(fromLean(-58), 88)], GOALS).find((x) => x.key === 'leanness')!;
    expect(lean.unit).toBe('kg');
    expect(lean.target).toBe(82);
  });

  it('leanness quest anchors its baseline to the fresh start, not an older weigh-in (matches the LEANNESS stat)', () => {
    // A much heavier/fattier pre-fresh-start point (before LEANNESS_FRESH_START) must NOT become the "start" — only
    // the points on/after it may.
    const wps = [weight(fromLean(-58), 96, 30), weight(LEANNESS_FRESH_START, 88, 25), weight(fromLean(17), 84, 20)];
    const lean = goalQuests([], wps, GOALS).find((x) => x.key === 'leanness')!;
    // startFat=22.0 (anchor day), curFat=16.8: (22.0-16.8)/(22.0-11.48)*100 ≈ 49.4%.
    // The pre-anchor point would instead give startFat=28.8 → ≈69.3% — a materially different reading.
    expect(lean.pct).toBe(49);
  });
});

describe('computeLeanness (fat-mass progress to 82kg @ 14%)', () => {
  it('single weigh-in (no progress) → LV0, low confidence', () => {
    const l = computeLeanness([weight(LEANNESS_FRESH_START, 88.0, 24)], GOALS);
    expect(l.value).toBe(0);
    expect(l.confidence).toBe('low');
    expect(l.breakdown.map((b) => b.label)).toEqual(['Fat mass now', 'Goal']);
  });

  it('losing fat mass raises the level', () => {
    const l = computeLeanness([weight(LEANNESS_FRESH_START, 88, 25), weight(fromLean(56), 84, 20)], GOALS);
    expect(l.value).toBeGreaterThan(0);
    expect(l.level).toBeGreaterThan(0);
    expect(l.confidence).toBe('medium'); // ~8 weeks span
    expect(l.note).toContain('goal 11.5 kg');
  });

  it('no body-fat % → weight fallback toward 82 kg', () => {
    const l = computeLeanness([weight(LEANNESS_FRESH_START, 88), weight(fromLean(56), 86)], GOALS);
    expect(l.note).toContain('No body-fat %');
    expect(l.breakdown.map((b) => b.label)).toEqual(['Weight now', 'Goal']);
  });

  it('anchors to the first weigh-in WITH a bf% when logging is mixed', () => {
    // first (post-fresh-start) point has no bf%; later ones do and show fat loss → progress must be > 0
    const l = computeLeanness([weight(LEANNESS_FRESH_START, 90), weight(fromLean(17), 88, 25), weight(fromLean(52), 84, 20)], GOALS);
    expect(l.value).toBeGreaterThan(0);
    expect(l.level).toBeGreaterThan(0);
  });

  it('a pre-fresh-start (< LEANNESS_FRESH_START) weigh-in does not move the anchor', () => {
    // A much heavier/fattier baseline before the restart date would inflate progress if it
    // anchored the fraction — LEANNESS_FRESH_START must exclude it, so the two computations
    // (with vs. without the stale baseline) agree.
    const withoutBaseline = computeLeanness([weight(LEANNESS_FRESH_START, 88, 25), weight(fromLean(17), 86, 22)], GOALS);
    const withStaleBaseline = computeLeanness([
      weight(fromLean(-55), 96, 30), // pre-fresh-start baseline — must be ignored as the anchor
      weight(LEANNESS_FRESH_START, 88, 25),
      weight(fromLean(17), 86, 22),
    ], GOALS);
    expect(withStaleBaseline.value).toBe(withoutBaseline.value);
    expect(withStaleBaseline.level).toBe(withoutBaseline.level);
    expect(withStaleBaseline.breakdown).toEqual(withoutBaseline.breakdown);
  });

  it('falls back to the unfiltered history when every weigh-in predates the fresh start', () => {
    // Edge case: all-pre-fresh-start data must still produce a real (non-crashing, non-zeroed-out)
    // result rather than behaving worse than before the anchor existed.
    const l = computeLeanness([weight(fromLean(-58), 94, 30), weight(fromLean(-39), 91, 27)], GOALS);
    expect(l.value).toBeGreaterThan(0);
    expect(l.confidence).toBe('low'); // < 2 pts of medium-qualifying span given the short window
  });
});

describe('custom goals (LEANNESS + quests)', () => {
  const wps = [weight(LEANNESS_FRESH_START, 88, 25), weight(fromLean(17), 84, 20)]; // startFat 22, curFat 16.8
  const custom = { weightKg: 80, bodyFatPct: 10, paceMinPerKm: 6.0, weeklyKm: 20 }; // target fat 8.0 kg

  it('LEANNESS target fat mass = goal weight x goal body-fat %', () => {
    const l = computeLeanness(wps, custom);
    expect(l.breakdown.find((b) => b.label === 'Goal')!.value).toBe(8);
    expect(l.note).toContain('goal 8 kg (80 kg @ 10%)');
    // a different goal moves the progress fraction (the example 82 @ 14% gives a different value)
    expect(l.value).not.toBe(computeLeanness(wps, GOALS).value);
  });

  it('LEANNESS weight fallback uses the goal weight and body-fat % in the note', () => {
    const l = computeLeanness([weight(LEANNESS_FRESH_START, 88), weight(fromLean(17), 84)], custom);
    expect(l.note).toContain('goal 80 kg');
    expect(l.note).toContain('10% goal');
  });

  it('leanness quest reads the custom goal (label, target, pct on fat mass)', () => {
    const lean = goalQuests([], wps, custom).find((x) => x.key === 'leanness')!;
    expect(lean.label).toBe('To 80kg @ 10%');
    expect(lean.target).toBe(8);
    expect(lean.pct).toBe(37); // (22-16.8)/(22-8)
    expect(lean.done).toBe(false);
  });

  it('pace and volume quests are done at the custom goals, not the old ones', () => {
    // 6:00/km for 5 km, and 20 km in the window... use 80 km => 20 km/wk
    const runs = [run(1, BASE, 80, 80 * 6 * 60)];
    const q = goalQuests(runs, [], custom);
    expect(q.find((x) => x.key === 'pace')!.done).toBe(true);
    expect(q.find((x) => x.key === 'volume')!.done).toBe(true);
  });
});

describe('detectLevelUps', () => {
  const prev: StatHistoryEntry[] = [
    { id: 1, stat: 'STAMINA', date: '2026-06-01', value: 10, level: 2, confidence: 'high', trigger: 'first', inputsJson: '{}' },
  ];

  it('emits a row only when value/level changes, tagging level-ups', () => {
    const next: NewStat[] = [
      { stat: 'STAMINA', value: 16, level: 3, confidence: 'high', inputs: {} }, // changed + level up
      { stat: 'STRENGTH', value: 90, level: 9, confidence: 'medium', inputs: {} }, // first
    ];
    const rows = detectLevelUps(prev, next, '2026-06-18');
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.stat === 'STAMINA')?.trigger).toBe('level_up');
    expect(rows.find((r) => r.stat === 'STRENGTH')?.trigger).toBe('first');
  });

  it('emits nothing when unchanged', () => {
    const next: NewStat[] = [{ stat: 'STAMINA', value: 10, level: 2, confidence: 'high', inputs: {} }];
    expect(detectLevelUps(prev, next, '2026-06-18')).toHaveLength(0);
  });
});
