import { describe, expect, it } from 'vitest';
import { heatHrOffset } from '../../src/conventions/heat.ts';

describe('heatHrOffset', () => {
  it('is zero at or below the neutral temperature', () => {
    expect(heatHrOffset(20)).toBe(0);
    expect(heatHrOffset(10)).toBe(0);
  });

  it('ramps into the baseline 5-10 bpm range and caps at 10', () => {
    expect(heatHrOffset(30)).toBe(5);
    expect(heatHrOffset(40)).toBe(10);
    expect(heatHrOffset(50)).toBe(10); // capped
  });

  it('subtracted from an observed HR, judges effort fairly (a "Z4" 170 in 30°C reads ~165)', () => {
    expect(170 - heatHrOffset(30)).toBe(165);
  });
});
