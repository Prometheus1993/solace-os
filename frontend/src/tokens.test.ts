import { describe, expect, it } from 'vitest';
import { fmtNum } from './tokens.ts';

describe('fmtNum', () => {
  it('compacts from 10,000 with "k", up to 2 decimals, trailing zeros trimmed', () => {
    expect(fmtNum(15000)).toBe('15k');
    expect(fmtNum(55647)).toBe('55.65k');
    expect(fmtNum(10000)).toBe('10k');
    expect(fmtNum(12340)).toBe('12.34k');
    expect(fmtNum(12300)).toBe('12.3k');
    expect(fmtNum(1_250_000)).toBe('1250k');
  });
  it('below 10,000 keeps max 2 decimals, trims zeros', () => {
    expect(fmtNum(9999)).toBe('9999');
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(0.46)).toBe('0.46');
    expect(fmtNum(1.5)).toBe('1.5');
    expect(fmtNum(3)).toBe('3');
    expect(fmtNum(2.345)).toBe('2.35');
    expect(fmtNum(99.9)).toBe('99.9');
    expect(fmtNum(7.0)).toBe('7');
  });
  it('handles negatives like positives', () => {
    expect(fmtNum(-15000)).toBe('-15k');
    expect(fmtNum(-2.5)).toBe('-2.5');
  });
});
