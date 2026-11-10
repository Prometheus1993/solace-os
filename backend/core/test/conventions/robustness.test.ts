import { describe, expect, it } from 'vitest';
import { correctStrengthSet } from '../../src/conventions/conventions-engine.ts';
import { heatHrOffset } from '../../src/conventions/heat.ts';
import { classifyEquipment, determineSessionConvention } from '../../src/conventions/strength-load.ts';

const CONFIG = { conventionStart: '2022-01-01', switchDate: '2026-03-28' };

describe('classifyEquipment robustness', () => {
  it('reads the LAST parenthetical even when the name contains parens', () => {
    expect(classifyEquipment('Exercise (Detail) (Barbell)')).toEqual({
      exerciseName: 'Exercise (Detail)',
      equipment: 'barbell',
    });
  });

  it('tolerates trailing whitespace', () => {
    expect(classifyEquipment('Bench Press (Barbell)   ').equipment).toBe('barbell');
  });

  it('falls back to the raw title when there is no name before the tag', () => {
    expect(classifyEquipment('(Barbell)').exerciseName).toBe('(Barbell)');
  });
});

describe('date validation (fail loud, never silently mis-classify)', () => {
  it('rejects single-digit month/day', () => {
    expect(() => determineSessionConvention('2026-4-4', CONFIG)).toThrow(/Invalid ISO date/);
  });

  it('rejects empty / garbage dates', () => {
    expect(() => determineSessionConvention('', CONFIG)).toThrow(/Invalid ISO date/);
    expect(() => determineSessionConvention('not-a-date', CONFIG)).toThrow(/Invalid ISO date/);
  });

  it('accepts a full ISO datetime (uses the date part)', () => {
    expect(determineSessionConvention('2026-05-01T14:30:00Z', CONFIG).isAfterSwitch).toBe(true);
  });
});

describe('heatHrOffset guards', () => {
  it('returns 0 for non-finite temperatures', () => {
    expect(heatHrOffset(Number.NaN)).toBe(0);
    expect(heatHrOffset(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('negative weight', () => {
  it('is ignored (no real load) rather than corrupting trends', () => {
    const r = correctStrengthSet(
      { exerciseTitleRaw: 'Bench Press (Barbell)', rawWeight: -5, rawWeightUnit: 'kg', sessionDateIso: '2026-03-15' },
      CONFIG,
    );
    expect(r.realLoadKg).toBeNull();
    expect(r.correctionApplied).toMatch(/negative/);
  });
});
