import { describe, expect, it } from 'vitest';
import { correctStrengthSet } from '../../src/conventions/conventions-engine.ts';
import { reconcileShoeMileage } from '../../src/conventions/shoe-mileage.ts';

const CONFIG = { conventionStart: '2022-01-01', switchDate: '2026-03-28' };

describe('correctStrengthSet — comeback sanity (kg)', () => {
  it('bench logged 60kg barbell -> real 80kg, single load audit', () => {
    const r = correctStrengthSet(
      { exerciseTitleRaw: 'Bench Press (Barbell)', rawWeight: 60, rawWeightUnit: 'kg', sessionDateIso: '2026-03-15' },
      CONFIG,
    );
    expect(r.realLoadKg).toBe(80);
    expect(r.equipment).toBe('barbell');
    expect(r.weightKgNormalized).toBe(60);
    expect(r.audits).toHaveLength(1); // kg => no unit audit
    expect(r.audits[0]?.conversionType).toBe('barbell_plus20');
  });

  it('DB incline logged 20kg -> real 40kg', () => {
    const r = correctStrengthSet(
      { exerciseTitleRaw: 'Incline Bench Press (Dumbbell)', rawWeight: 20, rawWeightUnit: 'kg', sessionDateIso: '2026-03-15' },
      CONFIG,
    );
    expect(r.realLoadKg).toBe(40);
  });
});

describe('correctStrengthSet — unit ordering (lbs runs BEFORE the +20)', () => {
  it('converts lbs->kg first, then applies the bar', () => {
    // 132.2773573 lbs ≈ 60.0 kg, then +20 => ~80 kg
    const r = correctStrengthSet(
      { exerciseTitleRaw: 'Bench Press (Barbell)', rawWeight: 132.2773573, rawWeightUnit: 'lbs', sessionDateIso: '2026-03-15' },
      CONFIG,
    );
    expect(r.weightKgNormalized).toBeCloseTo(60, 2);
    expect(r.realLoadKg).toBeCloseTo(80, 2);
    // Audit order proves the sequence: unit conversion, THEN load convention.
    expect(r.audits.map((a) => a.conversionType)).toEqual(['unit_lbs_to_kg', 'barbell_plus20']);
  });
});

describe('correctStrengthSet — boundaries & graceful cases', () => {
  it('excludes pre-2022', () => {
    const r = correctStrengthSet(
      { exerciseTitleRaw: 'Bench Press (Barbell)', rawWeight: 100, rawWeightUnit: 'kg', sessionDateIso: '2021-12-31' },
      CONFIG,
    );
    expect(r.realLoadKg).toBeNull();
    expect(r.excludedFromTrend).toBe(true);
  });

  it('treats post-switch as total weight (no +20)', () => {
    const r = correctStrengthSet(
      { exerciseTitleRaw: 'Bench Press (Barbell)', rawWeight: 80, rawWeightUnit: 'kg', sessionDateIso: '2026-05-01' },
      CONFIG,
    );
    expect(r.realLoadKg).toBe(80);
    expect(r.loggingConvention).toBe('total_weight');
  });

  it('handles a bodyweight set with no weight', () => {
    const r = correctStrengthSet(
      { exerciseTitleRaw: 'Pull Up (Bodyweight)', rawWeight: null, rawWeightUnit: 'kg', sessionDateIso: '2026-03-15' },
      CONFIG,
    );
    expect(r.realLoadKg).toBeNull();
    expect(r.weightKgNormalized).toBeNull();
    expect(r.audits).toHaveLength(0);
  });
});

describe('reconcileShoeMileage — baseline at reset + runs since', () => {
  it('adds post-reset runs on top of the baseline', () => {
    const r = reconcileShoeMileage({ priorCountedKm: 100, fitRunsKm: 63.2 });
    expect(r.authoritativeKm).toBe(163.2);
    expect(r.baselineKm).toBe(100);
    expect(r.sinceResetKm).toBe(63.2);
    expect(r.note).toContain('100 km before the 22 Jun 2026 reset + 63.2 km logged since = 163.2 km');
    expect(r.audits[0]?.conversionType).toBe('shoe_dedupe');
  });
});
