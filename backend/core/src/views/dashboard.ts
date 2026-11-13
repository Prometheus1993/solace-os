/**
 * The frozen, read-only UI contract. A single JSON-serializable DTO with
 * everything a UI needs — so the React app in frontend/ imports this type + calls one assembler, with no coupling to
 * the storage layer. Keep it plain values only (no class instances, no Dates).
 */
import type { AthleteConfig } from '../domain/athlete-config.ts';
import type { Copy, Exam, ExamStatus, Purchase, PurchaseItem, ReadStatus, RecoveryDay, Run, SchoolTask, SchoolTaskKind, Series, SeriesPublicationStatus, SeriesReadingStatus, SeriesType, StatHistoryEntry, StatName, Volume, VolumeFormat, WeightPoint } from '../domain/types.ts';
import { schoolTaskDaysUntil, schoolTaskOverdue, sortSchoolTasks } from '../domain/school-task.ts';
import { examBestGrade, examNeedsResit, examPassed, examYearAverage, type YearAverage } from '../domain/exam.ts';
import { nextVolumeToBuy, seriesCaughtUp, seriesFinished, seriesOwnedCount, seriesReadCount, totalSpent, volumePricePaid } from '../domain/series.ts';
import { addDaysIso, diffDays, isoWeekStart, withinWindow } from '../domain/dates.ts';
import { round1 } from '../domain/math.ts';
import type { Sky } from '../domain/sky.ts';
import { buildWeeklyReport, type WeeklyReport } from './weekly-report.ts';
import { reconcileShoeMileage } from '../conventions/shoe-mileage.ts';
import {
  buildCoachingReport,
  classifyRun,
  hrvBaseline,
  hrvFlag,
  lastCompletedRecoveryWeek,
  lastCompletedWeekRange,
  type DriftTrend,
  type HrvBaseline,
  type ProgressNarrative,
  type ReadinessResult,
  type RecoverySnapshot,
  type RecoveryWeekAverage,
  type RunRead,
} from '../coaching/index.ts';
import {
  computeLeanness,
  computeStamina,
  computeStrength,
  goalQuests,
  goalsView,
  resolveGoals,
  type GoalsView,
  keyLiftOf,
  tierForLevel,
  computeJourney,
  type JourneyView,
  type KeyLiftId,
  type QuestProgress,
  type ScoredStrengthSet,
  type StatResult,
  type StatTier,
} from '../gamification/index.ts';

/** A read-only level-change moment, derived from live vs last-persisted level. */
export interface LevelEvent {
  stat: StatName;
  trigger: 'level_up' | 'level_down';
  level: number;
  date: string;
}

/** One point on a Vitals trend series. */
export interface VitalPoint {
  date: string;
  value: number;
}

/** Rolling run-load context (longest recent run, weekly volume). */
export interface CoachContext {
  /** Longest single run in the trailing 30 days (0 if none). */
  longest30dKm: number;
  /** Completed run km in the last COMPLETED Mon–Sun week (last completed Mon–Sun week). */
  lastWeekRunKm: number;
  /** Run km of the most recent COMPLETED Mon–Sun week that had any runs, looking back at most
   * `LAST_ACTIVE_WEEK_LOOKBACK` weeks; null if none. The `weekly_jump` baseline after a break, when
   * `lastWeekRunKm` is 0. */
  lastActiveWeekRunKm: number | null;
  /** Monday of that week; null if none. */
  lastActiveWeekStart: string | null;
  /** Average weekly km over the 28 days ending `asOf`. Anchored on `asOf`, so it DECAYS during
   * inactivity — unlike `weeklyKmOf` (quests), which anchors on the latest run on purpose. */
  weeklyKm28d: number;
  runsLast30d: number;
}

/** How far back `lastActiveWeekRunKm` looks. Older than this, a comparison stops being meaningful. */
const LAST_ACTIVE_WEEK_LOOKBACK = 8;

/** The athlete's self-referenced HRV baseline (`hrv-baseline.ts`) plus today's flag against it —
 * NOT wired into the readiness gate (see that module's header); surfaced here read-only. */
export interface HrvStatus {
  baseline: HrvBaseline;
  todayFlag: 'normal' | 'low' | 'unknown';
}

export interface DashboardDTO {
  generatedAt: string;
  athlete: {
    age: number;
    heightCm: number | null;
    heightConfirmed: boolean;
    maxHr: number;
    restingHrBaseline: number;
    hrvBaselineMs: number;
  };
  /** The editable targets (VITALS): value in force + whether the athlete set it or it is the default. */
  goals: GoalsView;
  readiness: ReadinessResult;
  recovery: RecoverySnapshot;
  /** Last COMPLETED Mon–Sun week's recovery averages (display only — Home's weekly overview
   * card; NEVER fed to the readiness gate above, which stays on the rolling windows). */
  recoveryWeek: RecoveryWeekAverage;
  /** Self-referenced HRV baseline + today's flag against it (`hrv-baseline.ts`). */
  hrv: HrvStatus;
  recentRuns: RunRead[];
  driftTrend: DriftTrend;
  progress: ProgressNarrative;
  /** STATUS weekly report: last completed Mon–Sun week vs the week before (display only). */
  weeklyReport: WeeklyReport;
  /** Rolling run-load context, so a reader need not recompute history. */
  coachContext: CoachContext;
  stats: {
    stamina: StatResult;
    strength: StatResult;
    leanness: StatResult;
    /** Combined character level (0–100): the rounded average of the three tracks. */
    hero: { level: number; tier: StatTier };
  };
  /** Recent level crossings (live vs last persisted) — drives the level-up flash. */
  levelEvents: LevelEvent[];
  /** Each stat since its fresh start (start reading + a point per day), from the stat history. Display only. */
  journey: JourneyView;
  quests: QuestProgress[];
  shoe: { model: string; authoritativeKm: number; baselineKm: number; sinceResetKm: number; fitRunsKm: number; note: string } | null;
  totals: { runCount: number; totalRunKm: number; strengthSets: number };
  body: {
    latestWeightKg: number | null;
    weightDate: string | null;
    heightCm: number | null;
    heightConfirmed: boolean;
    bmi: number | null;
    bodyFatPct: number | null;
    weighIns: number;
  };
  /** Chronological trend series (last ~45 points each) for the Vitals tab charts. Empty when no data. */
  vitals: {
    weight: VitalPoint[];
    bodyFat: VitalPoint[];
    hrv: VitalPoint[];
    sleep: VitalPoint[];
    restingHr: VitalPoint[];
    bodyBattery: VitalPoint[];
  };
  /** All runs (for the Running tab), oldest → newest. */
  runs: Array<{
    date: string;
    km: number;
    durationMin: number;
    avgHrBpm: number | null;
    /** Heat correction the classifier applied (bpm subtracted); 0 when none. */
    heatOffsetBpm: number;
    /** avgHr after the heat correction; null when no HR. */
    adjustedAvgHr: number | null;
    zone: number | null;
    label: string | null;
    driftFlag: boolean;
    temperatureC: number | null;
    /** The classifier's per-run narrative (zone reasoning, heat note) — shown when a row is expanded. */
    reasons: string[];
  }>;
  /** Key-lift progression (for the Strength tab). */
  strengthLifts: Array<{
    lift: string;
    label: string;
    peakKg: number | null;
    points: Array<{ date: string; kg: number }>;
  }>;
  /** Life-sim modules (additive; manual entry now). Archives (books/manga/LN) unified
   * under one Series/Volume model (migration v13 full replace of the old Book/Manga). */
  series: DashboardSeries[];
  missions: DashboardMission[];
  /** School tasks & deadlines (SCHOOL TERM): open by deadline asc, then done. */
  schoolTasks: DashboardSchoolTask[];
  lifeSimSummary: LifeSimSummary;
  /** Sun times + current weather for the desk (additive). null when disabled or Open-Meteo was unreachable. */
  sky: Sky | null;
  /** How far behind ingestion is, so a silent sync gap is visible (not just a lowered
   * confidence word buried in the readiness rationale). See `computeDataFreshness`. */
  dataFreshness: DataFreshness;
}

/** Newest date already ingested for recovery/runs, and how many whole days behind `asOf`
 * that is. Null fields mean no data of that kind exists yet. */
export interface DataFreshness {
  recoveryLatestDate: string | null;
  recoveryDaysStale: number | null;
  runsLatestDate: string | null;
  runsDaysStale: number | null;
}

// --- Life-sim view slices (Archives/Missions) ---------------------------
/** One edition of a Series, with your ownership/read state (Copy) + price flattened in. */
export interface DashboardVolume {
  id: number;
  /** The chosen Copy's id (the SAME copy this row's owned/readStatus/rating/pricePaid come from);
   * null when the volume has no Copy row. The UI PATCHes /api/copies?id=<copyId> to change read status. */
  copyId: number | null;
  /** null = a one-shot / plain book (no per-volume numbering). */
  volumeNumber: number | null;
  title: string | null;
  isbn13: string | null;
  format: VolumeFormat;
  coverUrl: string | null;
  owned: boolean;
  readStatus: ReadStatus;
  readDate: string | null;
  rating: number | null;
  /** Split PurchaseItem price, else a box-purchase average, else null (nothing tagged yet). */
  pricePaid: { amountCents: number; estimated: boolean; split: boolean } | null;
}
/** A Series (manga/book/LN), volume-aware, with a next-volume-to-buy hint — replaces the old
 * flat DashboardBook/DashboardManga (migration v13 full replace). One row per Series; its
 * volumes nest inside (a 70-volume series is one shelf row, not 70). */
export interface DashboardSeries {
  id: number;
  title: string;
  /** Free-text author (mangaka / novelist); null when unknown. Shown under the title + searchable. */
  author: string | null;
  type: SeriesType;
  publicationStatus: SeriesPublicationStatus;
  /** Your reading lifecycle for the whole series — "I dropped this", independent of publicationStatus. */
  readingStatus: SeriesReadingStatus;
  /** Volumes released so far (ongoing) or the final count (complete); null if unknown. */
  totalVolumesKnown: number | null;
  coverUrl: string | null;
  /** Genres (from the AniList lookup; [] when unknown). Drives the shelf's genre filter/search. */
  genres: string[];
  englishPublisher: string | null;
  notes: string | null;
  /** Distinct volumes with at least one owned Copy. */
  ownedCount: number;
  /** Distinct volumes with at least one Copy marked 'read'. */
  readCount: number;
  /** readCount/totalVolumesKnown*100, rounded & clamped; null when unknown. */
  progressPct: number | null;
  /** The volume NUMBER to buy next (owned+1) when behind on an active series; null when nothing to buy. */
  nextVolumeToBuy: number | null;
  /** max(0, totalVolumesKnown - owned) when total known: volumes left to BUY; null otherwise. */
  volumesBehind: number | null;
  /** max(0, owned - read): volumes you own but haven't read yet. */
  unreadOwned: number;
  /** Derived: read the whole known run (or a one-shot). Not stored. */
  finished: boolean;
  /** Derived: own every released volume of a still-publishing series. */
  caughtUp: boolean;
  /** Any volume currently mid-read. */
  reading: boolean;
  /** Σ price paid across priced volumes; null when nothing is priced yet. */
  totalSpentCents: number | null;
  volumes: DashboardVolume[];
}
export interface DashboardMission {
  id: number;
  course: string;
  status: ExamStatus;
  examDate: string;
  /** diffDays(asOf, examDate): days until the first sitting. DETERMINISTIC over asOf. */
  daysUntil: number;
  overdue: boolean;
  grade: number | null;
  resitDate: string | null;
  resitGrade: number | null;
  /** diffDays(asOf, resitDate) when a resit is dated, else null. */
  resitDaysUntil: number | null;
  credits: number | null;
  /** Derived (≥10 over the better of the two attempts). */
  passed: boolean;
  /** Derived: failed the first attempt (<10) and not yet passed a resit. */
  needsResit: boolean;
  /** Derived: the better of grade/resitGrade, or null when ungraded. */
  finalGrade: number | null;
  /** Academic-board tolerance (deliberated/tolerated) — a <10 grade the board still passed. */
  deliberated: boolean;
}
/** A school task/deadline (SCHOOL TERM). Listed open-first by deadline, then done; derived over asOf. */
export interface DashboardSchoolTask {
  id: number;
  title: string;
  kind: SchoolTaskKind;
  deadline: string;
  course: string | null;
  notes: string | null;
  done: boolean;
  doneDate: string | null;
  /** diffDays(asOf, deadline). DETERMINISTIC over asOf. */
  daysUntil: number;
  /** Derived: not done and the deadline is before asOf. */
  overdue: boolean;
}
export interface LifeSimSummary {
  /** type !== 'manga' (book + LN together). */
  booksReading: number;
  booksFinished: number;
  mangaReading: number;
  /** Still-publishing series you follow (publicationStatus 'ongoing', not dropped). */
  mangaOngoing: number;
  mangaFinished: number;
  /** Σ volumesBehind over active manga — total volumes left to buy to catch up. */
  volumesToBuy: number;
  /** Σ unreadOwned over active (non-dropped, non-finished) manga — owned volumes left to read. */
  volumesToRead: number;
  /** Σ Purchase.totalPrice across all Archives purchases (real + price-table estimates). */
  totalSpentCents: number;
  /** Of totalSpentCents, the portion from price-table estimates (Purchase.estimated). */
  totalSpentEstimatedCents: number;
  missionsUpcoming: number;
  nextMissionDays: number | null;
  /** Courses that failed (<10) and aren't passed on a resit yet — the resit count. */
  resitsNeeded: number;
  /** The resit window: earliest→latest dated resit + countdown to the first upcoming one. Null when no resit is dated. */
  resitWindow: { start: string; end: string; firstDays: number | null } | null;
  /** Grade-of-merit average: credit-weighted average of passed courses + distinction band. Null when none passed. */
  yearAverage: YearAverage | null;
}

export interface DashboardInput {
  asOf: string;
  config: AthleteConfig;
  runs: Run[];
  recoveryDays: RecoveryDay[];
  weightPoints: WeightPoint[];
  scoredStrengthSets: ScoredStrengthSet[];
  shoe: { id: number; model: string; priorCountedKm: number } | null;
  /** Append-only stat history, for deriving live level-change events. */
  statHistory: StatHistoryEntry[];
  series: Series[];
  volumes: Volume[];
  copies: Copy[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  exams: Exam[];
  schoolTasks: SchoolTask[];
  sky?: Sky | null;
}

/** Build the Vitals trend series from weigh-ins + recovery days (chronological, last ~45 points). */
function buildVitalsTrends(
  sortedWeights: WeightPoint[],
  recoveryDays: RecoveryDay[],
): DashboardDTO['vitals'] {
  const CAP = 45;
  const rec = [...recoveryDays].sort((a, b) => a.date.localeCompare(b.date));
  const pick = <T>(rows: T[], date: (r: T) => string, val: (r: T) => number | null): VitalPoint[] =>
    rows.flatMap((r) => {
      const v = val(r);
      return v == null ? [] : [{ date: date(r), value: v }];
    }).slice(-CAP);
  return {
    weight: pick(sortedWeights, (w) => w.date, (w) => w.weightKg),
    bodyFat: pick(sortedWeights, (w) => w.date, (w) => w.bodyFatPct),
    hrv: pick(rec, (d) => d.date, (d) => d.hrvOvernightMs),
    sleep: pick(rec, (d) => d.date, (d) => d.sleepScore),
    restingHr: pick(rec, (d) => d.date, (d) => d.restingHrBpm),
    bodyBattery: pick(rec, (d) => d.date, (d) => d.bodyBattery),
  };
}

/** The most recent (lexicographically max, since these are all YYYY-MM-DD) date in `dates`, or
 * null when empty. */
function latestIsoDate(dates: string[]): string | null {
  return dates.length === 0 ? null : dates.reduce((max, d) => (d > max ? d : max));
}

/** Whole days between `latest` and `asOf` via `diffDays`, clamped to never go negative (a
 * future-dated reading reads as "fresh", not stale). Null when `latest` is null. */
function staleDays(latest: string | null, asOf: string): number | null {
  return latest == null ? null : Math.max(0, diffDays(latest, asOf));
}

/** Pure: derives how far ingestion lags behind `asOf` for recovery + run data, so a silent
 * sync gap (DB behind the export file) is visible instead of hiding in a confidence word. */
export function computeDataFreshness(recoveryDates: string[], runDates: string[], asOf: string): DataFreshness {
  const recoveryLatestDate = latestIsoDate(recoveryDates);
  const runsLatestDate = latestIsoDate(runDates);
  return {
    recoveryLatestDate,
    recoveryDaysStale: staleDays(recoveryLatestDate, asOf),
    runsLatestDate,
    runsDaysStale: staleDays(runsLatestDate, asOf),
  };
}

/** Compare each live level to its last-persisted level and surface crossings. */
function computeLevelEvents(history: StatHistoryEntry[], live: Record<StatName, number>, date: string): LevelEvent[] {
  const lastByStat = new Map<StatName, StatHistoryEntry>();
  for (const e of history) {
    const cur = lastByStat.get(e.stat);
    if (!cur || e.date > cur.date || (e.date === cur.date && e.id > cur.id)) lastByStat.set(e.stat, e);
  }
  const events: LevelEvent[] = [];
  for (const stat of ['STAMINA', 'STRENGTH', 'LEANNESS'] as StatName[]) {
    const last = lastByStat.get(stat);
    if (!last) continue; // no prior level → not a crossing (handled as 'first' on recompute)
    const liveLevel = live[stat];
    if (liveLevel > last.level) events.push({ stat, trigger: 'level_up', level: liveLevel, date });
    else if (liveLevel < last.level) events.push({ stat, trigger: 'level_down', level: liveLevel, date });
  }
  return events;
}

/** Pure: the rolling run-load figures (see `CoachContext`'s doc).
 * Local-calendar-date bucketing throughout (`Run.startTimeLocal`). */
function computeCoachContext(runs: ReadonlyArray<Run>, asOf: string): CoachContext {
  const { weekStart, weekEnd } = lastCompletedWeekRange(asOf);
  let longest30dKm = 0;
  let runsLast30d = 0;
  let lastWeekRunKm = 0;
  let km28d = 0;
  // Run km per completed Mon–Sun week, keyed by its Monday, for the last-active-week look-back.
  const lookbackStart = addDaysIso(weekStart, -7 * (LAST_ACTIVE_WEEK_LOOKBACK - 1));
  const kmByWeek = new Map<string, number>();
  for (const run of runs) {
    const date = run.startTimeLocal.slice(0, 10);
    const km = run.totalDistanceM / 1000;
    if (withinWindow(date, asOf, 30)) {
      runsLast30d += 1;
      if (km > longest30dKm) longest30dKm = km;
    }
    if (withinWindow(date, asOf, 28)) km28d += km;
    if (date >= weekStart && date <= weekEnd) lastWeekRunKm += km;
    if (date >= lookbackStart && date <= weekEnd) {
      const monday = isoWeekStart(date);
      kmByWeek.set(monday, (kmByWeek.get(monday) ?? 0) + km);
    }
  }
  let lastActiveWeekRunKm: number | null = null;
  let lastActiveWeekStart: string | null = null;
  for (let k = 0; k < LAST_ACTIVE_WEEK_LOOKBACK; k++) {
    const monday = addDaysIso(weekStart, -7 * k);
    const km = kmByWeek.get(monday) ?? 0;
    if (km > 0) {
      lastActiveWeekRunKm = round1(km);
      lastActiveWeekStart = monday;
      break;
    }
  }
  return {
    longest30dKm: round1(longest30dKm),
    lastWeekRunKm: round1(lastWeekRunKm),
    lastActiveWeekRunKm,
    lastActiveWeekStart,
    weeklyKm28d: round1((km28d * 7) / 28),
    runsLast30d,
  };
}

export function buildDashboard(input: DashboardInput): DashboardDTO {
  const { asOf, config, runs, recoveryDays, weightPoints, scoredStrengthSets, shoe, statHistory, series, volumes, copies, purchases, purchaseItems, exams, schoolTasks } = input;

  const sortedWeights = [...weightPoints].sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = sortedWeights[sortedWeights.length - 1] ?? null;
  const stamina = computeStamina(runs);
  const strength = computeStrength(scoredStrengthSets, asOf, weightPoints);
  const goals = resolveGoals(config.goals);
  const leanness = computeLeanness(weightPoints, goals);
  const heroLevel = Math.round((stamina.level + strength.level + leanness.level) / 3);
  const hero = { level: heroLevel, tier: tierForLevel(heroLevel) };
  const levelEvents = computeLevelEvents(
    statHistory,
    { STAMINA: stamina.level, STRENGTH: strength.level, LEANNESS: leanness.level },
    asOf,
  );

  const report = buildCoachingReport({ asOf, runs, recoveryDays, weightPoints }, config);
  const recoveryWeek = lastCompletedRecoveryWeek(recoveryDays, asOf);
  const coachContext = computeCoachContext(runs, asOf);
  const hrvBaselineResult = hrvBaseline(recoveryDays, asOf);
  const hrv: HrvStatus = { baseline: hrvBaselineResult, todayFlag: hrvFlag(report.recovery.today.hrv, hrvBaselineResult) };
  const totalRunKm = runs.reduce((sum, r) => sum + r.totalDistanceM / 1000, 0);

  const heightCm = config.heightCm;
  const bmi =
    latestWeight && heightCm ? round1(latestWeight.weightKg / Math.pow(heightCm / 100, 2)) : null;

  const runList = [...runs]
    .sort((a, b) => a.startTimeUtc - b.startTimeUtc)
    .map((run) => {
      const read = classifyRun(run, config.maxHr);
      return {
        date: read.date,
        km: round1(run.totalDistanceM / 1000),
        durationMin: Math.round(run.totalDurationS / 60),
        avgHrBpm: run.avgHrBpm,
        heatOffsetBpm: read.heatOffsetBpm,
        adjustedAvgHr: read.adjustedAvgHr,
        zone: read.zone,
        label: read.label,
        driftFlag: read.driftFlag,
        temperatureC: run.correctedTemperatureC,
        reasons: read.reasons,
      };
    });

  const dataFreshness = computeDataFreshness(recoveryDays.map((d) => d.date), runList.map((r) => r.date), asOf);

  const liftHistory = (lift: KeyLiftId): Array<{ date: string; kg: number }> => {
    const byDate = new Map<string, number>();
    for (const s of scoredStrengthSets) {
      if (s.excludedFromTrend || s.realLoadKg == null || keyLiftOf(s) !== lift) continue;
      const cur = byDate.get(s.sessionDateIso) ?? 0;
      if (s.realLoadKg > cur) byDate.set(s.sessionDateIso, s.realLoadKg);
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, kg]) => ({ date, kg }));
  };
  const strengthLifts = [
    { lift: 'bench', label: 'Bench Press', peakKg: config.peakLoads.benchPressKg as number | null, points: liftHistory('bench') },
    { lift: 'squat', label: 'Squat', peakKg: null, points: liftHistory('squat') },
    { lift: 'sumoDeadlift', label: 'Sumo Deadlift', peakKg: null, points: liftHistory('sumoDeadlift') },
  ];

  const seriesView: DashboardSeries[] = [...series]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => {
      const seriesVolumes = volumes.filter((v) => v.seriesId === s.id).sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
      const volumeIds = new Set(seriesVolumes.map((v) => v.id));
      const seriesCopies = copies.filter((c) => volumeIds.has(c.volumeId));
      const ownedCount = seriesOwnedCount(seriesVolumes, seriesCopies);
      const readCount = seriesReadCount(seriesVolumes, seriesCopies);
      const total = s.totalVolumesKnown;
      const volumesBehind = total != null ? Math.max(0, total - ownedCount) : null;
      // Don't round UP to 100% before the series is actually read to the end — floor and cap at 99 until then.
      const progressPct = total != null && total > 0 ? (readCount >= total ? 100 : Math.min(99, Math.floor((readCount / total) * 100))) : null;

      const volumesView: DashboardVolume[] = seriesVolumes.map((v) => {
        const copy = seriesCopies.find((c) => c.volumeId === v.id && c.owned) ?? seriesCopies.find((c) => c.volumeId === v.id) ?? null;
        return {
          id: v.id,
          copyId: copy?.id ?? null,
          volumeNumber: v.volumeNumber,
          title: v.title,
          isbn13: v.isbn13,
          format: v.format,
          coverUrl: v.coverUrl,
          owned: copy?.owned ?? false,
          readStatus: copy?.readStatus ?? 'unread',
          readDate: copy?.readDate ?? null,
          rating: copy?.rating ?? null,
          pricePaid: copy ? volumePricePaid(v.id, seriesCopies, purchases, purchaseItems) : null,
        };
      });
      const pricedVolumes = volumesView.filter((v) => v.pricePaid != null);

      return {
        id: s.id,
        title: s.canonicalTitle,
        author: s.author,
        type: s.type,
        publicationStatus: s.publicationStatus,
        readingStatus: s.readingStatus,
        totalVolumesKnown: s.totalVolumesKnown,
        coverUrl: s.coverUrl,
        genres: s.genres,
        englishPublisher: s.englishPublisher,
        notes: s.notes,
        ownedCount,
        readCount,
        progressPct,
        nextVolumeToBuy: nextVolumeToBuy(s, seriesVolumes, seriesCopies),
        volumesBehind,
        unreadOwned: Math.max(0, ownedCount - readCount),
        finished: seriesFinished(s, seriesVolumes, seriesCopies),
        caughtUp: seriesCaughtUp(s, seriesVolumes, seriesCopies),
        // "Reading" = some progress made — a volume mid-read OR fully read. The old model's manual
        // 'reading' status doesn't exist anymore (readingStatus only distinguishes active/dropped,
        // backlog+reading deliberately collapsed into 'active'), so this is the closest derivable analog.
        // A DROPPED series is never "reading" — the old status==='reading' was mutually exclusive with
        // 'dropped', so guard here at the source (fixes the summary tiles + Home's "currently reading").
        reading: s.readingStatus !== 'dropped' && (readCount > 0 || seriesCopies.some((c) => c.readStatus === 'reading')),
        totalSpentCents: pricedVolumes.length > 0 ? pricedVolumes.reduce((sum, v) => sum + (v.pricePaid?.amountCents ?? 0), 0) : null,
        volumes: volumesView,
      };
    });
  const missionsView: DashboardMission[] = [...exams]
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .map((e) => {
      const daysUntil = diffDays(asOf, e.examDate);
      return {
        id: e.id,
        course: e.course,
        status: e.status,
        examDate: e.examDate,
        daysUntil,
        overdue: daysUntil < 0 && e.status === 'scheduled',
        grade: e.grade,
        resitDate: e.resitDate,
        resitGrade: e.resitGrade,
        resitDaysUntil: e.resitDate != null ? diffDays(asOf, e.resitDate) : null,
        credits: e.credits,
        passed: examPassed(e),
        needsResit: examNeedsResit(e),
        finalGrade: examBestGrade(e),
        deliberated: e.deliberated,
      };
    });
  const schoolTasksView: DashboardSchoolTask[] = sortSchoolTasks(schoolTasks).map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind,
    deadline: t.deadline,
    course: t.course,
    notes: t.notes,
    done: t.done,
    doneDate: t.doneDate,
    daysUntil: schoolTaskDaysUntil(t, asOf),
    overdue: schoolTaskOverdue(t, asOf),
  }));
  const nextMission = missionsView.find((m) => m.status === 'scheduled' && m.daysUntil >= 0) ?? null;
  // Resit window: the DATED resits for courses that still need one (failed first, not yet passed).
  const datedResits = missionsView
    .filter((m) => m.needsResit && m.resitDate != null)
    .sort((a, b) => a.resitDate!.localeCompare(b.resitDate!));
  const resitWindow = datedResits.length > 0
    ? (() => {
        const start = datedResits[0]!.resitDate!;
        const end = datedResits[datedResits.length - 1]!.resitDate!;
        const next = datedResits.find((m) => (m.resitDaysUntil ?? -1) >= 0);
        return { start, end, firstDays: next ? next.resitDaysUntil : null };
      })()
    : null;
  const lifeSimSummary: LifeSimSummary = {
    booksReading: seriesView.filter((s) => s.type !== 'manga' && s.reading && !s.finished).length,
    booksFinished: seriesView.filter((s) => s.type !== 'manga' && s.finished).length,
    // Disjoint buckets: "Ongoing" = following a still-running series; "Reading" = reading a
    // completed-run series (a binge), so the two stat tiles never double-count one manga.
    mangaReading: seriesView.filter((s) => s.type === 'manga' && s.reading && !s.finished && s.publicationStatus !== 'ongoing').length,
    mangaOngoing: seriesView.filter((s) => s.type === 'manga' && s.publicationStatus === 'ongoing' && s.readingStatus !== 'dropped').length,
    mangaFinished: seriesView.filter((s) => s.type === 'manga' && s.finished).length,
    volumesToBuy: seriesView.reduce((sum, s) => sum + (s.type === 'manga' && s.nextVolumeToBuy != null ? s.volumesBehind ?? 0 : 0), 0),
    volumesToRead: seriesView.reduce((sum, s) => sum + (s.type === 'manga' && s.readingStatus !== 'dropped' && !s.finished ? s.unreadOwned : 0), 0),
    totalSpentCents: totalSpent(purchases, { includeEstimated: true }),
    totalSpentEstimatedCents: totalSpent(purchases.filter((p) => p.estimated), { includeEstimated: true }),
    missionsUpcoming: missionsView.filter((m) => m.status === 'scheduled' && m.daysUntil >= 0).length,
    nextMissionDays: nextMission ? nextMission.daysUntil : null,
    resitsNeeded: missionsView.filter((m) => m.needsResit).length,
    resitWindow,
    yearAverage: examYearAverage(exams),
  };

  return {
    generatedAt: asOf,
    athlete: {
      age: config.age,
      heightCm: config.heightCm,
      heightConfirmed: config.heightConfirmed,
      maxHr: config.maxHr,
      restingHrBaseline: config.restingHrBaseline,
      hrvBaselineMs: config.hrvBaselineMs,
    },
    goals: goalsView(config.goals),
    readiness: report.readiness,
    recovery: report.recovery,
    recoveryWeek,
    hrv,
    recentRuns: report.recentRunReads,
    driftTrend: report.driftTrend,
    progress: report.progress,
    weeklyReport: buildWeeklyReport(asOf, runs, scoredStrengthSets, recoveryDays, weightPoints),
    coachContext,
    stats: { stamina, strength, leanness, hero },
    levelEvents,
    journey: computeJourney(statHistory),
    quests: goalQuests(runs, weightPoints, goals),
    shoe: shoe
      ? (() => {
          const shoeKm = runs.filter((r) => r.shoeId === shoe.id).reduce((sum, r) => sum + r.totalDistanceM / 1000, 0);
          const m = reconcileShoeMileage({ priorCountedKm: shoe.priorCountedKm, fitRunsKm: shoeKm });
          return { model: shoe.model, authoritativeKm: m.authoritativeKm, baselineKm: m.baselineKm, sinceResetKm: m.sinceResetKm, fitRunsKm: m.fitRunsKm, note: m.note };
        })()
      : null,
    totals: { runCount: runs.length, totalRunKm: Math.round(totalRunKm * 10) / 10, strengthSets: scoredStrengthSets.length },
    body: {
      latestWeightKg: latestWeight?.weightKg ?? null,
      weightDate: latestWeight?.date ?? null,
      heightCm,
      heightConfirmed: config.heightConfirmed,
      bmi,
      // The literal latest weigh-in may lack bf%; show the most recent one that has it
      // (mixed logging — a plain-scale weigh-in shouldn't blank out a recent bf% reading).
      bodyFatPct: [...sortedWeights].reverse().find((w) => w.bodyFatPct != null)?.bodyFatPct ?? null,
      weighIns: weightPoints.length,
    },
    vitals: buildVitalsTrends(sortedWeights, recoveryDays),
    runs: runList,
    strengthLifts,
    series: seriesView,
    missions: missionsView,
    schoolTasks: schoolTasksView,
    lifeSimSummary,
    sky: input.sky ?? null,
    dataFreshness,
  };
}
