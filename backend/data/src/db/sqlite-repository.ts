import type {
  AthleteConfig,
  Copy,
  CopyInput,
  CopyPatch,
  Equipment,
  Exam,
  ExamInput,
  ExamPatch,
  SchoolTask,
  SchoolTaskInput,
  SchoolTaskPatch,
  HourlyWeather,
  LoggingConvention,
  Purchase,
  PurchaseInput,
  PurchaseItem,
  PurchaseItemInput,
  PurchasePatch,
  RecoveryDay,
  RecoveryDayInput,
  Repository,
  Run,
  RunInput,
  Series,
  SeriesInput,
  SeriesPatch,
  Shoe,
  ShoeInput,
  StatHistoryEntry,
  StatHistoryInput,
  StatName,
  StrengthReference,
  StrengthSession,
  StrengthSessionInput,
  StrengthSet,
  TemperatureSource,
  Volume,
  VolumeInput,
  VolumePatch,
  WeatherCacheEntry,
  WeightPoint,
  WeightPointInput,
} from '@solace/core';
import type { DB } from './connection.ts';

interface AthleteConfigRow {
  age: number;
  height_cm: number | null;
  height_confirmed: number;
  max_hr: number;
  resting_hr_baseline: number;
  hrv_baseline_ms: number;
  hevy_convention_start: string;
  hevy_total_weight_switch_date: string;
  home_lat: number | null;
  home_lon: number | null;
  peak_loads_json: string;
  goal_weight_kg: number | null;
  goal_body_fat_pct: number | null;
  goal_pace_min_per_km: number | null;
  goal_weekly_km: number | null;
}

interface ShoeRow {
  id: number;
  model: string;
  prior_counted_km: number;
  notes: string | null;
}

interface RunRow {
  id: number;
  source_file_hash: string;
  start_time_utc: number;
  start_time_local: string;
  sport: string;
  total_distance_m: number;
  total_duration_s: number;
  avg_hr_bpm: number | null;
  max_hr_bpm: number | null;
  avg_enhanced_speed_mps: number | null;
  avg_cadence: number | null;
  avg_power_w: number | null;
  start_lat_deg: number | null;
  start_lon_deg: number | null;
  elevation_gain_m: number | null;
  temperature_source: TemperatureSource;
  corrected_temperature_c: number | null;
  shoe_id: number | null;
}

interface StatHistoryRow {
  id: number;
  stat: StatName;
  date: string;
  value: number;
  level: number;
  confidence: StatHistoryEntry['confidence'];
  trigger: string;
  inputs_json: string;
}

const toRun = (r: RunRow): Run => ({
  id: r.id,
  sourceFileHash: r.source_file_hash,
  startTimeUtc: r.start_time_utc,
  startTimeLocal: r.start_time_local,
  sport: r.sport,
  totalDistanceM: r.total_distance_m,
  totalDurationS: r.total_duration_s,
  avgHrBpm: r.avg_hr_bpm,
  maxHrBpm: r.max_hr_bpm,
  avgEnhancedSpeedMps: r.avg_enhanced_speed_mps,
  avgCadence: r.avg_cadence,
  avgPowerW: r.avg_power_w,
  startLatDeg: r.start_lat_deg,
  startLonDeg: r.start_lon_deg,
  elevationGainM: r.elevation_gain_m,
  temperatureSource: r.temperature_source,
  correctedTemperatureC: r.corrected_temperature_c,
  shoeId: r.shoe_id,
});

interface StrengthSessionRow {
  id: number;
  source_row_hash: string;
  title: string;
  start_time_utc: number;
  pre_2022: number;
  logging_convention: LoggingConvention;
}

interface StrengthSetRow {
  id: number;
  session_id: number;
  exercise_title_raw: string;
  exercise_name: string;
  equipment: Equipment;
  superset_id: string | null;
  set_index: number | null;
  set_type: string;
  raw_weight: number | null;
  raw_weight_unit: 'kg' | 'lbs';
  reps: number | null;
  rpe: number | null;
  distance_miles: number | null;
  duration_seconds: number | null;
  weight_kg_normalized: number | null;
  real_load_kg: number | null;
  correction_applied: string | null;
  excluded_from_trend: number;
}

interface RecoveryDayRow {
  date: string;
  sleep_score: number | null;
  hrv_overnight_ms: number | null;
  resting_hr_bpm: number | null;
  body_battery: number | null;
  source: RecoveryDay['source'];
}

interface WeightPointRow {
  id: number;
  date: string;
  weight_kg: number;
  body_fat_pct: number | null;
  source: WeightPoint['source'];
  notes: string | null;
}

interface ExamRow {
  id: number;
  course: string;
  exam_date: string;
  status: Exam['status'];
  grade: number | null;
  resit_date: string | null;
  resit_grade: number | null;
  credits: number | null;
  deliberated: number;
  notes: string | null;
  created_at: number;
}
interface SchoolTaskRow {
  id: number;
  title: string;
  kind: SchoolTask['kind'];
  deadline: string;
  course: string | null;
  notes: string | null;
  done: number;
  done_date: string | null;
  created_at: number;
}
interface SeriesRow {
  id: number;
  canonical_title: string;
  author: string | null;
  alt_titles: string | null;
  type: Series['type'];
  anilist_id: number | null;
  mangadex_id: string | null;
  mangaupdates_id: string | null;
  mal_id: number | null;
  publication_status: Series['publicationStatus'];
  reading_status: Series['readingStatus'];
  total_volumes_known: number | null;
  english_publisher: string | null;
  reading_direction: Series['readingDirection'];
  cover_url: string | null;
  genres: string | null;
  notes: string | null;
  source_hash: string | null;
  created_at: number;
}
interface VolumeRow {
  id: number;
  series_id: number;
  volume_number: number | null;
  title: string | null;
  isbn13: string | null;
  isbn10: string | null;
  publisher: string | null;
  release_date_en: string | null;
  release_date_jp: string | null;
  page_count: number | null;
  cover_url: string | null;
  cover_source: string | null;
  format: Volume['format'];
  created_at: number;
}
interface CopyRow {
  id: number;
  volume_id: number;
  owned: number;
  acquired_date: string | null;
  condition: string | null;
  read_status: Copy['readStatus'];
  read_date: string | null;
  rating: number | null;
  notes: string | null;
  purchase_id: number | null;
  created_at: number;
}
interface PurchaseRow {
  id: number;
  date: string | null;
  source: string | null;
  total_price: number | null;
  currency: string;
  type: Purchase['type'];
  estimated: number;
  notes: string | null;
  created_at: number;
}
interface PurchaseItemRow {
  id: number;
  purchase_id: number;
  volume_id: number;
  allocated_price: number | null;
}
const toExam = (r: ExamRow): Exam => ({
  id: r.id,
  course: r.course,
  examDate: r.exam_date,
  status: r.status,
  grade: r.grade,
  resitDate: r.resit_date,
  resitGrade: r.resit_grade,
  credits: r.credits,
  deliberated: r.deliberated === 1,
  notes: r.notes,
  createdAt: r.created_at,
});
const toSchoolTask = (r: SchoolTaskRow): SchoolTask => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  deadline: r.deadline,
  course: r.course,
  notes: r.notes,
  done: r.done === 1,
  doneDate: r.done_date,
  createdAt: r.created_at,
});
/** Parse a JSON-array TEXT column → string[] (defensive: [] for null/legacy/malformed rows). */
const parseJsonArray = (s: string | null): string[] => {
  if (!s) return [];
  try {
    const a: unknown = JSON.parse(s);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const toSeries = (r: SeriesRow): Series => ({
  id: r.id,
  canonicalTitle: r.canonical_title,
  author: r.author,
  altTitles: parseJsonArray(r.alt_titles),
  type: r.type,
  anilistId: r.anilist_id,
  mangadexId: r.mangadex_id,
  mangaupdatesId: r.mangaupdates_id,
  malId: r.mal_id,
  publicationStatus: r.publication_status,
  readingStatus: r.reading_status,
  totalVolumesKnown: r.total_volumes_known,
  englishPublisher: r.english_publisher,
  readingDirection: r.reading_direction,
  coverUrl: r.cover_url,
  genres: parseJsonArray(r.genres),
  notes: r.notes,
  sourceHash: r.source_hash,
  createdAt: r.created_at,
});
const toVolume = (r: VolumeRow): Volume => ({
  id: r.id,
  seriesId: r.series_id,
  volumeNumber: r.volume_number,
  title: r.title,
  isbn13: r.isbn13,
  isbn10: r.isbn10,
  publisher: r.publisher,
  releaseDateEn: r.release_date_en,
  releaseDateJp: r.release_date_jp,
  pageCount: r.page_count,
  coverUrl: r.cover_url,
  coverSource: r.cover_source,
  format: r.format,
  createdAt: r.created_at,
});
const toCopy = (r: CopyRow): Copy => ({
  id: r.id,
  volumeId: r.volume_id,
  owned: r.owned === 1,
  acquiredDate: r.acquired_date,
  condition: r.condition,
  readStatus: r.read_status,
  readDate: r.read_date,
  rating: r.rating,
  notes: r.notes,
  purchaseId: r.purchase_id,
  createdAt: r.created_at,
});
const toPurchase = (r: PurchaseRow): Purchase => ({
  id: r.id,
  date: r.date,
  source: r.source,
  totalPrice: r.total_price,
  currency: r.currency,
  type: r.type,
  estimated: r.estimated === 1,
  notes: r.notes,
  createdAt: r.created_at,
});
const toPurchaseItem = (r: PurchaseItemRow): PurchaseItem => ({
  id: r.id,
  purchaseId: r.purchase_id,
  volumeId: r.volume_id,
  allocatedPrice: r.allocated_price,
});

// camelCase patch key → snake_case column, for dynamic UPDATE of life-sim rows.
const EXAM_COLS: Record<string, string> = { course: 'course', examDate: 'exam_date', status: 'status', grade: 'grade', resitDate: 'resit_date', resitGrade: 'resit_grade', credits: 'credits', deliberated: 'deliberated', notes: 'notes' };
const SCHOOL_TASK_COLS: Record<string, string> = { title: 'title', kind: 'kind', deadline: 'deadline', course: 'course', notes: 'notes', done: 'done', doneDate: 'done_date' };
const SERIES_COLS: Record<string, string> = { canonicalTitle: 'canonical_title', author: 'author', altTitles: 'alt_titles', type: 'type', anilistId: 'anilist_id', mangadexId: 'mangadex_id', mangaupdatesId: 'mangaupdates_id', malId: 'mal_id', publicationStatus: 'publication_status', readingStatus: 'reading_status', totalVolumesKnown: 'total_volumes_known', englishPublisher: 'english_publisher', readingDirection: 'reading_direction', coverUrl: 'cover_url', genres: 'genres', notes: 'notes', sourceHash: 'source_hash' };
const VOLUME_COLS: Record<string, string> = { seriesId: 'series_id', volumeNumber: 'volume_number', title: 'title', isbn13: 'isbn13', isbn10: 'isbn10', publisher: 'publisher', releaseDateEn: 'release_date_en', releaseDateJp: 'release_date_jp', pageCount: 'page_count', coverUrl: 'cover_url', coverSource: 'cover_source', format: 'format' };
const COPY_COLS: Record<string, string> = { volumeId: 'volume_id', owned: 'owned', acquiredDate: 'acquired_date', condition: 'condition', readStatus: 'read_status', readDate: 'read_date', rating: 'rating', notes: 'notes', purchaseId: 'purchase_id' };
const PURCHASE_COLS: Record<string, string> = { date: 'date', source: 'source', totalPrice: 'total_price', currency: 'currency', type: 'type', estimated: 'estimated', notes: 'notes' };

/** Build a dynamic SET clause + bound params from a camelCase patch (booleans → 0/1). */
function lifeSimSet(cols: Record<string, string>, patch: Record<string, unknown>): { sql: string; params: Record<string, unknown> } | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(cols)) {
    if (Object.prototype.hasOwnProperty.call(patch, k) && patch[k] !== undefined) {
      sets.push(`${col} = @${k}`);
      const v = patch[k];
      // booleans → 0/1; arrays (manga genres) → JSON text; everything else binds as-is.
      params[k] = typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) ? JSON.stringify(v) : v;
    }
  }
  return sets.length > 0 ? { sql: sets.join(', '), params } : null;
}

const toSession = (r: StrengthSessionRow): StrengthSession => ({
  id: r.id,
  sourceRowHash: r.source_row_hash,
  title: r.title,
  startTimeUtc: r.start_time_utc,
  pre2022: r.pre_2022 === 1,
  loggingConvention: r.logging_convention,
});

const toSet = (r: StrengthSetRow): StrengthSet => ({
  id: r.id,
  sessionId: r.session_id,
  exerciseTitleRaw: r.exercise_title_raw,
  exerciseName: r.exercise_name,
  equipment: r.equipment,
  supersetId: r.superset_id,
  setIndex: r.set_index,
  setType: r.set_type,
  rawWeight: r.raw_weight,
  rawWeightUnit: r.raw_weight_unit,
  reps: r.reps,
  rpe: r.rpe,
  distanceMiles: r.distance_miles,
  durationSeconds: r.duration_seconds,
  weightKgNormalized: r.weight_kg_normalized,
  realLoadKg: r.real_load_kg,
  correctionApplied: r.correction_applied,
  excludedFromTrend: r.excluded_from_trend === 1,
});

/**
 * better-sqlite3-backed Repository. Synchronous under the hood, async at the
 * interface so a future sql.js/OPFS implementation can satisfy the same contract.
 * Maps snake_case rows <-> camelCase domain objects in one place.
 */
export class SqliteRepository implements Repository {
  constructor(private readonly db: DB) {}

  async getSetting(key: string): Promise<string | null> {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string, updatedAt: string): Promise<void> {
    this.db
      .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(key, value, updatedAt);
  }

  async deleteSetting(key: string): Promise<void> {
    this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  }

  async getAthleteConfig(): Promise<AthleteConfig | null> {
    const row = this.db.prepare('SELECT * FROM athlete_config WHERE id = 1').get() as
      | AthleteConfigRow
      | undefined;
    if (!row) return null;
    return {
      age: row.age,
      heightCm: row.height_cm,
      heightConfirmed: row.height_confirmed === 1,
      maxHr: row.max_hr,
      restingHrBaseline: row.resting_hr_baseline,
      hrvBaselineMs: row.hrv_baseline_ms,
      hevyConventionStart: row.hevy_convention_start,
      hevyTotalWeightSwitchDate: row.hevy_total_weight_switch_date,
      homeLat: row.home_lat,
      homeLon: row.home_lon,
      peakLoads: JSON.parse(row.peak_loads_json) as StrengthReference,
      goals: {
        weightKg: row.goal_weight_kg,
        bodyFatPct: row.goal_body_fat_pct,
        paceMinPerKm: row.goal_pace_min_per_km,
        weeklyKm: row.goal_weekly_km,
      },
    };
  }

  async saveAthleteConfig(config: AthleteConfig): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO athlete_config (
          id, age, height_cm, height_confirmed, max_hr, resting_hr_baseline, hrv_baseline_ms,
          hevy_convention_start, hevy_total_weight_switch_date,
          home_lat, home_lon, peak_loads_json, updated_at,
          goal_weight_kg, goal_body_fat_pct, goal_pace_min_per_km, goal_weekly_km
        ) VALUES (
          1, @age, @heightCm, @heightConfirmed, @maxHr, @restingHrBaseline, @hrvBaselineMs,
          @hevyConventionStart, @hevyTotalWeightSwitchDate,
          @homeLat, @homeLon, @peakLoadsJson, @updatedAt,
          @goalWeightKg, @goalBodyFatPct, @goalPaceMinPerKm, @goalWeeklyKm
        ) ON CONFLICT(id) DO UPDATE SET
          age = excluded.age, height_cm = excluded.height_cm, height_confirmed = excluded.height_confirmed,
          max_hr = excluded.max_hr, resting_hr_baseline = excluded.resting_hr_baseline,
          hrv_baseline_ms = excluded.hrv_baseline_ms, hevy_convention_start = excluded.hevy_convention_start,
          hevy_total_weight_switch_date = excluded.hevy_total_weight_switch_date,
          home_lat = excluded.home_lat, home_lon = excluded.home_lon,
          peak_loads_json = excluded.peak_loads_json, updated_at = excluded.updated_at,
          goal_weight_kg = excluded.goal_weight_kg, goal_body_fat_pct = excluded.goal_body_fat_pct,
          goal_pace_min_per_km = excluded.goal_pace_min_per_km, goal_weekly_km = excluded.goal_weekly_km`,
      )
      .run({
        age: config.age,
        heightCm: config.heightCm,
        heightConfirmed: config.heightConfirmed ? 1 : 0,
        maxHr: config.maxHr,
        restingHrBaseline: config.restingHrBaseline,
        hrvBaselineMs: config.hrvBaselineMs,
        hevyConventionStart: config.hevyConventionStart,
        hevyTotalWeightSwitchDate: config.hevyTotalWeightSwitchDate,
        homeLat: config.homeLat,
        homeLon: config.homeLon,
        peakLoadsJson: JSON.stringify(config.peakLoads),
        updatedAt: Date.now(),
        goalWeightKg: config.goals.weightKg,
        goalBodyFatPct: config.goals.bodyFatPct,
        goalPaceMinPerKm: config.goals.paceMinPerKm,
        goalWeeklyKm: config.goals.weeklyKm,
      });
  }

  async getShoes(): Promise<Shoe[]> {
    const rows = this.db.prepare('SELECT * FROM shoes ORDER BY id').all() as ShoeRow[];
    return rows.map((r) => ({ id: r.id, model: r.model, priorCountedKm: r.prior_counted_km, notes: r.notes }));
  }

  async saveShoe(shoe: ShoeInput): Promise<Shoe> {
    const info = this.db
      .prepare('INSERT INTO shoes (model, prior_counted_km, notes) VALUES (?, ?, ?)')
      .run(shoe.model, shoe.priorCountedKm, shoe.notes);
    return { id: Number(info.lastInsertRowid), model: shoe.model, priorCountedKm: shoe.priorCountedKm, notes: shoe.notes };
  }

  async findRunByHash(sourceFileHash: string): Promise<Run | null> {
    const row = this.db.prepare('SELECT * FROM runs WHERE source_file_hash = ?').get(sourceFileHash) as
      | RunRow
      | undefined;
    return row ? toRun(row) : null;
  }

  async saveRun(input: RunInput): Promise<Run> {
    const { run, samples, laps } = input;
    const insertRun = this.db.prepare(
      `INSERT INTO runs (
        source_file_hash, start_time_utc, start_time_local, sport, total_distance_m, total_duration_s,
        avg_hr_bpm, max_hr_bpm, avg_enhanced_speed_mps, avg_cadence, avg_power_w,
        start_lat_deg, start_lon_deg, elevation_gain_m, temperature_source, corrected_temperature_c, shoe_id
      ) VALUES (
        @sourceFileHash, @startTimeUtc, @startTimeLocal, @sport, @totalDistanceM, @totalDurationS,
        @avgHrBpm, @maxHrBpm, @avgEnhancedSpeedMps, @avgCadence, @avgPowerW,
        @startLatDeg, @startLonDeg, @elevationGainM, @temperatureSource, @correctedTemperatureC, @shoeId
      )`,
    );
    const insertSample = this.db.prepare(
      `INSERT INTO run_samples (
        run_id, t_offset_s, heart_rate_bpm, enhanced_speed_mps, speed_mps, cadence, power_w,
        lat_deg, lon_deg, altitude_m, distance_m, temperature_c
      ) VALUES (
        @runId, @tOffsetS, @heartRateBpm, @enhancedSpeedMps, @speedMps, @cadence, @powerW,
        @latDeg, @lonDeg, @altitudeM, @distanceM, @temperatureC
      )`,
    );
    const insertLap = this.db.prepare(
      `INSERT INTO run_laps (run_id, lap_index, start_time_utc, total_distance_m, total_duration_s, avg_hr_bpm, max_hr_bpm, avg_speed_mps)
       VALUES (@runId, @lapIndex, @startTimeUtc, @totalDistanceM, @totalDurationS, @avgHrBpm, @maxHrBpm, @avgSpeedMps)`,
    );

    const tx = this.db.transaction((): number => {
      const info = insertRun.run(run);
      const runId = Number(info.lastInsertRowid);
      for (const s of samples) insertSample.run({ ...s, runId });
      for (const l of laps) insertLap.run({ ...l, runId });
      return runId;
    });

    const runId = tx();
    return { id: runId, ...run };
  }

  async getRuns(): Promise<Run[]> {
    const rows = this.db.prepare('SELECT * FROM runs ORDER BY start_time_utc, id').all() as RunRow[];
    return rows.map(toRun);
  }

  async latestRunDate(): Promise<string | null> {
    // start_time_local is an ISO datetime (no date column); take its calendar-date prefix.
    const row = this.db.prepare('SELECT MAX(substr(start_time_local, 1, 10)) AS d FROM runs').get() as
      | { d: string | null }
      | undefined;
    return row?.d ?? null;
  }

  async findStrengthSessionByHash(sourceRowHash: string): Promise<StrengthSession | null> {
    const row = this.db.prepare('SELECT * FROM strength_sessions WHERE source_row_hash = ?').get(sourceRowHash) as
      | StrengthSessionRow
      | undefined;
    return row ? toSession(row) : null;
  }

  /** Insert one corrected session + its sets. Sync, so callers run it inside their own transaction. */
  private insertStrengthSessionSync(input: StrengthSessionInput): { sessionId: number; setCount: number } {
    const { session, sets } = input;
    const insertSession = this.db.prepare(
      `INSERT INTO strength_sessions (source_row_hash, title, start_time_utc, pre_2022, logging_convention)
       VALUES (@sourceRowHash, @title, @startTimeUtc, @pre2022, @loggingConvention)`,
    );
    const insertSet = this.db.prepare(
      `INSERT INTO strength_sets (
        session_id, exercise_title_raw, exercise_name, equipment, superset_id, set_index, set_type,
        raw_weight, raw_weight_unit, reps, rpe, distance_miles, duration_seconds,
        weight_kg_normalized, real_load_kg, correction_applied, excluded_from_trend
      ) VALUES (
        @sessionId, @exerciseTitleRaw, @exerciseName, @equipment, @supersetId, @setIndex, @setType,
        @rawWeight, @rawWeightUnit, @reps, @rpe, @distanceMiles, @durationSeconds,
        @weightKgNormalized, @realLoadKg, @correctionApplied, @excludedFromTrend
      )`,
    );

    const sessionInfo = insertSession.run({
      sourceRowHash: session.sourceRowHash,
      title: session.title,
      startTimeUtc: session.startTimeUtc,
      pre2022: session.pre2022 ? 1 : 0,
      loggingConvention: session.loggingConvention,
    });
    const sessionId = Number(sessionInfo.lastInsertRowid);

    for (const set of sets) {
      insertSet.run({
        sessionId,
        exerciseTitleRaw: set.exerciseTitleRaw,
        exerciseName: set.exerciseName,
        equipment: set.equipment,
        supersetId: set.supersetId,
        setIndex: set.setIndex,
        setType: set.setType,
        rawWeight: set.rawWeight,
        rawWeightUnit: set.rawWeightUnit,
        reps: set.reps,
        rpe: set.rpe,
        distanceMiles: set.distanceMiles,
        durationSeconds: set.durationSeconds,
        weightKgNormalized: set.weightKgNormalized,
        realLoadKg: set.realLoadKg,
        correctionApplied: set.correctionApplied,
        excludedFromTrend: set.excludedFromTrend ? 1 : 0,
      });
    }
    return { sessionId, setCount: sets.length };
  }

  async saveStrengthSession(input: StrengthSessionInput): Promise<{ session: StrengthSession; setCount: number }> {
    const { sessionId, setCount } = this.db.transaction(() => this.insertStrengthSessionSync(input))();
    return { session: { id: sessionId, ...input.session }, setCount };
  }

  /** Remove a session's sets, then the session. */
  private deleteStrengthSessionSync(id: number): boolean {
    this.db.prepare('DELETE FROM strength_sets WHERE session_id = ?').run(id);
    return this.db.prepare('DELETE FROM strength_sessions WHERE id = ?').run(id).changes > 0;
  }

  async deleteStrengthSession(id: number): Promise<boolean> {
    return this.db.transaction(() => this.deleteStrengthSessionSync(id))();
  }

  async replaceStrengthSession(id: number, input: StrengthSessionInput): Promise<{ session: StrengthSession; setCount: number }> {
    const { sessionId, setCount } = this.db.transaction(() => {
      this.deleteStrengthSessionSync(id);
      return this.insertStrengthSessionSync(input);
    })();
    return { session: { id: sessionId, ...input.session }, setCount };
  }

  async getStrengthSessions(): Promise<StrengthSession[]> {
    const rows = this.db.prepare('SELECT * FROM strength_sessions ORDER BY start_time_utc, id').all() as StrengthSessionRow[];
    return rows.map(toSession);
  }

  async getStrengthSets(): Promise<StrengthSet[]> {
    const rows = this.db
      .prepare(
        `SELECT s.* FROM strength_sets s
         JOIN strength_sessions ss ON ss.id = s.session_id
         ORDER BY ss.start_time_utc, s.id`,
      )
      .all() as StrengthSetRow[];
    return rows.map(toSet);
  }

  async upsertRecoveryDays(days: RecoveryDayInput[]): Promise<{ written: number }> {
    // MERGE, not replace: the three Garmin exports each carry one metric (HRV
    // daily, sleep weekly, ...). COALESCE keeps existing values when the new row
    // is null for that column, so importing one file never wipes another's data.
    const stmt = this.db.prepare(
      `INSERT INTO recovery_days (date, sleep_score, hrv_overnight_ms, resting_hr_bpm, body_battery, source)
       VALUES (@date, @sleepScore, @hrvOvernightMs, @restingHrBpm, @bodyBattery, @source)
       ON CONFLICT(date) DO UPDATE SET
         sleep_score      = COALESCE(excluded.sleep_score, recovery_days.sleep_score),
         hrv_overnight_ms = COALESCE(excluded.hrv_overnight_ms, recovery_days.hrv_overnight_ms),
         resting_hr_bpm   = COALESCE(excluded.resting_hr_bpm, recovery_days.resting_hr_bpm),
         body_battery     = COALESCE(excluded.body_battery, recovery_days.body_battery),
         -- Only re-stamp the source when the incoming row actually contributes a metric; an all-null
         -- merge (e.g. a re-import that adds nothing) keeps the existing provenance instead of relabelling.
         source           = CASE
           WHEN excluded.sleep_score IS NOT NULL OR excluded.hrv_overnight_ms IS NOT NULL
             OR excluded.resting_hr_bpm IS NOT NULL OR excluded.body_battery IS NOT NULL
           THEN excluded.source ELSE recovery_days.source END`,
    );
    const tx = this.db.transaction((rows: RecoveryDayInput[]) => {
      for (const d of rows) stmt.run(d);
    });
    tx(days);
    return { written: days.length };
  }

  async getRecoveryDays(): Promise<RecoveryDay[]> {
    const rows = this.db.prepare('SELECT * FROM recovery_days ORDER BY date').all() as RecoveryDayRow[];
    return rows.map((r) => ({
      date: r.date,
      sleepScore: r.sleep_score,
      hrvOvernightMs: r.hrv_overnight_ms,
      restingHrBpm: r.resting_hr_bpm,
      bodyBattery: r.body_battery,
      source: r.source,
    }));
  }

  async latestRecoveryDate(): Promise<string | null> {
    const row = this.db.prepare('SELECT MAX(date) AS d FROM recovery_days').get() as { d: string | null } | undefined;
    return row?.d ?? null;
  }

  async saveWeightPoint(point: WeightPointInput): Promise<WeightPoint> {
    const info = this.db
      .prepare(
        `INSERT INTO weight_points (date, weight_kg, body_fat_pct, source, notes)
         VALUES (@date, @weightKg, @bodyFatPct, @source, @notes)`,
      )
      .run(point);
    return { id: Number(info.lastInsertRowid), ...point };
  }

  async getWeightPoints(): Promise<WeightPoint[]> {
    const rows = this.db.prepare('SELECT * FROM weight_points ORDER BY date, id').all() as WeightPointRow[];
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      weightKg: r.weight_kg,
      bodyFatPct: r.body_fat_pct,
      source: r.source,
      notes: r.notes,
    }));
  }

  // --- Life-sim modules (manual now). createdAt = wall clock (data layer is impure;
  // createdAt is a display sort-key only, never a deterministic coaching input). ---

  async addExam(input: ExamInput): Promise<Exam> {
    const createdAt = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO exams (course, exam_date, status, grade, resit_date, resit_grade, credits, deliberated, notes, created_at)
         VALUES (@course, @examDate, @status, @grade, @resitDate, @resitGrade, @credits, @deliberated, @notes, @createdAt)`,
      )
      .run({ ...input, deliberated: input.deliberated ? 1 : 0, createdAt });
    return { id: Number(info.lastInsertRowid), createdAt, ...input };
  }
  async listExams(): Promise<Exam[]> {
    return (this.db.prepare('SELECT * FROM exams ORDER BY exam_date, id').all() as ExamRow[]).map(toExam);
  }
  async updateExam(id: number, patch: ExamPatch): Promise<Exam | null> {
    const set = lifeSimSet(EXAM_COLS, patch as Record<string, unknown>);
    if (set) this.db.prepare(`UPDATE exams SET ${set.sql} WHERE id = @id`).run({ ...set.params, id });
    const row = this.db.prepare('SELECT * FROM exams WHERE id = ?').get(id) as ExamRow | undefined;
    return row ? toExam(row) : null;
  }
  async deleteExam(id: number): Promise<boolean> {
    return this.db.prepare('DELETE FROM exams WHERE id = ?').run(id).changes > 0;
  }

  async addSchoolTask(input: SchoolTaskInput): Promise<SchoolTask> {
    const createdAt = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO school_tasks (title, kind, deadline, course, notes, done, done_date, created_at)
         VALUES (@title, @kind, @deadline, @course, @notes, @done, @doneDate, @createdAt)`,
      )
      .run({ ...input, done: input.done ? 1 : 0, createdAt });
    return { id: Number(info.lastInsertRowid), createdAt, ...input };
  }
  async listSchoolTasks(): Promise<SchoolTask[]> {
    return (this.db.prepare('SELECT * FROM school_tasks ORDER BY deadline, id').all() as SchoolTaskRow[]).map(toSchoolTask);
  }
  async updateSchoolTask(id: number, patch: SchoolTaskPatch): Promise<SchoolTask | null> {
    const set = lifeSimSet(SCHOOL_TASK_COLS, patch as Record<string, unknown>);
    if (set) this.db.prepare(`UPDATE school_tasks SET ${set.sql} WHERE id = @id`).run({ ...set.params, id });
    const row = this.db.prepare('SELECT * FROM school_tasks WHERE id = ?').get(id) as SchoolTaskRow | undefined;
    return row ? toSchoolTask(row) : null;
  }
  async deleteSchoolTask(id: number): Promise<boolean> {
    return this.db.prepare('DELETE FROM school_tasks WHERE id = ?').run(id).changes > 0;
  }

  // --- Series/Volume/Copy/Purchase (Archives: manga + books; full replace, migration v13) ---
  async addSeries(input: SeriesInput): Promise<Series> {
    const createdAt = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO series (canonical_title, author, alt_titles, type, anilist_id, mangadex_id, mangaupdates_id, mal_id, publication_status, reading_status, total_volumes_known, english_publisher, reading_direction, cover_url, genres, notes, source_hash, created_at)
         VALUES (@canonicalTitle, @author, @altTitles, @type, @anilistId, @mangadexId, @mangaupdatesId, @malId, @publicationStatus, @readingStatus, @totalVolumesKnown, @englishPublisher, @readingDirection, @coverUrl, @genres, @notes, @sourceHash, @createdAt)`,
      )
      .run({ ...input, altTitles: JSON.stringify(input.altTitles ?? []), genres: JSON.stringify(input.genres ?? []), createdAt });
    return { id: Number(info.lastInsertRowid), createdAt, ...input };
  }
  async listSeries(): Promise<Series[]> {
    return (this.db.prepare('SELECT * FROM series ORDER BY created_at DESC, id DESC').all() as SeriesRow[]).map(toSeries);
  }
  async getSeries(id: number): Promise<Series | null> {
    const row = this.db.prepare('SELECT * FROM series WHERE id = ?').get(id) as SeriesRow | undefined;
    return row ? toSeries(row) : null;
  }
  async updateSeries(id: number, patch: SeriesPatch): Promise<Series | null> {
    const set = lifeSimSet(SERIES_COLS, patch as Record<string, unknown>);
    if (set) this.db.prepare(`UPDATE series SET ${set.sql} WHERE id = @id`).run({ ...set.params, id });
    const row = this.db.prepare('SELECT * FROM series WHERE id = ?').get(id) as SeriesRow | undefined;
    return row ? toSeries(row) : null;
  }
  async deleteSeries(id: number): Promise<boolean> {
    return this.db.transaction(() => {
      const purchaseIds = this.purchaseIdsOfSeries(id);
      const deleted = this.db.prepare('DELETE FROM series WHERE id = ?').run(id).changes > 0;
      this.deleteEmptyPurchases(purchaseIds);
      return deleted;
    })();
  }
  /** Purchases that have an item on one of these volumes: the only ones a volume/series delete can leave empty. */
  private purchaseIdsOfSeries(seriesId: number): number[] {
    return (this.db.prepare('SELECT DISTINCT pi.purchase_id AS id FROM purchase_items pi JOIN volumes v ON v.id = pi.volume_id WHERE v.series_id = ?').all(seriesId) as { id: number }[]).map((r) => r.id);
  }
  /** After a cascade, drop purchases left with ZERO items (their money would still sum into totalSpentCents). */
  private deleteEmptyPurchases(purchaseIds: number[]): void {
    const del = this.db.prepare('DELETE FROM purchases WHERE id = ? AND NOT EXISTS (SELECT 1 FROM purchase_items WHERE purchase_id = ?)');
    for (const pid of purchaseIds) del.run(pid, pid);
  }

  async addVolume(input: VolumeInput): Promise<Volume> {
    const createdAt = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO volumes (series_id, volume_number, title, isbn13, isbn10, publisher, release_date_en, release_date_jp, page_count, cover_url, cover_source, format, created_at)
         VALUES (@seriesId, @volumeNumber, @title, @isbn13, @isbn10, @publisher, @releaseDateEn, @releaseDateJp, @pageCount, @coverUrl, @coverSource, @format, @createdAt)`,
      )
      .run({ ...input, createdAt });
    return { id: Number(info.lastInsertRowid), createdAt, ...input };
  }
  async listVolumes(): Promise<Volume[]> {
    return (this.db.prepare('SELECT * FROM volumes ORDER BY series_id, volume_number, id').all() as VolumeRow[]).map(toVolume);
  }
  async listVolumesBySeries(seriesId: number): Promise<Volume[]> {
    return (this.db.prepare('SELECT * FROM volumes WHERE series_id = ? ORDER BY volume_number, id').all(seriesId) as VolumeRow[]).map(toVolume);
  }
  async updateVolume(id: number, patch: VolumePatch): Promise<Volume | null> {
    const set = lifeSimSet(VOLUME_COLS, patch as Record<string, unknown>);
    if (set) this.db.prepare(`UPDATE volumes SET ${set.sql} WHERE id = @id`).run({ ...set.params, id });
    const row = this.db.prepare('SELECT * FROM volumes WHERE id = ?').get(id) as VolumeRow | undefined;
    return row ? toVolume(row) : null;
  }
  async deleteVolume(id: number): Promise<boolean> {
    return this.db.transaction(() => {
      const purchaseIds = (this.db.prepare('SELECT DISTINCT purchase_id AS id FROM purchase_items WHERE volume_id = ?').all(id) as { id: number }[]).map((r) => r.id);
      const deleted = this.db.prepare('DELETE FROM volumes WHERE id = ?').run(id).changes > 0;
      this.deleteEmptyPurchases(purchaseIds);
      return deleted;
    })();
  }

  async addCopy(input: CopyInput): Promise<Copy> {
    const createdAt = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO copies (volume_id, owned, acquired_date, condition, read_status, read_date, rating, notes, purchase_id, created_at)
         VALUES (@volumeId, @owned, @acquiredDate, @condition, @readStatus, @readDate, @rating, @notes, @purchaseId, @createdAt)`,
      )
      .run({ ...input, owned: input.owned ? 1 : 0, createdAt });
    return { id: Number(info.lastInsertRowid), createdAt, ...input };
  }
  async listCopies(): Promise<Copy[]> {
    return (this.db.prepare('SELECT * FROM copies ORDER BY created_at DESC, id DESC').all() as CopyRow[]).map(toCopy);
  }
  async listCopiesByVolume(volumeId: number): Promise<Copy[]> {
    return (this.db.prepare('SELECT * FROM copies WHERE volume_id = ? ORDER BY id').all(volumeId) as CopyRow[]).map(toCopy);
  }
  async updateCopy(id: number, patch: CopyPatch): Promise<Copy | null> {
    const set = lifeSimSet(COPY_COLS, patch as Record<string, unknown>);
    if (set) this.db.prepare(`UPDATE copies SET ${set.sql} WHERE id = @id`).run({ ...set.params, id });
    const row = this.db.prepare('SELECT * FROM copies WHERE id = ?').get(id) as CopyRow | undefined;
    return row ? toCopy(row) : null;
  }
  async deleteCopy(id: number): Promise<boolean> {
    return this.db.prepare('DELETE FROM copies WHERE id = ?').run(id).changes > 0;
  }

  async addPurchase(input: PurchaseInput): Promise<Purchase> {
    const createdAt = Math.floor(Date.now() / 1000);
    const info = this.db
      .prepare(
        `INSERT INTO purchases (date, source, total_price, currency, type, estimated, notes, created_at)
         VALUES (@date, @source, @totalPrice, @currency, @type, @estimated, @notes, @createdAt)`,
      )
      .run({ ...input, estimated: input.estimated ? 1 : 0, createdAt });
    return { id: Number(info.lastInsertRowid), createdAt, ...input };
  }
  async listPurchases(): Promise<Purchase[]> {
    return (this.db.prepare('SELECT * FROM purchases ORDER BY created_at DESC, id DESC').all() as PurchaseRow[]).map(toPurchase);
  }
  async updatePurchase(id: number, patch: PurchasePatch): Promise<Purchase | null> {
    const set = lifeSimSet(PURCHASE_COLS, patch as Record<string, unknown>);
    if (set) this.db.prepare(`UPDATE purchases SET ${set.sql} WHERE id = @id`).run({ ...set.params, id });
    const row = this.db.prepare('SELECT * FROM purchases WHERE id = ?').get(id) as PurchaseRow | undefined;
    return row ? toPurchase(row) : null;
  }
  async deletePurchase(id: number): Promise<boolean> {
    return this.db.prepare('DELETE FROM purchases WHERE id = ?').run(id).changes > 0;
  }

  async addPurchaseItems(items: PurchaseItemInput[]): Promise<PurchaseItem[]> {
    const insert = this.db.prepare('INSERT INTO purchase_items (purchase_id, volume_id, allocated_price) VALUES (@purchaseId, @volumeId, @allocatedPrice)');
    const created: PurchaseItem[] = [];
    const insertAll = this.db.transaction((rows: PurchaseItemInput[]) => {
      for (const row of rows) {
        const info = insert.run(row);
        created.push({ id: Number(info.lastInsertRowid), ...row });
      }
    });
    insertAll(items);
    return created;
  }
  async listPurchaseItems(): Promise<PurchaseItem[]> {
    return (this.db.prepare('SELECT * FROM purchase_items ORDER BY id').all() as PurchaseItemRow[]).map(toPurchaseItem);
  }

  async getWeatherHour(lat2dp: number, lon2dp: number, isoDate: string, hour: number): Promise<HourlyWeather | null> {
    const row = this.db
      .prepare(
        'SELECT temperature_2m_c, relative_humidity_pct, apparent_temperature_c FROM weather_cache WHERE lat_2dp = ? AND lon_2dp = ? AND date = ? AND hour = ?',
      )
      .get(lat2dp, lon2dp, isoDate, hour) as
      | { temperature_2m_c: number; relative_humidity_pct: number | null; apparent_temperature_c: number | null }
      | undefined;
    return row
      ? {
          temperatureC: row.temperature_2m_c,
          relativeHumidityPct: row.relative_humidity_pct,
          apparentTemperatureC: row.apparent_temperature_c,
        }
      : null;
  }

  async putWeatherHours(entries: WeatherCacheEntry[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO weather_cache (lat_2dp, lon_2dp, date, hour, temperature_2m_c, relative_humidity_pct, apparent_temperature_c)
       VALUES (@lat2dp, @lon2dp, @isoDate, @hour, @temperatureC, @relativeHumidityPct, @apparentTemperatureC)`,
    );
    const tx = this.db.transaction((rows: WeatherCacheEntry[]) => {
      for (const e of rows) stmt.run(e);
    });
    tx(entries);
  }

  async setRunTemperature(runId: number, correctedTemperatureC: number | null, source: TemperatureSource): Promise<void> {
    this.db
      .prepare('UPDATE runs SET corrected_temperature_c = ?, temperature_source = ? WHERE id = ?')
      .run(correctedTemperatureC, source, runId);
  }

  async appendStatHistory(entry: StatHistoryInput): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO stat_history (stat, date, value, level, confidence, trigger, inputs_json)
         VALUES (@stat, @date, @value, @level, @confidence, @trigger, @inputsJson)`,
      )
      .run(entry);
  }

  async getStatHistory(stat?: StatName): Promise<StatHistoryEntry[]> {
    const rows = (
      stat
        ? this.db.prepare('SELECT * FROM stat_history WHERE stat = ? ORDER BY date, id').all(stat)
        : this.db.prepare('SELECT * FROM stat_history ORDER BY date, id').all()
    ) as StatHistoryRow[];
    return rows.map((r) => ({
      id: r.id,
      stat: r.stat,
      date: r.date,
      value: r.value,
      level: r.level,
      confidence: r.confidence,
      trigger: r.trigger,
      inputsJson: r.inputs_json,
    }));
  }
}
