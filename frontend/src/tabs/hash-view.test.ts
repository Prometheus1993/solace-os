import { describe, expect, it } from 'vitest';
import { viewFromHash } from './hash-view.ts';

const VIEWS = [{ id: 'school-term' }, { id: 'exam-term' }] as const;

describe('viewFromHash', () => {
  it('reads the current English view ids', () => {
    expect(viewFromHash('#school/exam-term', VIEWS, 'school-term')).toBe('exam-term');
    expect(viewFromHash('#school/school-term', VIEWS, 'exam-term')).toBe('school-term');
  });

  it('maps the old Dutch view ids to the new ones', () => {
    expect(viewFromHash('#school/examenperiode', VIEWS, 'school-term')).toBe('exam-term');
    expect(viewFromHash('#school/schoolperiode', VIEWS, 'exam-term')).toBe('school-term');
  });

  it('falls back to the default for a missing or unknown view', () => {
    expect(viewFromHash('#school', VIEWS, 'school-term')).toBe('school-term');
    expect(viewFromHash('#school/missions', VIEWS, 'school-term')).toBe('school-term');
  });
});
