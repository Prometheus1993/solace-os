import type { RunInput } from '@solace/core';
import { describe, expect, it } from 'vitest';
import {
  backfillRunWeather,
  migrate,
  openDatabase,
  OpenMeteoClient,
  SqliteRepository,
  type FetchLike,
} from '../src/index.ts';

const archive = (date: string, temps: number[]) => ({
  hourly: {
    time: temps.map((_, h) => `${date}T${String(h).padStart(2, '0')}:00`),
    temperature_2m: temps,
    relative_humidity_2m: temps.map(() => 50),
    apparent_temperature: temps.map((t) => t + 2),
  },
});

const stubFetch = (date: string, temps: number[], counter: { n: number }): FetchLike => {
  return async () => {
    counter.n++;
    return { ok: true, status: 200, json: async () => archive(date, temps) };
  };
};

const runAt = (startTimeUtc: number, lat: number | null, lon: number | null): RunInput => ({
  run: {
    sourceFileHash: `h${startTimeUtc}-${lat}`,
    startTimeUtc,
    startTimeLocal: new Date(startTimeUtc * 1000).toISOString(),
    sport: 'running',
    totalDistanceM: 5000,
    totalDurationS: 1800,
    avgHrBpm: 160,
    maxHrBpm: 175,
    avgEnhancedSpeedMps: 2.7,
    avgCadence: 85,
    avgPowerW: null,
    startLatDeg: lat,
    startLonDeg: lon,
    elevationGainM: null,
    temperatureSource: 'none',
    correctedTemperatureC: null,
    shoeId: null,
  },
  samples: [],
  laps: [],
});

describe('OpenMeteoClient', () => {
  it('fetches a day once, caches it, then serves any hour from cache', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    const counter = { n: 0 };
    const temps = Array.from({ length: 24 }, (_, h) => 10 + h); // 10..33°C
    const client = new OpenMeteoClient(repo, { fetchFn: stubFetch('2026-05-28', temps, counter) });

    const w = await client.getHourly(50.85, 4.35, '2026-05-28', 14);
    expect(w?.temperatureC).toBe(24); // 10 + 14
    expect(w?.apparentTemperatureC).toBe(26);
    expect(counter.n).toBe(1);

    const w2 = await client.getHourly(50.85, 4.35, '2026-05-28', 8); // same day -> cache
    expect(w2?.temperatureC).toBe(18);
    expect(counter.n).toBe(1); // no second fetch
    db.close();
  });
});

describe('backfillRunWeather', () => {
  it('sets the apparent temperature on GPS runs and skips GPS-less ones', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);

    const t14 = Math.floor(Date.UTC(2026, 4, 28, 14, 0, 0) / 1000); // 14:00 UTC
    const withGps = await repo.saveRun(runAt(t14, 50.85, 4.35));
    const noGps = await repo.saveRun(runAt(t14 + 86400, null, null));

    const counter = { n: 0 };
    const temps = Array.from({ length: 24 }, (_, h) => 10 + h);
    const client = new OpenMeteoClient(repo, { fetchFn: stubFetch('2026-05-28', temps, counter) });

    const summary = await backfillRunWeather(repo, client);
    expect(summary.updated).toBe(1);
    expect(summary.skippedNoGps).toBe(1);

    const updated = await repo.getRuns();
    const gpsRun = updated.find((r) => r.id === withGps.id);
    expect(gpsRun?.temperatureSource).toBe('weather');
    expect(gpsRun?.correctedTemperatureC).toBe(26); // apparent at 14:00 = 24 + 2
    expect(updated.find((r) => r.id === noGps.id)?.temperatureSource).toBe('none');
    db.close();
  });
});
