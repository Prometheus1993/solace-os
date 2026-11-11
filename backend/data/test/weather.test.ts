import { fixedClock, type Clock, type RunInput, type UnixSeconds } from '@solace/core';
import { describe, expect, it, vi } from 'vitest';
import {
  backfillRunWeather,
  createSkySource,
  DEFAULT_SKY_LOCATION,
  migrate,
  openDatabase,
  OpenMeteoClient,
  skyLocation,
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

describe('OpenMeteoClient.getSky', () => {
  const client = (fetchFn: FetchLike) => {
    const db = openDatabase(':memory:');
    migrate(db);
    return new OpenMeteoClient(new SqliteRepository(db), { fetchFn });
  };
  const forecast = { current: { weather_code: 61 }, daily: { sunrise: [1_794_380_000], sunset: [1_794_413_000] } };

  it('reads sunrise, sunset and the current weather code from the forecast API', async () => {
    const urls: string[] = [];
    const sky = await client(async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => forecast };
    }).getSky(51.22, 4.4);
    expect(sky).toEqual({ sunrise: 1_794_380_000, sunset: 1_794_413_000, weatherCode: 61 });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('https://api.open-meteo.com/v1/forecast?latitude=51.22&longitude=4.4&');
    expect(urls[0]).toContain('current=weather_code');
    expect(urls[0]).toContain('daily=sunrise,sunset');
    expect(urls[0]).toContain('timeformat=unixtime');
  });

  it('throws on a non-200 and on a response without the fields', async () => {
    await expect(client(async () => ({ ok: false, status: 503, json: async () => ({}) })).getSky(51.22, 4.4)).rejects.toThrow('503');
    await expect(client(async () => ({ ok: true, status: 200, json: async () => ({ current: {} }) })).getSky(51.22, 4.4)).rejects.toThrow('no sun times');
  });
});

describe('createSkySource (30-minute in-memory cache, injected clock)', () => {
  const reading = { sunrise: 100 as UnixSeconds, sunset: 200 as UnixSeconds, weatherCode: 3 };
  const tickingClock = () => {
    const state = { now: 1_000_000 };
    const clock: Clock = { ...fixedClock(0, '2026-11-11'), now: () => state.now as UnixSeconds };
    return { state, clock };
  };

  it('reads once, serves the cache for 30 minutes, then reads again', async () => {
    const { state, clock } = tickingClock();
    let reads = 0;
    const sky = createSkySource(async () => ({ ...reading, weatherCode: ++reads }), clock);

    expect(await sky()).toEqual({ ...reading, weatherCode: 1, fetchedAt: 1_000_000 });
    state.now += 30 * 60 - 1;
    expect(await sky()).toEqual({ ...reading, weatherCode: 1, fetchedAt: 1_000_000 });
    expect(reads).toBe(1);
    state.now += 1;
    expect(await sky()).toEqual({ ...reading, weatherCode: 2, fetchedAt: 1_000_000 + 30 * 60 });
    expect(reads).toBe(2);
  });

  it('shares one read between concurrent callers', async () => {
    const { clock } = tickingClock();
    let reads = 0;
    const sky = createSkySource(async () => {
      reads++;
      return reading;
    }, clock);
    const [a, b] = await Promise.all([sky(), sky()]);
    expect(a).toEqual(b);
    expect(reads).toBe(1);
  });

  it('a failed read gives null instead of throwing and is retried after 5 minutes', async () => {
    const { state, clock } = tickingClock();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let reads = 0;
    const sky = createSkySource(async () => {
      if (++reads === 1) throw new Error('offline');
      return reading;
    }, clock);

    expect(await sky()).toBeNull();
    state.now += 5 * 60 - 1;
    expect(await sky()).toBeNull();
    expect(reads).toBe(1);
    state.now += 1;
    expect(await sky()).toEqual({ ...reading, fetchedAt: 1_000_000 + 5 * 60 });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('skyLocation', () => {
  it('defaults to Antwerp, takes SOLACE_LAT + SOLACE_LON, and SOLACE_SKY=0 turns it off', () => {
    expect(skyLocation({})).toEqual({ lat: 51.22, lon: 4.4 });
    expect(skyLocation({ SOLACE_LAT: '48.86', SOLACE_LON: '2.35' })).toEqual({ lat: 48.86, lon: 2.35 });
    expect(skyLocation({ SOLACE_LAT: '0', SOLACE_LON: '0' })).toEqual({ lat: 0, lon: 0 });
    expect(skyLocation({ SOLACE_SKY: '0', SOLACE_LAT: '48.86', SOLACE_LON: '2.35' })).toBeNull();
  });

  it('falls back to the default (with a warning) when the pair is incomplete or out of range', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(skyLocation({ SOLACE_LAT: '48.86' })).toEqual(DEFAULT_SKY_LOCATION);
    expect(skyLocation({ SOLACE_LAT: 'north', SOLACE_LON: '2.35' })).toEqual(DEFAULT_SKY_LOCATION);
    expect(skyLocation({ SOLACE_LAT: '91', SOLACE_LON: '2.35' })).toEqual(DEFAULT_SKY_LOCATION);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
