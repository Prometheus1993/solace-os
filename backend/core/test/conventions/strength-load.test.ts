import { describe, expect, it } from 'vitest';
import {
  applyLoadConvention,
  classifyEquipment,
  determineSessionConvention,
} from '../../src/conventions/strength-load.ts';

const CONFIG = { conventionStart: '2022-01-01', switchDate: '2026-03-28' };

describe('classifyEquipment', () => {
  it('reads equipment from the trailing parentheses', () => {
    expect(classifyEquipment('Bench Press (Barbell)')).toEqual({ exerciseName: 'Bench Press', equipment: 'barbell' });
    expect(classifyEquipment('Incline Bench Press (Dumbbell)')).toEqual({
      exerciseName: 'Incline Bench Press',
      equipment: 'dumbbell',
    });
    expect(classifyEquipment('Lat Pulldown (Cable)')).toEqual({ exerciseName: 'Lat Pulldown', equipment: 'cable' });
    expect(classifyEquipment('Seated Row (Machine)')).toEqual({ exerciseName: 'Seated Row', equipment: 'machine' });
  });

  it('treats bodyweight / unknown tags and no-parens titles as "other"', () => {
    expect(classifyEquipment('Pull Up (Weighted)').equipment).toBe('other');
    expect(classifyEquipment('Plank')).toEqual({ exerciseName: 'Plank', equipment: 'other' });
  });
});

describe('determineSessionConvention', () => {
  it('excludes pre-2022 sessions', () => {
    expect(determineSessionConvention('2021-12-31', CONFIG).pre2022).toBe(true);
    expect(determineSessionConvention('2022-01-01', CONFIG).pre2022).toBe(false);
  });

  it('switches to total-weight only AFTER the switch date', () => {
    expect(determineSessionConvention('2026-03-28', CONFIG).isAfterSwitch).toBe(false);
    expect(determineSessionConvention('2026-03-28', CONFIG).loggingConvention).toBe('one_dumbbell_plus_bar');
    expect(determineSessionConvention('2026-03-29', CONFIG).isAfterSwitch).toBe(true);
    expect(determineSessionConvention('2026-04-05', CONFIG).loggingConvention).toBe('total_weight');
  });
});

describe('applyLoadConvention (in-convention era)', () => {
  const inEra = '2026-03-01';

  it('adds the 20kg bar for barbell (bench 60 -> 80)', () => {
    const r = applyLoadConvention({ weightKg: 60, equipment: 'barbell', sessionDateIso: inEra, ...CONFIG });
    expect(r.realLoadKg).toBe(80);
    expect(r.audits[0]?.conversionType).toBe('barbell_plus20');
    expect(r.comparable).toBe(true);
  });

  it('doubles dumbbells (DB incline 20 -> 40)', () => {
    const r = applyLoadConvention({ weightKg: 20, equipment: 'dumbbell', sessionDateIso: inEra, ...CONFIG });
    expect(r.realLoadKg).toBe(40);
    expect(r.audits[0]?.conversionType).toBe('dumbbell_x2');
  });

  it('leaves machine/cable as-is (lat pulldown 60 -> 60)', () => {
    expect(applyLoadConvention({ weightKg: 60, equipment: 'machine', sessionDateIso: inEra, ...CONFIG }).realLoadKg).toBe(60);
    expect(applyLoadConvention({ weightKg: 45, equipment: 'cable', sessionDateIso: inEra, ...CONFIG }).realLoadKg).toBe(45);
  });
});

describe('applyLoadConvention (boundaries)', () => {
  it('excludes pre-2022 (no real load, flagged)', () => {
    const r = applyLoadConvention({ weightKg: 100, equipment: 'barbell', sessionDateIso: '2021-06-01', ...CONFIG });
    expect(r.realLoadKg).toBeNull();
    expect(r.excludedFromTrend).toBe(true);
    expect(r.comparable).toBe(false);
    expect(r.audits[0]?.conversionType).toBe('pre2022_excluded');
  });

  it('passes through post-switch total weight with NO +20 (no phantom jump)', () => {
    const r = applyLoadConvention({ weightKg: 80, equipment: 'barbell', sessionDateIso: '2026-05-01', ...CONFIG });
    expect(r.realLoadKg).toBe(80); // not 100
    expect(r.loggingConvention).toBe('total_weight');
    expect(r.audits[0]?.conversionType).toBe('total_weight_passthrough');
  });
});
