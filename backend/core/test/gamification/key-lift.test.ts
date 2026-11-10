import { describe, expect, it } from 'vitest';
import { classifyEquipmentFromName } from '../../src/conventions/strength-load.ts';
import { keyLiftOf } from '../../src/gamification/stats.ts';

const lift = (exerciseName: string) => keyLiftOf({ exerciseName, equipment: classifyEquipmentFromName(exerciseName) });

describe('keyLiftOf', () => {
  it('maps the three scored key lifts', () => {
    expect(lift('Bench Press')).toBe('bench');
    expect(lift('Squat')).toBe('squat');
    expect(lift('Back Squat')).toBe('squat');
    expect(lift('Barbell Squat')).toBe('squat');
    expect(lift('Front Squat')).toBe('squat');
    expect(lift('Sumo Deadlift')).toBe('sumoDeadlift');
    expect(keyLiftOf({ exerciseName: 'Sumo Deadlift', equipment: 'other' })).toBe('sumoDeadlift');
  });

  it('treats a barbell incline bench as volume only', () => {
    expect(lift('Incline Bench Press')).toBeNull();
  });

  it('excludes squat variants that are not a plain squat', () => {
    for (const n of ['Smith Machine Squat', 'Hack Squat', 'Goblet Squat', 'Split Squat', 'Bulgarian Split Squat', 'Leg Press Squat', 'Db Squat']) {
      expect(lift(n), n).toBeNull();
    }
  });

  it('only the sumo deadlift counts; every other deadlift is volume only', () => {
    for (const n of ['Deadlift', 'Romanian Deadlift', 'Trap Bar Deadlift', 'Stiff Leg Deadlift']) {
      expect(lift(n), n).toBeNull();
    }
  });

  it('no longer scores DB incline or lat pulldown', () => {
    expect(lift('Incline Db Bench Press')).toBeNull();
    expect(lift('Lat Pulldown')).toBeNull();
  });
});
