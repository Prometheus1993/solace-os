import { describe, expect, it } from 'vitest';
import { avatarState, type AvatarSignals } from './avatar-state.ts';
const signals = (sleep: number | null, bodyBattery: number | null, flag = 'normal', stale: number | null = 0) => ({
  recovery: { today: { sleep, bodyBattery, hrv: flag === 'unknown' ? null : 40 } },
  hrv: { todayFlag: flag }, dataFreshness: { recoveryDaysStale: stale },
} as AvatarSignals);
describe('cosmetic avatar idle', () => {
  it('keeps missing and stale signals neutral', () => {
    expect(avatarState(signals(null, null, 'unknown')).mood).toBe('neutral');
    expect(avatarState(signals(10, 0, 'low', 2)).mood).toBe('neutral');
    expect(avatarState(signals(10, 0, 'low', null)).mood).toBe('neutral');
  });
  it('selects the stronger sleep/battery deficit and preserves zero', () => {
    expect(avatarState(signals(50, 0)).mood).toBe('drained');
    expect(avatarState(signals(10, 24)).mood).toBe('sleepy');
    expect(avatarState(signals(60, 25)).mood).toBe('neutral');
  });
  it('uses the baseline flag and requires complete good signals for alert', () => {
    expect(avatarState(signals(80, 80, 'low')).mood).toBe('recovering');
    expect(avatarState(signals(80, 80)).mood).toBe('alert');
    expect(avatarState(signals(80, 80, 'unknown')).mood).toBe('neutral');
  });
});
