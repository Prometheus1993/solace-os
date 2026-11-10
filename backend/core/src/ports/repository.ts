/**
 * The ONE pure/impure seam.
 *
 * `core` depends only on these interfaces; `backend/data` implements them with
 * better-sqlite3 today and could implement them with sql.js/OPFS in the browser
 * later — with no change to core. Hence: all methods are async-signatured and
 * return plain domain objects / values, never DB cursors or driver rows.
 */
import type { AthleteConfig } from '../domain/athlete-config.ts';
import type {
  Copy,
  Exam,
  SchoolTask,
  Lap,
  Purchase,
  PurchaseItem,
  RecoveryDay,
  Run,
  RunSample,
  Series,
  Shoe,
  StatHistoryEntry,
  StatHistoryInput,
  StatName,
  StrengthSession,
  StrengthSet,
  TemperatureSource,
  Volume,
  WeightPoint,
} from '../domain/types.ts';

export interface ShoeInput {
  model: string;
  priorCountedKm: number;
  notes: string | null;
}

export type RunSampleInput = Omit<RunSample, 'runId'>;
export type LapInput = Omit<Lap, 'runId'>;

/** A run plus its per-second samples and laps, ready to persist atomically. */
export interface RunInput {
  run: Omit<Run, 'id'>;
  samples: RunSampleInput[];
  laps: LapInput[];
}

export interface StrengthSessionInput {
  session: Omit<StrengthSession, 'id'>;
  sets: Omit<StrengthSet, 'id' | 'sessionId'>[];
}

export type WeightPointInput = Omit<WeightPoint, 'id'>;
export type RecoveryDayInput = RecoveryDay;

// Life-sim modules: createdAt is stamped by the repository (wall clock) at insert; patched by id.
export type ExamInput = Omit<Exam, 'id' | 'createdAt'>;
export type ExamPatch = Partial<Omit<Exam, 'id' | 'createdAt'>>;
export type SchoolTaskInput = Omit<SchoolTask, 'id' | 'createdAt'>;
export type SchoolTaskPatch = Partial<Omit<SchoolTask, 'id' | 'createdAt'>>;

// Series/Volume/Copy/Purchase/PurchaseItem: the full replace of Book/Manga (migration v13).
export type SeriesInput = Omit<Series, 'id' | 'createdAt'>;
export type SeriesPatch = Partial<Omit<Series, 'id' | 'createdAt'>>;
export type VolumeInput = Omit<Volume, 'id' | 'createdAt'>;
export type VolumePatch = Partial<Omit<Volume, 'id' | 'createdAt'>>;
export type CopyInput = Omit<Copy, 'id' | 'createdAt'>;
export type CopyPatch = Partial<Omit<Copy, 'id' | 'createdAt'>>;
export type PurchaseInput = Omit<Purchase, 'id' | 'createdAt'>;
export type PurchasePatch = Partial<Omit<Purchase, 'id' | 'createdAt'>>;
export type PurchaseItemInput = Omit<PurchaseItem, 'id'>;

export interface Repository {
  // --- Athlete config (single row) ---
  getAthleteConfig(): Promise<AthleteConfig | null>;
  saveAthleteConfig(config: AthleteConfig): Promise<void>;

  // --- Shoes ---
  getShoes(): Promise<Shoe[]>;
  saveShoe(shoe: ShoeInput): Promise<Shoe>;

  // --- Runs ---
  /** Dedupe lookup: a re-imported file must not be counted twice. */
  findRunByHash(sourceFileHash: string): Promise<Run | null>;
  saveRun(input: RunInput): Promise<Run>;
  getRuns(): Promise<Run[]>;
  /** Latest run's local calendar date (YYYY-MM-DD), or null if there are no runs. The Garmin-sync high-water mark. */
  latestRunDate(): Promise<string | null>;

  // --- Strength ---
  findStrengthSessionByHash(sourceRowHash: string): Promise<StrengthSession | null>;
  saveStrengthSession(input: StrengthSessionInput): Promise<{ session: StrengthSession; setCount: number }>;
  /** Atomically delete a session and its sets. False when the id is unknown. */
  deleteStrengthSession(id: number): Promise<boolean>;
  /** Atomically delete session `id` (and its sets) and insert `input` in its place. */
  replaceStrengthSession(id: number, input: StrengthSessionInput): Promise<{ session: StrengthSession; setCount: number }>;
  getStrengthSessions(): Promise<StrengthSession[]>;
  getStrengthSets(): Promise<StrengthSet[]>;

  // --- Recovery (Garmin wellness; missing days allowed) ---
  upsertRecoveryDays(days: RecoveryDayInput[]): Promise<{ written: number }>;
  getRecoveryDays(): Promise<RecoveryDay[]>;
  /** Latest recovery day's date (YYYY-MM-DD), or null if none. The Garmin-sync wellness high-water mark. */
  latestRecoveryDate(): Promise<string | null>;

  // --- Weight (manual; thin trend, BIA body-fat loose only) ---
  saveWeightPoint(point: WeightPointInput): Promise<WeightPoint>;
  getWeightPoints(): Promise<WeightPoint[]>;

  // --- Weather cache (immutable historical data; cache forever) ---
  getWeatherHour(lat2dp: number, lon2dp: number, isoDate: string, hour: number): Promise<HourlyWeather | null>;
  putWeatherHours(entries: WeatherCacheEntry[]): Promise<void>;
  /** Set a run's heat-correction temperature + provenance after a weather lookup. */
  setRunTemperature(runId: number, correctedTemperatureC: number | null, source: TemperatureSource): Promise<void>;

  // --- Stat history (append-only) ---
  appendStatHistory(entry: StatHistoryInput): Promise<void>;
  getStatHistory(stat?: StatName): Promise<StatHistoryEntry[]>;

  // --- Life-sim modules (manual entry now; importers later). ---
  addExam(input: ExamInput): Promise<Exam>;
  listExams(): Promise<Exam[]>;
  updateExam(id: number, patch: ExamPatch): Promise<Exam | null>;
  deleteExam(id: number): Promise<boolean>;
  addSchoolTask(input: SchoolTaskInput): Promise<SchoolTask>;
  listSchoolTasks(): Promise<SchoolTask[]>;
  updateSchoolTask(id: number, patch: SchoolTaskPatch): Promise<SchoolTask | null>;
  deleteSchoolTask(id: number): Promise<boolean>;

  // --- Series/Volume/Copy/Purchase (Archives: manga + books; full replace, migration v13) ---
  addSeries(input: SeriesInput): Promise<Series>;
  listSeries(): Promise<Series[]>;
  getSeries(id: number): Promise<Series | null>;
  updateSeries(id: number, patch: SeriesPatch): Promise<Series | null>;
  deleteSeries(id: number): Promise<boolean>; // cascades volumes/copies (ON DELETE CASCADE)

  addVolume(input: VolumeInput): Promise<Volume>;
  listVolumes(): Promise<Volume[]>;
  listVolumesBySeries(seriesId: number): Promise<Volume[]>;
  updateVolume(id: number, patch: VolumePatch): Promise<Volume | null>;
  deleteVolume(id: number): Promise<boolean>;

  addCopy(input: CopyInput): Promise<Copy>;
  listCopies(): Promise<Copy[]>;
  listCopiesByVolume(volumeId: number): Promise<Copy[]>;
  updateCopy(id: number, patch: CopyPatch): Promise<Copy | null>;
  deleteCopy(id: number): Promise<boolean>;

  addPurchase(input: PurchaseInput): Promise<Purchase>;
  listPurchases(): Promise<Purchase[]>;
  updatePurchase(id: number, patch: PurchasePatch): Promise<Purchase | null>;
  deletePurchase(id: number): Promise<boolean>; // cascades purchase_items

  /** A Purchase's items are usually created atomically alongside it (or a single-item purchase). */
  addPurchaseItems(items: PurchaseItemInput[]): Promise<PurchaseItem[]>;
  listPurchaseItems(): Promise<PurchaseItem[]>;
}

export type { TemperatureSource };

/** One hour of historical weather at a location. */
export interface HourlyWeather {
  temperatureC: number;
  relativeHumidityPct: number | null;
  apparentTemperatureC: number | null;
}

/** A cacheable hour of weather, keyed by rounded coords + date + hour. */
export interface WeatherCacheEntry extends HourlyWeather {
  lat2dp: number;
  lon2dp: number;
  isoDate: string;
  hour: number;
}

export interface WeatherPort {
  /**
   * Temperature at the given local date+hour for a coordinate. Implementations
   * cache aggressively (historical data is immutable). Returns null when the
   * hour cannot be resolved (e.g. no coverage).
   */
  getHourly(lat: number, lon: number, isoDate: string, hour: number): Promise<HourlyWeather | null>;
}
