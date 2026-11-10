import { describe, expect, it } from 'vitest';
import { type Exam, examBestGrade, examNeedsResit, examPassed, examYearAverage } from '../../src/index.ts';

const e = (over: Partial<Exam>): Exam => ({ id: 0, course: 'C', examDate: '2026-01-09', status: 'graded', grade: null, resitDate: null, resitGrade: null, credits: null, deliberated: false, notes: null, createdAt: 0, ...over });

describe('exam derived helpers (≥10 pass mark, one record holds both attempts)', () => {
  it('a failed first attempt needs a resit and is not passed', () => {
    const x = e({ grade: 8 });
    expect(examBestGrade(x)).toBe(8);
    expect(examPassed(x)).toBe(false);
    expect(examNeedsResit(x)).toBe(true);
  });

  it('a passing resit makes it passed (best grade) and no longer needs a resit', () => {
    const x = e({ grade: 8, resitGrade: 12 });
    expect(examBestGrade(x)).toBe(12); // better of 8 and 12
    expect(examPassed(x)).toBe(true);
    expect(examNeedsResit(x)).toBe(false);
  });

  it('a failed resit still needs a resit', () => {
    const x = e({ grade: 8, resitGrade: 9 });
    expect(examNeedsResit(x)).toBe(true);
    expect(examPassed(x)).toBe(false);
  });

  it('a passing first attempt is passed and never a resit', () => {
    const x = e({ grade: 13 });
    expect(examPassed(x)).toBe(true);
    expect(examNeedsResit(x)).toBe(false);
  });

  it('exactly 10 passes (the Belgian pass mark)', () => {
    expect(examPassed(e({ grade: 10 }))).toBe(true);
    expect(examNeedsResit(e({ grade: 10 }))).toBe(false);
  });

  it('ungraded (scheduled/pending) → not passed, not a resit, null grade', () => {
    const x = e({ status: 'scheduled', grade: null });
    expect(examBestGrade(x)).toBeNull();
    expect(examPassed(x)).toBe(false);
    expect(examNeedsResit(x)).toBe(false);
  });
});

describe('deliberated (tolerated) — a tolerated fail counts as passed, keeps its grade', () => {
  it('a deliberated <10 grade is passed and needs no resit, but keeps the real grade', () => {
    const x = e({ grade: 9, deliberated: true });
    expect(examBestGrade(x)).toBe(9); // the real grade is never rewritten to the pass mark
    expect(examPassed(x)).toBe(true);
    expect(examNeedsResit(x)).toBe(false);
  });

  it('deliberated + ungraded never manufactures a pass out of nothing', () => {
    const x = e({ status: 'scheduled', grade: null, deliberated: true });
    expect(examPassed(x)).toBe(false);
  });

  it('deliberated is a NO-OP on an already-passing grade', () => {
    const x = e({ grade: 14, deliberated: true });
    expect(examPassed(x)).toBe(true);
    expect(examNeedsResit(x)).toBe(false);
  });
});

describe('examYearAverage — grade-of-merit average (credit-weighted over passed)', () => {
  it('the 4 passed (13,14,13,11 @3sp) → 12.75 Pass, 0.25 to Distinction', () => {
    const ya = examYearAverage([e({ grade: 13, credits: 3 }), e({ grade: 14, credits: 3 }), e({ grade: 13, credits: 3 }), e({ grade: 11, credits: 3 })])!;
    expect(ya.average).toBe(12.75);
    expect(ya.passedCount).toBe(4);
    expect(ya.creditsCounted).toBe(12);
    expect(ya.band.key).toBe('pass');
    expect(ya.toNext).toEqual({ key: 'distinction', label: 'Distinction', min: 13, gap: 0.25 });
  });

  it('bands: ≥13 Distinction, ≥15 Great, ≥17 Greatest (top → toNext null)', () => {
    expect(examYearAverage([e({ grade: 13 })])!.band.key).toBe('distinction');
    expect(examYearAverage([e({ grade: 15 })])!.band.key).toBe('great_distinction');
    const top = examYearAverage([e({ grade: 18 })])!;
    expect(top.band.key).toBe('greatest_distinction');
    expect(top.toNext).toBeNull();
  });

  it('credit-weighted: a 6-sp 16 + a 3-sp 10 → 14.0 (Distinction), not the simple mean 13', () => {
    const ya = examYearAverage([e({ grade: 16, credits: 6 }), e({ grade: 10, credits: 3 })])!;
    expect(ya.average).toBe(14);
    expect(ya.band.key).toBe('distinction');
  });

  it('excludes failed/pending; a passed resit counts with its best grade; no passed → null', () => {
    expect(examYearAverage([e({ grade: 8 }), e({ status: 'pending', grade: null })])).toBeNull();
    const ya = examYearAverage([e({ grade: 8, resitGrade: 14, credits: 3 })])!;
    expect(ya.average).toBe(14);
    expect(ya.passedCount).toBe(1);
  });

  it('a 0-credit (or null-credit) passed exam counts at weight 1 — never NaN (no 0/0)', () => {
    const ya = examYearAverage([e({ grade: 14, credits: 0 }), e({ grade: 16, credits: 0 })])!;
    expect(Number.isFinite(ya.average)).toBe(true);
    expect(ya.average).toBe(15); // (14 + 16) / 2, each weight 1
  });

  it('a deliberated 9 counts as PASSED but WITH ITS REAL GRADE — it genuinely lowers the average', () => {
    // Data: deliberated 9 @6sp, Webframeworks: deliberated 8 @6sp, Data II: a real pass 16 @6sp.
    // Weighted mean = (9*6 + 8*6 + 16*6) / 18 = 33*6/18 = 11 — pulled well below the real-pass-only 16.
    const ya = examYearAverage([
      e({ course: 'Data', grade: 9, credits: 6, deliberated: true }),
      e({ course: 'Webframeworks', grade: 8, credits: 6, deliberated: true }),
      e({ course: 'Data II', grade: 16, credits: 6 }),
    ])!;
    expect(ya.passedCount).toBe(3); // both deliberated courses count as passed
    expect(ya.creditsCounted).toBe(18);
    expect(ya.average).toBe(11); // the sub-10 grades are NOT rewritten to 10 — they drag the mean down
  });
});
