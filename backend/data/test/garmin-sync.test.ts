import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Clock, RecoveryDayInput, RunInput, UnixSeconds, WeatherPort } from '@solace/core';
import {
  computeGarminWindows,
  GarminSyncError,
  migrate,
  openDatabase,
  SqliteRepository,
  syncGarmin,
  type GarminFetchArgs,
  type RunFetcher,
} from '../src/index.ts';

function ctx() {
  const db = openDatabase(':memory:');
  migrate(db);
  return { db, repo: new SqliteRepository(db) };
}

const clockOf = (today: string): Clock => ({ now: () => 0 as UnixSeconds, today: () => today });

/** Open-Meteo stub: never resolves an hour, so the weather backfill is a no-op. */
const noWeather: WeatherPort = { getHourly: async () => null };

function runOn(localDate: string): RunInput {
  return {
    run: {
      sourceFileHash: `hash-${localDate}`,
      startTimeUtc: 0,
      startTimeLocal: `${localDate}T08:00:00`,
      sport: 'running',
      totalDistanceM: 5000,
      totalDurationS: 1800,
      avgHrBpm: null,
      maxHrBpm: null,
      avgEnhancedSpeedMps: null,
      avgCadence: null,
      avgPowerW: null,
      startLatDeg: null,
      startLonDeg: null,
      elevationGainM: null,
      temperatureSource: 'none',
      correctedTemperatureC: null,
      shoeId: null,
    },
    samples: [],
    laps: [],
  };
}

const recovery = (date: string): RecoveryDayInput => ({
  date,
  sleepScore: 70,
  hrvOvernightMs: null,
  restingHrBpm: null,
  bodyBattery: null,
  source: 'garmin_mcp',
});

describe('latestRunDate / latestRecoveryDate', () => {
  it('return null on an empty DB', async () => {
    const { repo } = ctx();
    expect(await repo.latestRunDate()).toBeNull();
    expect(await repo.latestRecoveryDate()).toBeNull();
  });

  it('return the max calendar date present', async () => {
    const { repo } = ctx();
    await repo.saveRun(runOn('2026-07-18'));
    await repo.saveRun(runOn('2026-07-22'));
    await repo.upsertRecoveryDays([recovery('2026-07-19'), recovery('2026-07-21')]);
    expect(await repo.latestRunDate()).toBe('2026-07-22');
    expect(await repo.latestRecoveryDate()).toBe('2026-07-21');
  });
});

describe('computeGarminWindows', () => {
  it('floors at today-9 (and runsAfter at today-10) when the DB is empty — never unbounded', async () => {
    const { repo } = ctx();
    expect(await computeGarminWindows(repo, '2026-07-23')).toEqual({
      runsQueryStart: '2026-07-14',
      runsAfter: '2026-07-13', // today-10 so date > runsAfter includes today-9 but nothing older
      wellnessStart: '2026-07-14',
      today: '2026-07-23',
    });
  });

  it('uses the high-water marks once data exists', async () => {
    const { repo } = ctx();
    await repo.saveRun(runOn('2026-07-20'));
    await repo.upsertRecoveryDays([recovery('2026-07-21')]);
    expect(await computeGarminWindows(repo, '2026-07-23')).toEqual({
      runsQueryStart: '2026-07-20',
      runsAfter: '2026-07-20', // import strictly after the last run we already have
      wellnessStart: '2026-07-21', // re-fetch the last recovery day (late-arriving metrics)
      today: '2026-07-23',
    });
  });
});

describe('syncGarmin orchestration', () => {
  const dirs: string[] = [];
  const tmp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'solace-sync-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('passes the computed windows to the fetcher and ingests its wellness file', async () => {
    const { repo } = ctx();
    const dir = tmp();
    const wellnessFile = join(dir, 'garmin-mcp.json');

    let captured: GarminFetchArgs | null = null;
    const fetcher: RunFetcher = async (args) => {
      captured = args;
      writeFileSync(
        args.wellnessFile,
        JSON.stringify({
          source: 'garmin_mcp',
          days: [{ date: '2026-07-22', sleepScore: 63, hrvOvernightMs: 36, restingHrBpm: 58, bodyBattery: 79 }],
        }),
      );
      return { ok: true, newRuns: [], wellnessDays: ['2026-07-22'] };
    };

    const summary = await syncGarmin(repo, clockOf('2026-07-23'), noWeather, { runFetcher: fetcher, runsDir: dir, wellnessFile });

    expect(captured).toEqual({
      runsQueryStart: '2026-07-14',
      runsAfter: '2026-07-13',
      wellnessStart: '2026-07-14',
      today: '2026-07-23',
      runsDir: dir,
      wellnessFile,
    });
    expect(summary.recoveryDaysWritten).toBe(1);
    expect(summary.wellnessDays).toEqual(['2026-07-22']);
    expect(summary.runsImported).toBe(0);
    const day = (await repo.getRecoveryDays()).find((d) => d.date === '2026-07-22');
    expect(day).toMatchObject({ sleepScore: 63, hrvOvernightMs: 36, restingHrBpm: 58, bodyBattery: 79 });
  });

  it('is idempotent: re-running merges the same day, no duplicate rows', async () => {
    const { repo } = ctx();
    const dir = tmp();
    const wellnessFile = join(dir, 'garmin-mcp.json');
    const fetcher: RunFetcher = async (args) => {
      writeFileSync(args.wellnessFile, JSON.stringify({ source: 'garmin_mcp', days: [{ date: '2026-07-22', sleepScore: 63 }] }));
      return { ok: true, newRuns: [], wellnessDays: ['2026-07-22'] };
    };
    await syncGarmin(repo, clockOf('2026-07-23'), noWeather, { runFetcher: fetcher, runsDir: dir, wellnessFile });
    await syncGarmin(repo, clockOf('2026-07-23'), noWeather, { runFetcher: fetcher, runsDir: dir, wellnessFile });
    expect((await repo.getRecoveryDays()).filter((d) => d.date === '2026-07-22')).toHaveLength(1);
  });

  it('throws GarminSyncError(kind="auth") when the fetcher reports an auth failure', async () => {
    const { repo } = ctx();
    const dir = tmp();
    const fetcher: RunFetcher = async () => ({ ok: false, error: 'auth', message: 're-auth needed', newRuns: [], wellnessDays: [] });
    await expect(
      syncGarmin(repo, clockOf('2026-07-23'), noWeather, { runFetcher: fetcher, runsDir: dir, wellnessFile: join(dir, 'w.json') }),
    ).rejects.toMatchObject({ name: 'GarminSyncError', kind: 'auth' });
  });

  it('maps a non-auth fetch failure to GarminSyncError(kind="fetch")', async () => {
    const { repo } = ctx();
    const dir = tmp();
    const fetcher: RunFetcher = async () => ({ ok: false, error: 'fetch', message: 'garmin 500', newRuns: [], wellnessDays: [] });
    const err = await syncGarmin(repo, clockOf('2026-07-23'), noWeather, { runFetcher: fetcher, runsDir: dir, wellnessFile: join(dir, 'w.json') }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GarminSyncError);
    expect((err as GarminSyncError).kind).toBe('fetch');
  });
});
