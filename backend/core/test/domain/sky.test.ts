import { describe, expect, it } from 'vitest';
import { dayPhase, weatherMood } from '../../src/index.ts';

describe('dayPhase', () => {
  const at = (hour: number, minute = 0) => new Date(2026, 10, 11, hour, minute);
  const unix = (date: Date) => Math.floor(date.getTime() / 1000);

  it('falls back to fixed local clock hours without sun times', () => {
    expect(dayPhase(at(5, 59))).toBe('night');
    expect(dayPhase(at(6))).toBe('dawn');
    expect(dayPhase(at(7, 59))).toBe('dawn');
    expect(dayPhase(at(8))).toBe('day');
    expect(dayPhase(at(17, 59))).toBe('day');
    expect(dayPhase(at(18))).toBe('dusk');
    expect(dayPhase(at(19, 59))).toBe('dusk');
    expect(dayPhase(at(20))).toBe('night');
    expect(dayPhase(at(0))).toBe('night');
    expect(dayPhase(at(12), null, null)).toBe('day');
    expect(dayPhase(at(12), unix(at(7)), null)).toBe('day');
  });

  it('centres dawn and dusk on the real sunrise and sunset', () => {
    const sunrise = unix(at(7, 50)), sunset = unix(at(17, 0));
    expect(dayPhase(at(6, 49), sunrise, sunset)).toBe('night');
    expect(dayPhase(at(6, 50), sunrise, sunset)).toBe('dawn');
    expect(dayPhase(at(8, 49), sunrise, sunset)).toBe('dawn');
    expect(dayPhase(at(8, 50), sunrise, sunset)).toBe('day');
    expect(dayPhase(at(15, 59), sunrise, sunset)).toBe('day');
    expect(dayPhase(at(16, 0), sunrise, sunset)).toBe('dusk');
    expect(dayPhase(at(17, 59), sunrise, sunset)).toBe('dusk');
    expect(dayPhase(at(18, 0), sunrise, sunset)).toBe('night');
    expect(dayPhase(at(2), sunrise, sunset)).toBe('night');
  });

  it('still works when the sun times are from another day', () => {
    const sunrise = unix(at(7, 50)) - 86_400, sunset = unix(at(17, 0)) - 86_400;
    expect(dayPhase(at(12), sunrise, sunset)).toBe('day');
    expect(dayPhase(at(7, 50), sunrise, sunset)).toBe('dawn');
    expect(dayPhase(at(23), sunrise, sunset)).toBe('night');
    expect(dayPhase(at(12), sunrise + 3 * 86_400, sunset + 3 * 86_400)).toBe('day');
  });
});

describe('weatherMood', () => {
  it('maps Open-Meteo WMO codes to four moods', () => {
    for (const code of [0, 1, 2, 3]) expect(weatherMood(code)).toBe('clear');
    for (const code of [45, 48]) expect(weatherMood(code)).toBe('fog');
    for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]) expect(weatherMood(code)).toBe('rain');
    for (const code of [71, 73, 75, 77, 85, 86]) expect(weatherMood(code)).toBe('snow');
    expect(weatherMood(1234)).toBe('clear');
  });
});
