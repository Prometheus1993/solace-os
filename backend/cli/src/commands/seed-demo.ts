import { existsSync, rmSync } from 'node:fs';
import {
  addDaysIso,
  DEFAULT_CONFIG,
  LEANNESS_FRESH_START,
  STRENGTH_FRESH_START,
  type Clock,
  type CopyPatch,
  type ExamInput,
  type PriceTable,
  type Repository,
  type SchoolTaskInput,
  type SeriesInput,
} from '@solace/core';
import { demoDbPath, logStrengthSession, recomputeStats, recordVolumeBought } from '@solace/data';

// Fake, deterministic demo data for `seed --demo`. Everything is invented (generic names, public-domain book titles)
// and dated relative to clock.today(), so the same date always yields identical data. Writes go through the
// repository / the same funnels the app uses (logStrengthSession, recordVolumeBought).

const atUtc = (date: string, hour: number): number => Math.floor(Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`) / 1000);

/**
 * The `--demo` DB guard. Returns the one demo path (never SOLACE_DB, never the live DB). If it exists: refuse
 * unless `reset`, which deletes only the demo trio (.sqlite, -wal, -shm).
 */
export function prepareDemoDb(reset: boolean, cwd: string = process.cwd()): string {
  const path = demoDbPath(cwd);
  const trio = [path, `${path}-wal`, `${path}-shm`];
  if (existsSync(path) && !reset) {
    throw new Error(`${path} already exists. Pass --reset to delete it and seed again.`);
  }
  for (const f of trio) rmSync(f, { force: true });
  return path;
}

async function seedTraining(repo: Repository, clock: Clock): Promise<void> {
  const today = clock.today();
  await repo.saveAthleteConfig({ ...DEFAULT_CONFIG, goals: { weightKg: 76, bodyFatPct: 15, paceMinPerKm: 5.5, weeklyKm: 30 } });
  const shoe = await repo.saveShoe({ model: 'Demo trainer', priorCountedKm: 120, notes: 'Made-up shoe for the demo.' });

  // Three runs a week for 10 weeks (Tue / Thu / Sat-ish), easy pace slowly improving.
  for (let i = 0; i < 30; i++) {
    const date = addDaysIso(today, -(2 + Math.floor(i / 3) * 7 + (i % 3) * 2 + 1));
    if (date > today) continue;
    const km = [5.2, 7.5, 10.4][i % 3]! + (i % 4) * 0.3;
    const paceSPerKm = 372 - Math.floor((29 - i) / 3) * 2 - (i % 3 === 0 ? 8 : 0);
    const durationS = Math.round(km * paceSPerKm);
    await repo.saveRun({
      run: {
        sourceFileHash: `demo-run-${date}`,
        startTimeUtc: atUtc(date, 6),
        startTimeLocal: `${date}T08:00:00`,
        sport: 'running',
        totalDistanceM: Math.round(km * 1000),
        totalDurationS: durationS,
        avgHrBpm: 146 + (i % 5),
        maxHrBpm: 168 + (i % 4),
        avgEnhancedSpeedMps: (km * 1000) / durationS,
        avgCadence: 84 + (i % 3),
        avgPowerW: null,
        startLatDeg: null,
        startLonDeg: null,
        elevationGainM: 20 + (i % 6) * 9,
        temperatureSource: 'none',
        correctedTemperatureC: null,
        shoeId: shoe.id,
      },
      samples: [],
      laps: [],
    });
  }

  // Wellness: the last 28 days, today included.
  await repo.upsertRecoveryDays(
    Array.from({ length: 28 }, (_, k) => ({
      date: addDaysIso(today, -k),
      sleepScore: 72 + ((k * 7) % 17),
      hrvOvernightMs: 48 + ((k * 5) % 13),
      restingHrBpm: 55 + ((k * 3) % 6),
      bodyBattery: 60 + ((k * 11) % 35),
      source: 'manual' as const,
    })),
  );

  // Weekly weigh-ins after the LEANNESS anchor, trending down.
  for (let w = 10; w >= 0; w--) {
    const date = addDaysIso(today, -w * 7);
    if (date < LEANNESS_FRESH_START) continue;
    await repo.saveWeightPoint({ date, weightKg: Math.round((80.5 - (10 - w) * 0.35) * 10) / 10, bodyFatPct: Math.round((21 - (10 - w) * 0.3) * 10) / 10, source: 'manual', notes: null });
  }

  // Strength: push / pull / legs, every third day for 8 weeks, loads creeping up. Totals in kg (post-switch convention).
  const days = [
    { notes: 'Push', lifts: [['Bench Press (Barbell)', 60, 8], ['Incline Dumbbell Press', 28, 10], ['Triceps Pushdown', 25, 12]] },
    { notes: 'Pull', lifts: [['Lat Pulldown', 55, 10], ['Seated Cable Row', 50, 10], ['Plank', 0, 0]] },
    { notes: 'Legs', lifts: [['Squat (Barbell)', 80, 6], ['Sumo Deadlift (Barbell)', 100, 5], ['Leg Press', 140, 10]] },
  ] as const;
  for (let s = 0; s < 19; s++) {
    const date = addDaysIso(today, -(3 * (18 - s) + 1));
    if (date < STRENGTH_FRESH_START || date > today) continue;
    const day = days[s % 3]!;
    const bump = Math.floor(s / 3) * 2.5;
    await logStrengthSession(repo, clock, {
      date,
      notes: day.notes,
      exercises: day.lifts.map(([name, kg, reps]) =>
        name === 'Plank' ? { name, sets: [{ seconds: 45 }, { seconds: 50 }, { seconds: 55 }] } : { name, sets: [0, 1, 2].map(() => ({ reps, weightKg: kg + bump })) },
      ),
    });
  }
}

async function seedSchool(repo: Repository, clock: Clock): Promise<void> {
  const today = clock.today();
  const d = (n: number) => addDaysIso(today, n);
  const exam = (course: string, examDate: string, credits: number, rest: Partial<ExamInput>): ExamInput => ({
    course, examDate, status: 'graded', grade: null, resitDate: null, resitGrade: null, credits, deliberated: false, notes: null, ...rest,
  });
  const exams: ExamInput[] = [
    exam('Calculus I', d(-60), 6, { grade: 14 }),
    exam('Databases', d(-58), 5, { grade: 12 }),
    exam('Linear Algebra', d(-55), 6, { grade: 8, resitDate: d(-20), resitGrade: 11 }), // failed, passed the resit
    exam('Statistics', d(-52), 4, { grade: 9, deliberated: true, notes: 'Passed by deliberation.' }), // sub-10, board tolerated
    exam('Operating Systems', d(-50), 5, { grade: 7 }), // failed, resit not sat yet -> needsResit
    exam('Networks', d(-3), 4, { status: 'pending' }),
    exam('Software Design', d(18), 5, { status: 'scheduled' }),
    exam('Ethics in Tech', d(25), 3, { status: 'scheduled' }),
  ];
  for (const e of exams) await repo.addExam(e);

  const task = (title: string, kind: SchoolTaskInput['kind'], deadline: string, course: string | null, done: boolean): SchoolTaskInput => ({
    title, kind, deadline, course, notes: null, done, doneDate: done ? addDaysIso(deadline, -1) : null,
  });
  const tasks: SchoolTaskInput[] = [
    task('Database design report', 'task', d(-9), 'Databases', true),
    task('Company visit: local logistics firm', 'company_visit', d(-4), null, true),
    task('Network lab write-up', 'task', d(-2), 'Networks', false), // overdue
    task('Software design prototype', 'task', d(6), 'Software Design', false),
    task('Ethics essay draft', 'task', d(12), 'Ethics in Tech', false),
    task('Group presentation slides', 'task', d(20), 'Software Design', false),
  ];
  for (const t of tasks) await repo.addSchoolTask(t);
}

function seriesInput(over: Partial<SeriesInput> & Pick<SeriesInput, 'canonicalTitle' | 'type'>): SeriesInput {
  return {
    author: null, altTitles: [], anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null,
    publicationStatus: 'completed', readingStatus: 'active', totalVolumesKnown: null, englishPublisher: null,
    readingDirection: null, coverUrl: null, genres: [], notes: null, sourceHash: null, ...over,
  };
}

async function seedArchives(repo: Repository, clock: Clock, table: PriceTable): Promise<void> {
  const today = clock.today();
  const d = (n: number) => addDaysIso(today, n);

  // Manga: volumes 1..n bought through the same path as POST /api/buy-volume. A `receipt` price is a real receipt
  // (estimated:false); omitted -> price-table estimate. `states[i]` is volume i+1's read state.
  const manga = [
    { title: 'Starlit Courier', author: 'A. Example', publisher: 'Example Press', total: 8, receipt: [1099, 1099, 1149, 1149], states: ['read', 'read', 'read', 'reading'] },
    { title: 'Hollow Lantern', author: 'B. Sample', publisher: 'Sample House', total: 5, receipt: [], states: ['read', 'read', 'unread', 'unread', 'unread'] },
    { title: 'Paper Moon Tactics', author: 'C. Placeholder', publisher: 'Demo Books', total: 12, receipt: [1699, 1699], states: ['reading', 'unread'] },
  ] as const;
  for (const [si, m] of manga.entries()) {
    const series = await repo.addSeries(seriesInput({ canonicalTitle: m.title, type: 'manga', author: m.author, englishPublisher: m.publisher, totalVolumesKnown: m.total, publicationStatus: m.total > 8 ? 'ongoing' : 'completed', readingDirection: 'rtl', genres: ['Adventure'] }));
    for (const [i, state] of m.states.entries()) {
      const date = d(-(150 - si * 30 - i * 12));
      const bought = await recordVolumeBought(repo, { seriesId: series.id, volumeNumber: i + 1, date, priceCents: m.receipt[i] ?? null, table });
      if (!bought.ok) throw new Error(`demo seed: could not buy ${m.title} #${i + 1} (${bought.reason})`);
      await repo.updateCopy(bought.copyId, readPatch(state, addDaysIso(date, 6)));
    }
  }

  // Books: Series(type:'book') + one Volume(volumeNumber:null) + one Copy, with the Purchase linked both ways.
  const books = [
    { title: 'Frankenstein', author: 'Mary Shelley', cents: 899, estimated: false, state: 'read', rating: 4 },
    { title: 'Dracula', author: 'Bram Stoker', cents: 1099, estimated: false, state: 'reading', rating: null },
    { title: 'Pride and Prejudice', author: 'Jane Austen', cents: 999, estimated: true, state: 'unread', rating: null },
    { title: 'The Time Machine', author: 'H. G. Wells', cents: 799, estimated: true, state: 'read', rating: 5 },
  ] as const;
  for (const [i, b] of books.entries()) {
    const date = d(-(120 - i * 25));
    const series = await repo.addSeries(seriesInput({ canonicalTitle: b.title, type: 'book', author: b.author, totalVolumesKnown: 1, genres: ['Classic'] }));
    const volume = await repo.addVolume({ seriesId: series.id, volumeNumber: null, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
    const purchase = await repo.addPurchase({ date, source: b.estimated ? 'price_table' : 'manual', totalPrice: b.cents, currency: 'EUR', type: 'single', estimated: b.estimated, notes: null });
    await repo.addPurchaseItems([{ purchaseId: purchase.id, volumeId: volume.id, allocatedPrice: b.cents }]);
    const copy = await repo.addCopy({ volumeId: volume.id, owned: true, acquiredDate: date, condition: null, readStatus: 'unread', readDate: null, rating: null, notes: null, purchaseId: purchase.id });
    await repo.updateCopy(copy.id, { ...readPatch(b.state, addDaysIso(date, 14)), rating: b.rating });
  }
}

const readPatch = (state: string, readDate: string): CopyPatch =>
  state === 'read' ? { readStatus: 'read', readDate } : { readStatus: state === 'reading' ? 'reading' : 'unread', readDate: null };

/** Fill an empty, migrated DB with the full demo dataset and recompute the stat tracks. `clock.today()` anchors every date. */
export async function seedDemo(repo: Repository, clock: Clock, table: PriceTable): Promise<void> {
  await seedTraining(repo, clock);
  await seedSchool(repo, clock);
  await seedArchives(repo, clock, table);
  await recomputeStats(repo, clock);
}
