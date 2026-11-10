import { describe, expect, it } from 'vitest';
import { classifyEquipmentFromName } from '../../src/conventions/strength-load.ts';

describe('classifyEquipmentFromName (no parentheses)', () => {
  it('infers the key lifts correctly', () => {
    expect(classifyEquipmentFromName('Bench Press')).toBe('barbell');
    expect(classifyEquipmentFromName('Back Squat')).toBe('barbell');
    expect(classifyEquipmentFromName('Deadlift')).toBe('barbell');
    expect(classifyEquipmentFromName('Military Press')).toBe('barbell');
  });

  it('detects dumbbells (Db) before falling through to barbell', () => {
    expect(classifyEquipmentFromName('Incline Db Bench Press')).toBe('dumbbell');
    expect(classifyEquipmentFromName('Single Arm Db Press')).toBe('dumbbell');
  });

  it('detects cable and machine', () => {
    expect(classifyEquipmentFromName('Cable Lateral Raise')).toBe('cable');
    expect(classifyEquipmentFromName('Lat Pulldown')).toBe('machine');
    expect(classifyEquipmentFromName('Machine Fly')).toBe('machine');
    expect(classifyEquipmentFromName('Ab Machine')).toBe('machine');
  });

  it('is conservative: bodyweight, kettlebell, EZ-bar and unknowns stay "other" (as-is)', () => {
    expect(classifyEquipmentFromName('Pull-Up')).toBe('other');
    expect(classifyEquipmentFromName('Single Leg Kb Deadlift')).toBe('other'); // kettlebell, not +20
    expect(classifyEquipmentFromName('Ez Bar Curl')).toBe('other');
    expect(classifyEquipmentFromName('Bicep Curl')).toBe('other');
    expect(classifyEquipmentFromName('Hammer Curls')).toBe('other');
  });
});
