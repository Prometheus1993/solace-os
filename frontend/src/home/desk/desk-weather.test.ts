import { describe, expect, it } from 'vitest';
import { forcedSkyMood, particleCount, spawnParticles, stepParticles } from './desk-weather.ts';

const sequence = (...values: number[]) => { let index = 0; return () => values[index++ % values.length]; };

describe('desk weather', () => {
  it('reads a forced mood from the query string and ignores anything else', () => {
    for (const mood of ['clear', 'fog', 'rain', 'snow'] as const) expect(forcedSkyMood(`?skyMood=${mood}`)).toBe(mood);
    expect(forcedSkyMood('?a=1&skyMood=rain')).toBe('rain');
    expect(forcedSkyMood('')).toBeNull();
    expect(forcedSkyMood('?skyMood=storm')).toBeNull();
    expect(forcedSkyMood('?skymood=rain')).toBeNull();
  });

  it('draws particles for rain and snow only, a quarter of them when still', () => {
    expect(particleCount('clear', false)).toBe(0);
    expect(particleCount('fog', false)).toBe(0);
    expect(particleCount('rain', false)).toBeGreaterThan(particleCount('snow', false));
    expect(particleCount('snow', false)).toBeGreaterThan(0);
    expect(particleCount('rain', true)).toBe(Math.ceil(particleCount('rain', false) / 4));
    expect(particleCount('snow', true)).toBe(Math.ceil(particleCount('snow', false) / 4));
    expect(spawnParticles('rain', false, () => .5)).toHaveLength(particleCount('rain', false));
    expect(spawnParticles('clear', false, () => .5)).toEqual([]);
  });

  it('makes rain fall far faster than snow, from the injected random', () => {
    const [drop] = spawnParticles('rain', false, () => .5), [flake] = spawnParticles('snow', false, () => .5);
    expect(drop.speed).toBeCloseTo(1.15); expect(flake.speed).toBeCloseTo(.1);
    expect(spawnParticles('rain', false, () => 0)[0].speed).toBeCloseTo(.9);
    expect(spawnParticles('rain', false, () => .999)[0].speed).toBeLessThanOrEqual(1.4);
  });

  it('moves particles down and re-enters one that left the bottom above the top at a new x', () => {
    const moved = stepParticles([{ x: .2, y: .5, speed: 1, size: 1, sway: 0 }], .1, () => .9);
    expect(moved[0].y).toBeCloseTo(.6); expect(moved[0].x).toBe(.2);
    const wrapped = stepParticles([{ x: .2, y: .98, speed: 1, size: 1, sway: 0 }], .04, sequence(.9));
    expect(wrapped[0].y).toBeLessThan(0); expect(wrapped[0].x).toBe(.9);
  });
});
