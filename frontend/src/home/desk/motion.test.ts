import { describe, expect, it } from 'vitest';
import { clamp01, cycleAt, fadeInOut, lerp, projectPoint } from './motion.ts';

describe('shared desk motion helpers', () => {
  it('clamps and interpolates', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(.4)).toBe(.4);
    expect(clamp01(2)).toBe(1);
    expect(lerp(2, 6, 0)).toBe(2);
    expect(lerp(2, 6, .25)).toBe(3);
    expect(lerp(2, 6, 1)).toBe(6);
  });
  it('projects a point into a scaled, shifted view', () => {
    expect(projectPoint({ x: .5, y: .2 }, { scale: 1, x: 0, y: 0 })).toEqual({ x: .5, y: .2 });
    expect(projectPoint({ x: .5, y: .5 }, { scale: .5, x: .25, y: .1 })).toEqual({ x: .5, y: .35 });
  });
  it('fades in at the start and out at the end of an action', () => {
    expect(fadeInOut(0, .1, .2)).toBe(0);
    expect(fadeInOut(.05, .1, .2)).toBeCloseTo(.5);
    expect(fadeInOut(.5, .1, .2)).toBe(1);
    expect(fadeInOut(.9, .1, .2)).toBeCloseTo(.5);
    expect(fadeInOut(1, .1, .2)).toBe(0);
  });
  it('schedules one action per period and is idle in between', () => {
    expect(cycleAt(0, 10, 2, 4)).toBeNull();
    expect(cycleAt(2, 10, 2, 4)).toEqual({ cycle: 0, progress: 0 });
    expect(cycleAt(4, 10, 2, 4)).toEqual({ cycle: 0, progress: .5 });
    expect(cycleAt(6, 10, 2, 4)).toEqual({ cycle: 0, progress: 1 });
    expect(cycleAt(7, 10, 2, 4)).toBeNull();
    expect(cycleAt(33, 10, 2, 4)).toEqual({ cycle: 3, progress: .25 });
    expect(cycleAt(-5, 10, 0, 4)).toEqual({ cycle: 0, progress: 0 });
  });
});
