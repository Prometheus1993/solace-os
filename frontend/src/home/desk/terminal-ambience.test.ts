import { describe, expect, it } from 'vitest';
import { AMBIENT_LINES, clockText, planAmbient } from './terminal-ambience.ts';

describe('terminal ambience', () => {
  it('waits 25 to 55 seconds and shows a line for 5', () => {
    expect(planAmbient(() => 0, null)).toEqual({ wait: 25, line: 0, hold: 5 });
    const late = planAmbient(() => .999, null);
    expect(late.wait).toBeCloseTo(55, 0);
    expect(late.line).toBe(AMBIENT_LINES.length - 1);
  });
  it('never repeats the previous line, whatever the random numbers are', () => {
    for (let previous = 0; previous < AMBIENT_LINES.length; previous++) {
      for (let step = 0; step <= 100; step++) {
        const line = planAmbient(() => step / 100 * .9999, previous).line;
        expect(line).not.toBe(previous);
        expect(line).toBeGreaterThanOrEqual(0);
        expect(line).toBeLessThan(AMBIENT_LINES.length);
      }
    }
  });
  it('reaches every line from every previous line', () => {
    const seen = new Set<number>();
    for (let step = 0; step < 100; step++) seen.add(planAmbient(() => step / 100, 3).line);
    expect(seen.size).toBe(AMBIENT_LINES.length - 1);
  });
  it('formats the clock with two digits', () => {
    expect(clockText(new Date(2026, 10, 12, 7, 5))).toBe('07:05');
    expect(clockText(new Date(2026, 10, 12, 23, 59))).toBe('23:59');
  });
  it('contains no wording that suggests a running command, sync or save', () => {
    expect(AMBIENT_LINES.join(' ')).not.toMatch(/sync|save|upload|scan|run|command|fetch|garmin/i);
  });
});
