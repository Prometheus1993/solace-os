import type { Exam } from './types.ts';
import { round2 } from './math.ts';

/**
 * Pass/fail for an exam is DERIVED from the grade, never stored. The Belgian pass
 * mark is 10/20. One record holds both attempts (first + resit), so the "result"
 * is the better of the two. These pure helpers are the SINGLE source of the ≥10
 * rule — the DTO and UI call them, never re-hardcode the threshold.
 */

/** Belgian university pass mark, out of 20. */
export const PASS_MARK = 10;

type GradedExam = Pick<Exam, 'grade' | 'resitGrade'>;
type DeliberatedExam = Pick<Exam, 'grade' | 'resitGrade' | 'deliberated'>;

/** The better of the first and resit grades (ignoring nulls), or null if ungraded. */
export function examBestGrade(e: GradedExam): number | null {
  const grades = [e.grade, e.resitGrade].filter((g): g is number => g != null);
  return grades.length > 0 ? Math.max(...grades) : null;
}

/**
 * Passed = best grade is in and ≥ 10, OR the academic board deliberated (tolerated) a lower grade —
 * a Belgian "deliberated" pass. `deliberated` never manufactures a pass without a grade (an
 * ungraded/scheduled exam stays not-passed).
 */
export function examPassed(e: DeliberatedExam): boolean {
  const best = examBestGrade(e);
  if (e.deliberated) return best != null;
  return best != null && best >= PASS_MARK;
}

/**
 * Needs a resit = the first attempt failed (<10) and it hasn't been passed on a resit
 * yet, and it was NOT deliberated (a tolerated fail is a pass — it never needs a resit). This drives
 * the resit section + countdown.
 */
export function examNeedsResit(e: DeliberatedExam): boolean {
  if (e.deliberated) return false;
  return e.grade != null && e.grade < PASS_MARK && (e.resitGrade == null || e.resitGrade < PASS_MARK);
}

/**
 * Flemish grade-of-merit band — the credit-weighted average of the grades
 * of the PASSED courses, on /20. Thresholds here are 50/65/75/85% → /20 10/13/15/17. Other
 * institutions differ (e.g. 13.5/15/16.5); keep the bands here so they're trivial to adjust.
 */
export interface DistinctionBand {
  key: 'pass' | 'distinction' | 'great_distinction' | 'greatest_distinction';
  label: string;
  /** Minimum credit-weighted average (out of 20) to reach this band. */
  min: number;
}
export const DISTINCTION_BANDS: readonly DistinctionBand[] = [
  { key: 'greatest_distinction', label: 'Greatest Distinction', min: 17 }, // ≥85%
  { key: 'great_distinction', label: 'Great Distinction', min: 15 }, // ≥75%
  { key: 'distinction', label: 'Distinction', min: 13 }, // ≥65%
  { key: 'pass', label: 'Pass', min: 10 }, // ≥50%
];

export interface YearAverage {
  /** Credit-weighted average of the passed courses, /20, rounded to 2 dp. */
  average: number;
  /** Σ credits of the passed courses counted. */
  creditsCounted: number;
  passedCount: number;
  band: { key: DistinctionBand['key']; label: string };
  /** The next distinction up + points still needed, or null at the top tier. */
  toNext: { key: DistinctionBand['key']; label: string; min: number; gap: number } | null;
}

/**
 * Credit-weighted average over the PASSED exams (best of both attempts), mapped to the
 * distinction band (Belgian 20-point scale). Weight = `credits ?? 1`. Returns null when nothing has passed yet. A deliberated
 * exam counts too — WITH ITS REAL (sub-10) GRADE, never inflated to the pass mark — so e.g. a
 * tolerated 9 genuinely lowers the average, matching how a grade-of-merit average is normally computed.
 */
export function examYearAverage(exams: ReadonlyArray<Exam>): YearAverage | null {
  const passed = exams.filter(examPassed);
  if (passed.length === 0) return null;
  let weightedSum = 0;
  let credits = 0;
  for (const e of passed) {
    const w = e.credits && e.credits > 0 ? e.credits : 1; // a 0/null-credit pass still counts (weight 1) — never divide by 0
    weightedSum += examBestGrade(e)! * w; // passed → best grade is non-null
    credits += w;
  }
  const average = round2(weightedSum / credits);
  // Bands are high→low, so the first whose `min ≤ average` is the awarded band.
  const idx = DISTINCTION_BANDS.findIndex((b) => average >= b.min);
  const band = DISTINCTION_BANDS[idx === -1 ? DISTINCTION_BANDS.length - 1 : idx]!;
  const next = idx > 0 ? DISTINCTION_BANDS[idx - 1]! : null;
  return {
    average,
    creditsCounted: credits,
    passedCount: passed.length,
    band: { key: band.key, label: band.label },
    toNext: next ? { key: next.key, label: next.label, min: next.min, gap: round2(next.min - average) } : null,
  };
}
