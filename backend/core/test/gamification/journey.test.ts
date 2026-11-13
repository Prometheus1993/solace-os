import { describe, expect, it } from 'vitest';
import { buildDashboard, computeJourney, DEFAULT_CONFIG, JOURNEY_MAX_POINTS, STRENGTH_FRESH_START, type StatHistoryEntry, type StatName } from '../../src/index.ts';

let nextId = 1;
const row = (stat: StatName, date: string, value: number, level = Math.floor(value)): StatHistoryEntry => ({
  id: nextId++, stat, date, value, level, confidence: 'high', trigger: 'changed', inputsJson: '{}',
});

describe('computeJourney', () => {
  it('has no journey for a track without readings', () => {
    expect(computeJourney([])).toEqual({ stamina: null, strength: null, leanness: null });
  });

  it('starts STAMINA at its first reading and keeps one point per day (the last of that day)', () => {
    const j = computeJourney([
      row('STAMINA', '2026-06-01', 10.2),
      row('STAMINA', '2026-06-01', 10.9),
      row('STAMINA', '2026-06-05', 12.4),
    ]);
    expect(j.stamina).toEqual({
      sinceDate: '2026-06-01',
      startValue: 10.2,
      startLevel: 10,
      points: [{ date: '2026-06-01', value: 10.9 }, { date: '2026-06-05', value: 12.4 }],
    });
    expect(j.strength).toBeNull();
  });

  it('ignores readings from before a track\'s fresh start', () => {
    const j = computeJourney([
      row('STRENGTH', '2026-05-01', 40),
      row('STRENGTH', STRENGTH_FRESH_START, 3),
      row('STRENGTH', '2026-07-01', 8),
    ]);
    expect(j.strength?.sinceDate).toBe(STRENGTH_FRESH_START);
    expect(j.strength?.startValue).toBe(3);
    expect(j.strength?.points.map((p) => p.value)).toEqual([3, 8]);
  });

  it('is empty for a track whose only readings predate its fresh start', () => {
    expect(computeJourney([row('LEANNESS', '2026-01-01', 30)]).leanness).toBeNull();
  });

  it('caps the points at the newest JOURNEY_MAX_POINTS but keeps the true start', () => {
    const day = (i: number) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
    const rows = Array.from({ length: JOURNEY_MAX_POINTS + 10 }, (_, i) => row('STAMINA', day(i), i + 1));
    const j = computeJourney(rows).stamina!;
    expect(j.points).toHaveLength(JOURNEY_MAX_POINTS);
    expect(j.points.at(-1)?.value).toBe(JOURNEY_MAX_POINTS + 10);
    expect(j.startValue).toBe(1);
  });

  it('is part of the dashboard DTO', () => {
    const dto = buildDashboard({
      asOf: '2026-09-12', config: DEFAULT_CONFIG, runs: [], recoveryDays: [], weightPoints: [], scoredStrengthSets: [], shoe: null,
      statHistory: [row('STAMINA', '2026-09-01', 5)], series: [], volumes: [], copies: [], purchases: [], purchaseItems: [], exams: [], schoolTasks: [],
    });
    expect(dto.journey.stamina?.startValue).toBe(5);
    expect(dto.journey.strength).toBeNull();
  });
});
