import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildDashboard, type Copy, type DashboardInput, type Exam, type SchoolTask, type Series, type Volume } from '../../src/index.ts';

const baseInput = (over: Partial<DashboardInput>): DashboardInput => ({
  asOf: '2026-06-21',
  config: DEFAULT_CONFIG,
  runs: [],
  recoveryDays: [],
  weightPoints: [],
  scoredStrengthSets: [],
  shoe: null,
  statHistory: [],
  series: [],
  volumes: [],
  copies: [],
  purchases: [],
  purchaseItems: [],
  exams: [],
  schoolTasks: [],
  ...over,
});

const exam = (over: Partial<Exam>): Exam => ({ id: 0, course: 'C', examDate: '2026-07-01', status: 'scheduled', grade: null, resitDate: null, resitGrade: null, credits: null, deliberated: false, notes: null, createdAt: 0, ...over });
/** A plain book: one Series(type=book) + one Volume(volumeNumber:null) + one Copy at the given readStatus. */
function bookFixture(id: number, readStatus: Copy['readStatus']): { series: Series[]; volumes: Volume[]; copies: Copy[] } {
  const series: Series = { id, canonicalTitle: 'B', author: null, altTitles: [], type: 'book', anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed', readingStatus: 'active', totalVolumesKnown: 1, englishPublisher: null, readingDirection: null, coverUrl: null, genres: [], notes: null, sourceHash: null, createdAt: 0 };
  const volume: Volume = { id, seriesId: id, volumeNumber: null, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single', createdAt: 0 };
  const copy: Copy = { id, volumeId: id, owned: true, acquiredDate: null, condition: null, readStatus, readDate: null, rating: null, notes: null, purchaseId: null, createdAt: 0 };
  return { series: [series], volumes: [volume], copies: [copy] };
}
function flatten(...fixtures: Array<{ series: Series[]; volumes: Volume[]; copies: Copy[] }>): { series: Series[]; volumes: Volume[]; copies: Copy[] } {
  return { series: fixtures.flatMap((f) => f.series), volumes: fixtures.flatMap((f) => f.volumes), copies: fixtures.flatMap((f) => f.copies) };
}

const task = (over: Partial<SchoolTask>): SchoolTask => ({ id: 0, title: 'T', kind: 'task', deadline: '2026-07-01', course: null, notes: null, done: false, doneDate: null, createdAt: 0, ...over });

describe('schoolTasks DTO slice (deterministic over asOf)', () => {
  it('is an empty array when there are no tasks', () => {
    expect(buildDashboard(baseInput({})).schoolTasks).toEqual([]);
  });

  it('includes plain DTO fields with derived daysUntil/overdue; open by deadline asc, then done', () => {
    const dto = buildDashboard(
      baseInput({
        schoolTasks: [
          task({ id: 1, title: 'Later', deadline: '2026-07-01' }), // 10 days out
          task({ id: 2, title: 'Due today', deadline: '2026-06-21', kind: 'company_visit', course: 'Internship' }),
          task({ id: 3, title: 'Late', deadline: '2026-06-10' }), // overdue
          task({ id: 4, title: 'Finished late', deadline: '2026-06-10', done: true, doneDate: '2026-06-12' }), // done → never overdue
        ],
      }),
    );
    expect(dto.schoolTasks.map((t) => t.id)).toEqual([3, 2, 1, 4]);
    const byId = Object.fromEntries(dto.schoolTasks.map((t) => [t.id, t]));
    expect(byId[1]).toMatchObject({ daysUntil: 10, overdue: false, done: false, doneDate: null });
    expect(byId[2]).toMatchObject({ daysUntil: 0, overdue: false, kind: 'company_visit', course: 'Internship' });
    expect(byId[3]).toMatchObject({ daysUntil: -11, overdue: true });
    expect(byId[4]).toMatchObject({ daysUntil: -11, overdue: false, done: true, doneDate: '2026-06-12' });
    expect(byId[1]).not.toHaveProperty('createdAt'); // storage detail stays out of the DTO
  });
});

describe('life-sim DTO slices (deterministic over asOf)', () => {
  it('mission daysUntil/overdue computed from asOf; sorted by examDate', () => {
    const dto = buildDashboard(
      baseInput({
        exams: [
          exam({ id: 1, examDate: '2026-07-01' }), // 10 days out
          exam({ id: 2, examDate: '2026-06-21' }), // today
          exam({ id: 3, examDate: '2026-06-10', status: 'scheduled' }), // overdue
          exam({ id: 4, examDate: '2026-06-10', status: 'graded', grade: 14 }), // past but graded → not overdue
        ],
      }),
    );
    const byId = Object.fromEntries(dto.missions.map((m) => [m.id, m]));
    expect(byId[1]!.daysUntil).toBe(10);
    expect(byId[2]!.daysUntil).toBe(0);
    expect(byId[1]!.overdue).toBe(false);
    expect(byId[3]!.daysUntil).toBe(-11);
    expect(byId[3]!.overdue).toBe(true);
    expect(byId[4]!.overdue).toBe(false); // graded (not scheduled) is never overdue
    expect(byId[4]!.passed).toBe(true); // 14 ≥ 10, derived
    expect(dto.missions.map((m) => m.id)).toEqual([3, 4, 2, 1]); // examDate asc, stable
    expect(dto.lifeSimSummary.nextMissionDays).toBe(0); // soonest scheduled & not-past
    expect(dto.lifeSimSummary.missionsUpcoming).toBe(2);
  });

  it('resitWindow = min/max DATED resit + days to the first upcoming one (derived from failing grades)', () => {
    const dto = buildDashboard(
      baseInput({
        exams: [
          exam({ id: 1, examDate: '2026-01-05', status: 'graded', grade: 14 }), // passed → not a resit
          exam({ id: 2, examDate: '2026-01-06', status: 'graded', grade: 7, resitDate: '2026-09-08' }),
          exam({ id: 3, examDate: '2026-01-07', status: 'graded', grade: 8, resitDate: '2026-08-24' }),
        ],
      }),
    );
    // asOf 2026-06-21 → 2026-08-24 is 64 days out
    expect(dto.lifeSimSummary.resitWindow).toEqual({ start: '2026-08-24', end: '2026-09-08', firstDays: 64 });
    expect(dto.lifeSimSummary.resitsNeeded).toBe(2);
  });

  it('no failing grades → no resit window', () => {
    const dto = buildDashboard(baseInput({ exams: [exam({ id: 1, examDate: '2026-07-01', status: 'graded', grade: 15 })] }));
    expect(dto.lifeSimSummary.resitWindow).toBeNull();
    expect(dto.lifeSimSummary.resitsNeeded).toBe(0);
  });

  it('resitWindow.firstDays is null when every dated resit is past — never a negative countdown', () => {
    const dto = buildDashboard(
      baseInput({
        exams: [
          exam({ id: 1, examDate: '2025-12-01', status: 'graded', grade: 6, resitDate: '2026-06-10' }),
          exam({ id: 2, examDate: '2025-12-02', status: 'graded', grade: 7, resitDate: '2026-06-05' }),
        ],
      }),
    );
    expect(dto.lifeSimSummary.resitWindow).toEqual({ start: '2026-06-05', end: '2026-06-10', firstDays: null });
  });

  it('a passed resit clears needsResit and counts as passed (finalGrade = best of both attempts)', () => {
    const dto = buildDashboard(
      baseInput({ exams: [exam({ id: 1, examDate: '2026-01-09', status: 'graded', grade: 8, resitDate: '2026-08-24', resitGrade: 12 })] }),
    );
    const m = dto.missions.find((x) => x.id === 1)!;
    expect(m.needsResit).toBe(false);
    expect(m.passed).toBe(true);
    expect(m.finalGrade).toBe(12); // best of 8 and 12
    expect(dto.lifeSimSummary.resitsNeeded).toBe(0);
    expect(dto.lifeSimSummary.resitWindow).toBeNull();
  });

  it('book summary counts; no exams → null next mission', () => {
    const { series, volumes, copies } = flatten(bookFixture(1, 'reading'), bookFixture(2, 'read'));
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    expect(dto.lifeSimSummary.booksReading).toBe(1);
    expect(dto.lifeSimSummary.booksFinished).toBe(1);
    expect(dto.lifeSimSummary.nextMissionDays).toBeNull(); // no exams
  });

  it('a deliberated exam is passed:true, needsResit:false, keeps its real grade, and leaves the resit list', () => {
    const dto = buildDashboard(
      baseInput({ exams: [exam({ id: 1, examDate: '2026-01-09', status: 'graded', grade: 9, deliberated: true })] }),
    );
    const m = dto.missions.find((x) => x.id === 1)!;
    expect(m.deliberated).toBe(true);
    expect(m.passed).toBe(true);
    expect(m.needsResit).toBe(false);
    expect(m.finalGrade).toBe(9); // kept, not rewritten to the pass mark
    expect(dto.lifeSimSummary.resitsNeeded).toBe(0); // derives from needsResit → drops out
    expect(dto.lifeSimSummary.resitWindow).toBeNull();
  });

  it('yearAverage: credit-weighted over passed exams + distinction band (null when none passed)', () => {
    const dto = buildDashboard(
      baseInput({
        exams: [
          exam({ id: 1, status: 'graded', grade: 13, credits: 3 }),
          exam({ id: 2, status: 'graded', grade: 14, credits: 3 }),
          exam({ id: 3, status: 'graded', grade: 8, credits: 3 }), // failed → excluded
        ],
      }),
    );
    const ya = dto.lifeSimSummary.yearAverage!;
    expect(ya.average).toBe(13.5); // (13 + 14) / 2
    expect(ya.band.key).toBe('distinction');
    expect(ya.passedCount).toBe(2);
    expect(buildDashboard(baseInput({ exams: [exam({ id: 1, status: 'scheduled' })] })).lifeSimSummary.yearAverage).toBeNull();
  });
});
