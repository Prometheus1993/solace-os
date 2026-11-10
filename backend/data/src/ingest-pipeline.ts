import {
  correctStrengthSet,
  determineSessionConvention,
  unixToIsoDate,
  type Repository,
  type Run,
  type StrengthSession,
  type StrengthSessionInput,
  type WeatherPort,
} from '@solace/core';
import { hashHex } from './hash.ts';
import { importFit } from './importers/fit-importer.ts';
import type { RawStrengthSession } from './importers/strength-import-types.ts';
import { parseGarminWellnessJson } from './importers/garmin-json-importer.ts';

export interface IngestResult {
  imported: boolean;
  run: Run;
  reason?: string;
}

/**
 * Ingest a FIT file end-to-end: hash -> dedupe -> parse -> persist run+samples+laps.
 * Dedupe is by SHA-256 of the file bytes, so re-importing the same export never
 * double-counts (which would, e.g., inflate shoe mileage). Heat/temperature
 * backfill from the weather API is separate: `backfillRunWeather`.
 */
export async function ingestRunFromFit(repo: Repository, bytes: Uint8Array): Promise<IngestResult> {
  const hash = hashHex(bytes);

  const existing = await repo.findRunByHash(hash);
  if (existing) {
    return { imported: false, run: existing, reason: 'duplicate (same file hash)' };
  }

  const parsed = importFit(bytes);
  const shoes = await repo.getShoes();
  const shoeId = shoes[0]?.id ?? null;

  const runInput = {
    run: {
      sourceFileHash: hash,
      startTimeUtc: parsed.startTimeUtc,
      startTimeLocal: parsed.startTimeLocal,
      sport: parsed.sport,
      totalDistanceM: parsed.totalDistanceM,
      totalDurationS: parsed.totalDurationS,
      avgHrBpm: parsed.avgHrBpm,
      maxHrBpm: parsed.maxHrBpm,
      avgEnhancedSpeedMps: parsed.avgEnhancedSpeedMps,
      avgCadence: parsed.avgCadence,
      avgPowerW: parsed.avgPowerW,
      startLatDeg: parsed.startLatDeg,
      startLonDeg: parsed.startLonDeg,
      elevationGainM: parsed.elevationGainM,
      temperatureSource: parsed.temperatureSource,
      correctedTemperatureC: parsed.correctedTemperatureC,
      shoeId,
    },
    samples: parsed.samples,
    laps: parsed.laps,
  };

  let run;
  try {
    run = await repo.saveRun(runInput);
  } catch (e) {
    // TOCTOU: a concurrent ingest of the SAME file (e.g. a drag-drop during a Garmin sync) may have
    // inserted this hash between findRunByHash above and here, tripping UNIQUE(source_file_hash). Treat
    // that as the duplicate it is rather than surfacing a 500.
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      const dup = await repo.findRunByHash(hash);
      if (dup) return { imported: false, run: dup, reason: 'duplicate (concurrent insert)' };
    }
    throw e;
  }

  return { imported: true, run };
}

export interface ConventionDates {
  conventionStart: string;
  switchDate: string;
}

/**
 * Run the conventions engine (unit normalisation THEN +20/x2/total-weight/
 * pre-2022) over one raw session's sets, producing the corrected
 * `StrengthSessionInput` ready for `repo.saveStrengthSession` — WITHOUT
 * persisting anything. The single correction funnel for every strength
 * importer (manual entry): nothing else may apply this math. Equipment
 * may be pre-classified by the caller (manual entry infers it from the
 * exercise name; titles fall back to the trailing "(Equipment)" tag).
 */
export function buildStrengthSessionInput(s: RawStrengthSession, conv: ConventionDates): StrengthSessionInput {
  const sessionConv = determineSessionConvention(s.sessionDateIso, conv);
  const correctedSets: StrengthSessionInput['sets'] = s.sets.map((raw) => {
    // A hold set (seconds, no reps/load) has nothing to convert: it skips the funnel, is excluded from every
    // trend/PR/point and is never converted.
    if (raw.durationSeconds != null && raw.reps == null) {
      return {
        exerciseTitleRaw: raw.exerciseTitleRaw,
        exerciseName: raw.exerciseName ?? raw.exerciseTitleRaw,
        equipment: raw.equipment ?? 'other',
        supersetId: raw.supersetId,
        setIndex: raw.setIndex,
        setType: raw.setType,
        rawWeight: null,
        rawWeightUnit: raw.rawWeightUnit,
        reps: null,
        rpe: raw.rpe,
        distanceMiles: raw.distanceMiles,
        durationSeconds: raw.durationSeconds,
        weightKgNormalized: null,
        realLoadKg: null,
        correctionApplied: 'hold set',
        excludedFromTrend: true,
      };
    }
    const c = correctStrengthSet(
      {
        exerciseTitleRaw: raw.exerciseTitleRaw,
        rawWeight: raw.rawWeight,
        rawWeightUnit: raw.rawWeightUnit,
        sessionDateIso: s.sessionDateIso,
        ...(raw.equipment ? { equipment: raw.equipment } : {}),
        ...(raw.exerciseName ? { exerciseName: raw.exerciseName } : {}),
      },
      conv,
    );
    return {
      exerciseTitleRaw: raw.exerciseTitleRaw,
      exerciseName: c.exerciseName,
      equipment: c.equipment,
      supersetId: raw.supersetId,
      setIndex: raw.setIndex,
      setType: raw.setType,
      rawWeight: raw.rawWeight,
      rawWeightUnit: raw.rawWeightUnit,
      reps: raw.reps,
      rpe: raw.rpe,
      distanceMiles: raw.distanceMiles,
      durationSeconds: raw.durationSeconds,
      weightKgNormalized: c.weightKgNormalized,
      realLoadKg: c.realLoadKg,
      correctionApplied: c.correctionApplied,
      excludedFromTrend: c.excludedFromTrend,
    };
  });

  return {
    session: {
      sourceRowHash: s.sourceRowHash,
      title: s.title,
      startTimeUtc: s.startTimeUtc,
      pre2022: sessionConv.pre2022,
      loggingConvention: sessionConv.loggingConvention,
    },
    sets: correctedSets,
  };
}

/** The +20/x2/total-weight convention dates from athlete config — the ONE place every
 * strength importer reads them from, so they can never drift between import paths. */
export async function conventionDates(repo: Repository): Promise<ConventionDates> {
  const config = await repo.getAthleteConfig();
  if (!config) throw new Error('No athlete config — run `seed` first.');
  return { conventionStart: config.hevyConventionStart, switchDate: config.hevyTotalWeightSwitchDate };
}

export interface SameDayStrengthConflict {
  /** The pre-existing session occupying that local calendar date (a DIFFERENT content hash — an
   * exact-hash match is reported as `alreadyImported` instead, which takes precedence). */
  existingSessionId: number;
  /** The local calendar date both sessions share, derived the same way the dashboard/DTO does
   * (`unixToIsoDate(session.startTimeUtc)`, see `queries.ts` `scoredStrengthSets`). */
  date: string;
}

export interface ManualStrengthIngestResult {
  /** True only when a NEW session was written this call. */
  imported: boolean;
  /** True when a session with this content hash already existed (no-op; dry-run reports it too). */
  alreadyImported: boolean;
  /** The corrected session input (conventions funnel already applied), for a caller's preview/summary. */
  sessionInput: StrengthSessionInput;
  /** Present when a session (new or pre-existing) was found; absent only on a dry-run of new content
   * or when refused by `sameDayConflict`. */
  session?: StrengthSession;
  setCount: number;
  /** Set when a DIFFERENT-hash session already occupies the same local calendar date and
   * `allowSameDay` was not passed. Nothing was written (a real run refuses outright; a dry-run
   * reports the would-be refusal instead of a would-write preview) — the caller decides the exit
   * code / message. Guards against the silent duplicate a re-ordered/edited same-day file would
   * otherwise create (a new content hash, no delete path exists). */
  sameDayConflict?: SameDayStrengthConflict;
}

/** The existing session (if any) sharing `dateIso` as its local calendar date, derived the same
 * way the dashboard/DTO derives a strength session's date (see `SameDayStrengthConflict.date`). */
async function findSameDaySession(repo: Repository, dateIso: string): Promise<StrengthSession | undefined> {
  const sessions = await repo.getStrengthSessions();
  return sessions.find((s) => unixToIsoDate(s.startTimeUtc) === dateIso);
}

/**
 * Ingest ONE already-parsed, already-hashed manual strength session through
 * the SAME conventions funnel as every other strength import (`buildStrengthSessionInput` above) —
 * a manually-entered session gets no special-cased correction path. `dryRun` builds + returns the
 * corrected preview and checks the dedupe hash, but never calls `saveStrengthSession`. The
 * exact-hash dedupe (`alreadyImported`) is checked FIRST and takes precedence; only then is the
 * same-day guard applied (skippable with `allowSameDay`, e.g. a genuine second session that day).
 */
export async function ingestManualStrengthSession(
  repo: Repository,
  raw: RawStrengthSession,
  opts: { dryRun?: boolean; allowSameDay?: boolean } = {},
): Promise<ManualStrengthIngestResult> {
  const conv = await conventionDates(repo);
  const sessionInput = buildStrengthSessionInput(raw, conv);

  const existing = await repo.findStrengthSessionByHash(raw.sourceRowHash);
  if (existing) {
    return { imported: false, alreadyImported: true, sessionInput, session: existing, setCount: 0 };
  }

  if (!opts.allowSameDay) {
    const sameDay = await findSameDaySession(repo, raw.sessionDateIso);
    if (sameDay) {
      return {
        imported: false,
        alreadyImported: false,
        sessionInput,
        setCount: 0,
        sameDayConflict: { existingSessionId: sameDay.id, date: raw.sessionDateIso },
      };
    }
  }

  if (opts.dryRun) {
    return { imported: false, alreadyImported: false, sessionInput, setCount: sessionInput.sets.length };
  }

  const { session, setCount } = await repo.saveStrengthSession(sessionInput);
  return { imported: true, alreadyImported: false, sessionInput, session, setCount };
}

export interface WeatherBackfillSummary {
  updated: number;
  skippedNoGps: number;
  skippedNoData: number;
  skippedError: number;
  alreadyHadFitTemp: number;
}

/**
 * Backfill each run's heat-correction temperature from the weather port, using
 * the run's date + GPS (or the configured home coords as a fallback). Runs that
 * already carry a device temperature are left alone; GPS-less runs without a
 * home fallback are skipped (temperature_source stays 'none').
 */
export async function backfillRunWeather(repo: Repository, weather: WeatherPort): Promise<WeatherBackfillSummary> {
  const runs = await repo.getRuns();
  const config = await repo.getAthleteConfig();
  const summary: WeatherBackfillSummary = { updated: 0, skippedNoGps: 0, skippedNoData: 0, skippedError: 0, alreadyHadFitTemp: 0 };

  for (const run of runs) {
    if (run.temperatureSource === 'fit') {
      summary.alreadyHadFitTemp++;
      continue;
    }
    const lat = run.startLatDeg ?? config?.homeLat ?? null;
    const lon = run.startLonDeg ?? config?.homeLon ?? null;
    if (lat == null || lon == null) {
      summary.skippedNoGps++;
      continue;
    }
    const d = new Date(run.startTimeUtc * 1000);
    const isoDate = d.toISOString().slice(0, 10);
    const hour = d.getUTCHours();

    // A non-200 from Open-Meteo (the ERA5 archive 400s for a date it doesn't have yet — exactly a run
    // imported today — and 429s under the free quota) THROWS. Isolate it per run so one transient error
    // skips that run instead of aborting the backfill of every run after it. Weather is best-effort and
    // self-healing: the next sync re-scans non-fit runs and retries the skipped ones.
    try {
      const w = await weather.getHourly(lat, lon, isoDate, hour);
      if (!w) {
        summary.skippedNoData++;
        continue;
      }
      // Prefer apparent temperature (incorporates humidity) for the heat offset.
      await repo.setRunTemperature(run.id, w.apparentTemperatureC ?? w.temperatureC, 'weather');
      summary.updated++;
    } catch {
      summary.skippedError++;
    }
  }

  return summary;
}

export interface GarminJsonIngestSummary {
  daysWritten: number;
  skipped: number;
  droppedMetrics: number;
  note: string;
}

/**
 * Ingest a normalised Garmin MCP wellness JSON (`{ days: [...] }`) into
 * recovery_days (COALESCE upsert by date, so HRV/sleep/resting-HR/body-battery on
 * the same date coexist with anything already imported). Rows are tagged source
 * 'garmin_mcp'.
 */
export async function ingestGarminWellnessJson(
  repo: Repository,
  jsonText: string,
): Promise<GarminJsonIngestSummary> {
  const parsed = parseGarminWellnessJson(jsonText);
  if (parsed.recoveryDays.length > 0) {
    await repo.upsertRecoveryDays(parsed.recoveryDays);
  }
  return {
    daysWritten: parsed.recoveryDays.length,
    skipped: parsed.skippedDays,
    droppedMetrics: parsed.droppedMetrics,
    note: parsed.note,
  };
}
