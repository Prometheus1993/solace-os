import { describe, expect, it } from 'vitest';
import { classifyHr, z3z4LineBpm } from '../../src/conventions/hr-zones.ts';

describe('classifyHr at max 190', () => {
  it('classifies typical 149-151 runs as upper Z3, not Z4 (corrected error #1)', () => {
    for (const hr of [149, 150, 151]) {
      expect(classifyHr(hr, 190).zone).toBe(3);
    }
  });

  it('puts 152 and up into Z4', () => {
    expect(classifyHr(152, 190).zone).toBe(4);
    expect(classifyHr(153, 190).zone).toBe(4);
  });

  it('handles the full ladder', () => {
    expect(classifyHr(110, 190).zone).toBe(1);
    expect(classifyHr(114, 190).zone).toBe(2);
    expect(classifyHr(133, 190).zone).toBe(3);
    expect(classifyHr(171, 190).zone).toBe(5);
    expect(classifyHr(189, 190).zone).toBe(5);
  });

  it('marks classifications within 3 bpm of the soft Z3/Z4 line as soft', () => {
    expect(classifyHr(150, 190).isSoftBoundary).toBe(true); // |150-152|=2
    expect(classifyHr(155, 190).isSoftBoundary).toBe(true); // |155-152|=3
    expect(classifyHr(156, 190).isSoftBoundary).toBe(false); // |156-152|=4
    expect(classifyHr(125, 190).isSoftBoundary).toBe(false);
  });
});

describe('z3z4LineBpm', () => {
  it('is the lower bound of Z4 (80% of max HR)', () => {
    expect(z3z4LineBpm(190)).toBe(152);
  });
});
