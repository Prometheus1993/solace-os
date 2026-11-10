import { describe, expect, it } from 'vitest';
import { migrate, openDatabase, SqliteRepository } from '../src/index.ts';

describe('weight points', () => {
  it('saves and returns weight points ordered by date, body-fat optional', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);

    await repo.saveWeightPoint({ date: '2026-03-10', weightKg: 74, bodyFatPct: 24, source: 'manual', notes: null });
    await repo.saveWeightPoint({ date: '2026-03-25', weightKg: 71.5, bodyFatPct: null, source: 'manual', notes: null });

    const points = await repo.getWeightPoints();
    expect(points).toHaveLength(2);
    expect(points[0]?.date).toBe('2026-03-10');
    expect(points[0]?.weightKg).toBe(74);
    expect(points[1]?.bodyFatPct).toBeNull();
  });
});
