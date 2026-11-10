import { DEFAULT_CONFIG, DEFAULT_SHOE, fixedClock } from '@solace/core';
import { describe, expect, it } from 'vitest';
import {
  assembleDashboard,
  backfillRunWeather,
  ingestGarminWellnessJson,
  ingestManualStrengthSession,
  ingestRunFromFit,
  migrate,
  openDatabase,
  OpenMeteoClient,
  SqliteRepository,
  toRawStrengthSession,
  validateManualStrengthInput,
  type FetchLike,
} from '../src/index.ts';
import { makeSyntheticFit } from './fixtures/make-fit.ts';

const STRENGTH = {
  date: '2026-06-10',
  exercises: [
    { name: 'Bench Press', sets: [{ reps: 5, weightKg: 60 }] },
    { name: 'Incline Db Bench Press', sets: [{ reps: 8, weightKg: 22 }] },
    { name: 'Lat Pulldown', sets: [{ reps: 12, weightKg: 50 }] },
  ],
};

const WELLNESS_JSON = JSON.stringify({
  days: [
    { date: '2026-06-18', hrvOvernightMs: 35 },
    { date: '2026-06-17', hrvOvernightMs: 42 },
  ],
});

const weatherStub: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    hourly: {
      time: Array.from({ length: 24 }, (_, h) => `2026-05-20T${String(h).padStart(2, '0')}:00`),
      temperature_2m: Array.from({ length: 24 }, (_, h) => 10 + h),
      relative_humidity_2m: Array.from({ length: 24 }, () => 50),
      apparent_temperature: Array.from({ length: 24 }, (_, h) => 11 + h),
    },
  }),
});

describe('end-to-end: import everything -> dashboard DTO', () => {
  it('runs the full pipeline and assembles a coherent UI contract', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);

    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    await repo.saveShoe({ model: DEFAULT_SHOE.model, priorCountedKm: DEFAULT_SHOE.priorCountedKm, notes: null });

    await ingestRunFromFit(repo, makeSyntheticFit({ n: 1800, avgHr: 164, lat: 50.85, lon: 4.35, withTemperature: false }));
    await ingestManualStrengthSession(repo, toRawStrengthSession(validateManualStrengthInput(STRENGTH)));
    await ingestGarminWellnessJson(repo, WELLNESS_JSON);
    await repo.saveWeightPoint({ date: '2026-06-10', weightKg: 88.0, bodyFatPct: 24, source: 'manual', notes: null });
    await backfillRunWeather(repo, new OpenMeteoClient(repo, { fetchFn: weatherStub }));

    const dto = await assembleDashboard(repo, fixedClock(1_750_000_000, '2026-06-18'));
    expect(dto).not.toBeNull();

    expect(dto!.totals.runCount).toBe(1);
    expect(dto!.totals.strengthSets).toBe(3);
    expect(dto!.athlete.maxHr).toBe(DEFAULT_CONFIG.maxHr);
    expect(dto!.recentRuns).toHaveLength(1);
    expect(dto!.readiness.recommendation).toBeDefined();
    expect(dto!.stats.stamina.value).toBeGreaterThan(0);
    expect(dto!.quests).toHaveLength(3);
    expect(dto!.shoe?.baselineKm).toBe(DEFAULT_SHOE.priorCountedKm);
    expect(dto!.shoe?.sinceResetKm).toBe(dto!.totals.totalRunKm);
    expect(dto!.shoe?.authoritativeKm).toBeCloseTo(DEFAULT_SHOE.priorCountedKm + dto!.totals.totalRunKm, 1);

    // The run picked up a weather temperature (heat correction is wired).
    expect(dto!.recentRuns[0]?.temperatureC).not.toBeNull();

    // The DTO must be JSON-serializable (the UI contract).
    expect(() => JSON.stringify(dto)).not.toThrow();
    db.close();
  });
});
