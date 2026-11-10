/**
 * Garmin sync orchestrator — the shared engine behind the dashboard "Sync Garmin"
 * button (POST /api/sync-garmin).
 *
 * A standalone Python fetcher (`scripts/garmin_fetch.py`) does the Garmin API calls + writes
 * artifact files, and this function ingests the FIT
 * runs + the rolling wellness JSON through the existing pipeline, backfill weather,
 * and recompute the stat tracks.
 *
 *   compute windows → runFetcher (spawns Python) → ingest FIT + JSON → backfill weather → recompute
 *
 * The fetch step is injected (`opts.runFetcher`) so tests exercise the
 * orchestration without Python or the network.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDaysIso, type Clock, type Repository, type WeatherPort } from '@solace/core';
import { backfillRunWeather, ingestGarminWellnessJson, ingestRunFromFit } from './ingest-pipeline.ts';
import { recomputeStats } from './recompute-service.ts';

/** Where the rolling files live, relative to the process CWD (the project root). */
const RUNS_DIR_REL = ['source-exports', 'runs'];
const WELLNESS_FILE_REL = ['source-exports', 'wellness', 'garmin-mcp.json'];

/** Arguments handed to the fetcher (one fetch window). All dates are YYYY-MM-DD. */
export interface GarminFetchArgs {
  today: string;
  runsQueryStart: string;
  runsAfter: string;
  wellnessStart: string;
  runsDir: string;
  wellnessFile: string;
  tokens?: string;
}

/** What the fetcher reports back (the Python script's stdout JSON, or a fake in tests). */
export interface GarminFetchResult {
  ok: boolean;
  newRuns: Array<{ id: number; date: string; file: string }>;
  wellnessDays: string[];
  error?: string;
  message?: string;
}

export type RunFetcher = (args: GarminFetchArgs) => Promise<GarminFetchResult>;

/** The four dates that bound a fetch, derived from the DB high-water marks. */
export interface GarminWindows {
  runsQueryStart: string;
  runsAfter: string;
  wellnessStart: string;
  today: string;
}

export interface GarminSyncOptions {
  /** Inject the fetch step (default = spawn the Python script via uv). The test seam. */
  runFetcher?: RunFetcher;
  /** Override the runs output dir (default <cwd>/source-exports/runs). */
  runsDir?: string;
  /** Override the rolling wellness file (default <cwd>/source-exports/wellness/garmin-mcp.json). */
  wellnessFile?: string;
  /** garth token store dir passed to the fetcher (default the script's own ~/.garminconnect). */
  tokens?: string;
}

export interface GarminSyncSummary {
  newRuns: Array<{ id: number; date: string; imported: boolean }>;
  runsImported: number;
  wellnessDays: string[];
  recoveryDaysWritten: number;
  /** Runs whose temperature got backfilled, or null if the weather step was skipped/failed. */
  weatherUpdated: number | null;
  windows: { runsQueryStart: string; runsAfter: string; wellnessStart: string; today: string };
}

/** A sync failure with a stable `kind` so callers can map auth → "re-auth" messaging. */
export class GarminSyncError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'fetch' | 'spawn' | 'import',
  ) {
    super(message);
    this.name = 'GarminSyncError';
  }
}

/** Locate the Python fetcher relative to this module (works under tsx, no build step). */
function fetcherScriptPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'garmin_fetch.py');
}

/** Resolve the `uv` binary: env override → known Homebrew path → bare `uv` (rely on PATH). */
function resolveUvBin(): string {
  const override = process.env['SOLACE_UV_BIN'];
  if (override) return override;
  if (existsSync('/opt/homebrew/bin/uv')) return '/opt/homebrew/bin/uv';
  return 'uv';
}

/** Default fetcher: run the Python script in an ephemeral uv env (garminconnect pinned to match the MCP). */
const spawnPythonFetcher: RunFetcher = (args) =>
  new Promise((resolvePromise, reject) => {
    const script = fetcherScriptPath();
    const argv = [
      'run',
      '--python',
      '3.12',
      '--with',
      'garminconnect==0.3.2',
      'python',
      script,
      '--today',
      args.today,
      '--runs-query-start',
      args.runsQueryStart,
      '--runs-after',
      args.runsAfter,
      '--wellness-start',
      args.wellnessStart,
      '--runs-dir',
      args.runsDir,
      '--wellness-file',
      args.wellnessFile,
    ];
    if (args.tokens) argv.push('--tokens', args.tokens);

    execFile(
      resolveUvBin(),
      argv,
      { maxBuffer: 16 * 1024 * 1024, timeout: 5 * 60_000 },
      (err, stdout, stderr) => {
        // The script prints exactly one JSON object to stdout — on success AND on its own
        // handled failures (ok:false). Parse that first; only treat as a spawn error if absent.
        const text = (stdout || '').trim();
        const lastLine = text ? text.split('\n').filter(Boolean).at(-1) : undefined;
        if (lastLine) {
          try {
            resolvePromise(JSON.parse(lastLine) as GarminFetchResult);
            return;
          } catch {
            // fall through to error handling below
          }
        }
        const detail = (stderr || '').trim().split('\n').filter(Boolean).at(-1) ?? String(err ?? 'no output');
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new GarminSyncError(`could not run uv (${resolveUvBin()}): ${detail}`, 'spawn'));
        } else {
          reject(new GarminSyncError(`fetcher produced no parseable output: ${detail}`, 'fetch'));
        }
      },
    );
  });

/** Compute the fetch windows from the DB high-water marks. */
export async function computeGarminWindows(repo: Repository, today: string): Promise<GarminWindows> {
  const lastRun = await repo.latestRunDate();
  const lastRecovery = await repo.latestRecoveryDate();
  // Runs: import from lastRun INCLUSIVE — the Python fetcher keeps `date >= runsAfter` so a 2nd run on
  // the already-imported day isn't lost (the file-hash dedupe drops the one already in the DB). With no
  // runs yet (a fresh database), dedupe can't protect us, so floor the window: `runsQueryStart` = today-9
  // bounds the query and `runsAfter` = today-10 keeps everything fetched, nothing older.
  const runsAfter = lastRun ?? addDaysIso(today, -10);
  const runsQueryStart = lastRun ?? addDaysIso(today, -9);
  // Wellness: re-fetch from lastRecovery (late-arriving metrics) through today; floor today-9 if empty.
  const wellnessStart = lastRecovery ?? addDaysIso(today, -9);
  return { runsQueryStart, runsAfter, wellnessStart, today };
}

/**
 * Pull everything new from Garmin, ingest it, and recompute the stat tracks.
 * Throws {@link GarminSyncError} on a fetch/auth failure (nothing is half-ingested:
 * the fetcher writes its files atomically before we read them).
 */
export async function syncGarmin(
  repo: Repository,
  clock: Clock,
  weather: WeatherPort,
  opts: GarminSyncOptions = {},
): Promise<GarminSyncSummary> {
  const today = clock.today();
  const windows = await computeGarminWindows(repo, today);

  const runsDir = opts.runsDir ?? resolve(process.cwd(), ...RUNS_DIR_REL);
  const wellnessFile = opts.wellnessFile ?? resolve(process.cwd(), ...WELLNESS_FILE_REL);
  const runFetcher = opts.runFetcher ?? spawnPythonFetcher;

  const fetchArgs: GarminFetchArgs = { ...windows, runsDir, wellnessFile };
  if (opts.tokens) fetchArgs.tokens = opts.tokens;
  const fetched = await runFetcher(fetchArgs);
  if (!fetched.ok) {
    const kind = fetched.error === 'auth' ? 'auth' : fetched.error === 'import' ? 'import' : 'fetch';
    throw new GarminSyncError(fetched.message ?? `Garmin fetch failed (${fetched.error ?? 'unknown'})`, kind);
  }

  // Ingest the new runs (FIT bytes → run rows; dedupe by hash is downstream so re-runs are safe).
  // A single corrupt/truncated FIT must NOT abort the whole sync (importFit throws a plain Error on a bad
  // file). Isolate each run: on failure, quarantine the .fit to `.bad` so the next sync re-downloads it
  // fresh (self-healing for a transient truncated download) instead of permanently re-failing on it.
  const newRuns: GarminSyncSummary['newRuns'] = [];
  let runsImported = 0;
  for (const r of fetched.newRuns) {
    try {
      const bytes = readFileSync(r.file);
      const result = await ingestRunFromFit(repo, new Uint8Array(bytes));
      if (result.imported) runsImported += 1;
      newRuns.push({ id: r.id, date: r.date, imported: result.imported });
    } catch {
      try {
        renameSync(r.file, `${r.file}.bad`);
      } catch {
        /* best-effort quarantine */
      }
      newRuns.push({ id: r.id, date: r.date, imported: false });
    }
  }

  // Ingest the whole rolling wellness file (COALESCE-merge by date; idempotent).
  let recoveryDaysWritten = 0;
  if (existsSync(wellnessFile)) {
    const wellness = await ingestGarminWellnessJson(repo, readFileSync(wellnessFile, 'utf8'));
    recoveryDaysWritten = wellness.daysWritten;
  }

  // Best-effort temperature backfill for any new runs (needs network; never fail the sync over it).
  let weatherUpdated: number | null = null;
  try {
    const w = await backfillRunWeather(repo, weather);
    weatherUpdated = w.updated;
  } catch {
    weatherUpdated = null;
  }

  await recomputeStats(repo, clock);

  return { newRuns, runsImported, wellnessDays: fetched.wellnessDays, recoveryDaysWritten, weatherUpdated, windows };
}
