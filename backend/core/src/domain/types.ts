/**
 * Domain entity interfaces. Pure types only — no functions, no I/O.
 *
 * Field names carry units (…Kg, …Bpm, …Mps, …Deg).
 * Almost everything sourced from a device export is nullable: real exports drop
 * fields (no HR strap, no GPS, no temperature sensor) and the system must
 * degrade gracefully rather than invent zeros.
 */
import type { Bpm, Degrees, DegreesC, Kg, MetersPerSecond } from './units.ts';

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'other';
export type LoggingConvention = 'one_dumbbell_plus_bar' | 'total_weight';
export type TemperatureSource = 'fit' | 'weather' | 'none';
export type StatName = 'STAMINA' | 'STRENGTH' | 'LEANNESS';
export type Confidence = 'low' | 'medium' | 'high';
export type WeightSource = 'manual' | 'screenshot';
export type RecoverySource = 'garmin_csv' | 'manual' | 'garmin_mcp';

export type ConversionType =
  | 'unit_lbs_to_kg'
  | 'dumbbell_x2'
  | 'barbell_plus20'
  | 'machine_cable_as_is'
  | 'total_weight_passthrough'
  | 'pre2022_excluded'
  | 'semicircle_to_deg'
  | 'fit_timestamp_to_unix'
  | 'shoe_dedupe';

export interface Shoe {
  id: number;
  model: string;
  /** Authoritative tracked mileage. NOT the sum of FIT runs (they overlap). */
  priorCountedKm: number;
  notes: string | null;
}

export interface Run {
  id: number;
  /** SHA-256 of the source file; dedupe key so re-import never double-counts. */
  sourceFileHash: string;
  startTimeUtc: number;
  startTimeLocal: string;
  sport: string;
  totalDistanceM: number;
  totalDurationS: number;
  avgHrBpm: number | null;
  maxHrBpm: number | null;
  avgEnhancedSpeedMps: number | null;
  avgCadence: number | null;
  avgPowerW: number | null;
  startLatDeg: number | null;
  startLonDeg: number | null;
  elevationGainM: number | null;
  temperatureSource: TemperatureSource;
  correctedTemperatureC: number | null;
  shoeId: number | null;
}

export interface RunSample {
  runId: number;
  tOffsetS: number;
  heartRateBpm: number | null;
  enhancedSpeedMps: number | null;
  speedMps: number | null;
  cadence: number | null;
  powerW: number | null;
  latDeg: number | null;
  lonDeg: number | null;
  altitudeM: number | null;
  distanceM: number | null;
  temperatureC: number | null;
}

export interface Lap {
  runId: number;
  lapIndex: number;
  startTimeUtc: number;
  totalDistanceM: number;
  totalDurationS: number;
  avgHrBpm: number | null;
  maxHrBpm: number | null;
  avgSpeedMps: number | null;
}

export interface StrengthSession {
  id: number;
  sourceRowHash: string;
  title: string;
  startTimeUtc: number;
  /** Convention era is unknown before 2022; such sessions are not comparable. */
  pre2022: boolean;
  loggingConvention: LoggingConvention;
}

export interface StrengthSet {
  id: number;
  sessionId: number;
  exerciseTitleRaw: string;
  exerciseName: string;
  equipment: Equipment;
  supersetId: string | null;
  /** NULL when blank — never coerced to 0. */
  setIndex: number | null;
  setType: string;
  rawWeight: number | null;
  rawWeightUnit: 'kg' | 'lbs';
  reps: number | null;
  rpe: number | null;
  distanceMiles: number | null;
  durationSeconds: number | null;
  /** After unit normalisation (lbs->kg) but BEFORE the load convention. */
  weightKgNormalized: number | null;
  /** After +20 bar / x2 dumbbell / total-weight passthrough. The real load. */
  realLoadKg: number | null;
  correctionApplied: string | null;
  /** Pre-2022 or otherwise non-comparable sets are excluded from trends. */
  excludedFromTrend: boolean;
}

export interface WeightPoint {
  id: number;
  date: string;
  weightKg: number;
  /** BIA is unreliable (±5-8pts). Loose multi-week trend only, never absolute. */
  bodyFatPct: number | null;
  source: WeightSource;
  notes: string | null;
}

export interface RecoveryDay {
  date: string;
  sleepScore: number | null;
  hrvOvernightMs: number | null;
  restingHrBpm: number | null;
  bodyBattery: number | null;
  source: RecoverySource;
}

export interface StatHistoryEntry {
  id: number;
  stat: StatName;
  date: string;
  value: number;
  level: number;
  confidence: Confidence;
  trigger: string;
  inputsJson: string;
}

export type StatHistoryInput = Omit<StatHistoryEntry, 'id'>;

// --- Life-sim modules: Books (Archives), Exams (Missions) ---
// Additive, engine-neutral. No lossy unit conversion → the conversion_audit funnel
// does NOT apply. Manual entry now; importers later. Dates are ISO "YYYY-MM-DD".
// Each status/kind enum is a SINGLE SOURCE OF TRUTH: the
// SQLite CHECK mirrors it and a drift test guards it.

// Lifecycle, NOT pass/fail: scheduled (upcoming) → pending (sat, awaiting result) →
// graded (a grade is in). Pass/fail is DERIVED from the grade (≥10), never stored — see
// `domain/exam.ts`. A failed first attempt (grade<10) auto-becomes a resit.
export const EXAM_STATUSES = ['scheduled', 'pending', 'graded'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export interface Exam {
  id: number;
  course: string;
  /** ISO date of the first sitting; the deadline that drives the countdown. */
  examDate: string;
  status: ExamStatus;
  grade: number | null; // first attempt, Belgian scale 0–20 (pass = 10)
  /** Optional resit: one record holds both attempts, no second entry. */
  resitDate: string | null;
  resitGrade: number | null; // resit attempt, 0–20
  credits: number | null; // studiepunten / ECTS credits
  /** Academic-board tolerance (deliberated/tolerated) — a <10 grade the board still passed.
   * Overrides the derived ≥10 rule in `domain/exam.ts` (`examPassed`) but the real grade is kept
   * (still counts, at its true value, in the credit-weighted year average — migration v18). */
  deliberated: boolean;
  notes: string | null;
  createdAt: number;
}

// SCHOOL TERM: school tasks & deadlines (assignments, company visits). Done is a stored flag
// (a task has no grade to derive it from); overdue/daysUntil are DERIVED in `domain/school-task.ts`.
export const SCHOOL_TASK_KINDS = ['task', 'company_visit', 'other'] as const;
export type SchoolTaskKind = (typeof SCHOOL_TASK_KINDS)[number];

export interface SchoolTask {
  id: number;
  title: string;
  kind: SchoolTaskKind;
  /** ISO date the task is due. */
  deadline: string;
  course: string | null;
  notes: string | null;
  done: boolean;
  /** ISO date it was marked done (null while open). */
  doneDate: string | null;
  createdAt: number;
}

// Series/Volume/Copy/Purchase (Archives → MANGA + BOOKS tabs). Migration v13 FULL
// REPLACE of the old flat Book/Manga entities — deliberately not additive, unlike
// every other life-sim module. Splits what used to be one flat row into: the
// abstract Series (canonical title/metadata), the concrete Volume (an edition —
// ISBN/publisher/release date), your ownership of it (Copy — owned/read-status/
// rating), and the Purchase event (so a box/bundle purchase doesn't have to map
// 1:1 to items — see domain/series.ts for the aggregation rules). A plain Book is
// modelled as a Series(type='book') with exactly one Volume (volumeNumber: null).

export const SERIES_TYPES = ['manga', 'book', 'LN'] as const;
export type SeriesType = (typeof SERIES_TYPES)[number];

/** Publication status of the WORK itself (still being released?), not your reading progress. */
export const SERIES_STATUSES = ['ongoing', 'completed', 'hiatus'] as const;
export type SeriesPublicationStatus = (typeof SERIES_STATUSES)[number];

/** YOUR personal reading lifecycle for the whole series — "I dropped this", independent of
 * whether the work itself is still being published (publicationStatus) or any one volume's
 * read status. Mirrors the old Manga.status 'dropped' state (backlog/reading collapsed into
 * 'active' — the UI already treats those as one bucket). */
export const SERIES_READING_STATUSES = ['active', 'dropped'] as const;
export type SeriesReadingStatus = (typeof SERIES_READING_STATUSES)[number];

export interface Series {
  id: number;
  canonicalTitle: string;
  /** Free-text author (mangaka / novelist). Nullable: the metadata lookups don't always supply one. */
  author: string | null;
  /** Alternate/romaji/native titles. JSON array column; [] for manual/unknown. */
  altTitles: string[];
  type: SeriesType;
  anilistId: number | null;
  mangadexId: string | null;
  mangaupdatesId: string | null;
  malId: number | null;
  publicationStatus: SeriesPublicationStatus;
  readingStatus: SeriesReadingStatus;
  /** Volumes released so far (ongoing) or the final count (complete); null if unknown. */
  totalVolumesKnown: number | null;
  englishPublisher: string | null;
  readingDirection: 'ltr' | 'rtl' | null;
  /** Series-level cover from the metadata lookup (AniList/Jikan); null for manual entries. */
  coverUrl: string | null;
  /** Genres, prefilled from the AniList lookup; [] for manual/unknown. JSON array column. */
  genres: string[];
  notes: string | null;
  /** SHA-256 of a future importer row; null for manual entries. */
  sourceHash: string | null;
  /** Unix seconds, stamped by the repository (wall clock) at insert. */
  createdAt: number;
}

export const VOLUME_FORMATS = ['single', 'omnibus', 'digital'] as const;
export type VolumeFormat = (typeof VOLUME_FORMATS)[number];

export interface Volume {
  id: number;
  seriesId: number;
  /** null for a one-shot / plain book (no per-volume numbering). REAL: 3-in-1 omnibus / .5 volumes exist. */
  volumeNumber: number | null;
  title: string | null;
  isbn13: string | null;
  isbn10: string | null;
  publisher: string | null;
  releaseDateEn: string | null;
  releaseDateJp: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  coverSource: string | null;
  format: VolumeFormat;
  createdAt: number;
}

export const READ_STATUSES = ['unread', 'reading', 'read', 'dnf'] as const;
export type ReadStatus = (typeof READ_STATUSES)[number];

export interface Copy {
  id: number;
  volumeId: number;
  owned: boolean;
  acquiredDate: string | null;
  condition: string | null;
  readStatus: ReadStatus;
  readDate: string | null;
  rating: number | null; // 1–5
  notes: string | null;
  /** -> Purchase; null until tagged (manually or by buy-volume). */
  purchaseId: number | null;
  createdAt: number;
}

export const PURCHASE_TYPES = ['single', 'box'] as const;
export type PurchaseType = (typeof PURCHASE_TYPES)[number];

export interface Purchase {
  id: number;
  /** Nullable: an estimated purchase may not know a real date. */
  date: string | null;
  /** Retailer name, "estimate", ... */
  source: string | null;
  /** EUR CENTS (integer), not float euros — avoids currency float drift. Null = unknown total. */
  totalPrice: number | null;
  currency: string; // default 'EUR'
  type: PurchaseType;
  /** true = price-table guess. NEVER conflate with a real receipt. */
  estimated: boolean;
  notes: string | null;
  createdAt: number;
}

export interface PurchaseItem {
  id: number;
  purchaseId: number;
  volumeId: number;
  /** EUR cents; null = "part of a box, not split out" (per-volume price shown as a box average instead). */
  allocatedPrice: number | null;
}

// --- Branded-unit aliases used by the domain layer ------------------------
// Re-export the unit brands as a convenience for entity-adjacent code.
export type { Bpm, Degrees, DegreesC, Kg, MetersPerSecond };
