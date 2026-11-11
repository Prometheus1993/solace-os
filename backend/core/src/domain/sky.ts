import type { UnixSeconds } from './units.ts';

/** Today's sun times and the current weather at the configured location (Open-Meteo). */
export interface Sky {
  sunrise: UnixSeconds;
  sunset: UnixSeconds;
  /** WMO weather interpretation code, as Open-Meteo reports it. */
  weatherCode: number;
  fetchedAt: UnixSeconds;
}

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type WeatherMood = 'clear' | 'fog' | 'rain' | 'snow';

const DAY_S = 86_400;
/** Dawn and dusk each last from one hour before to one hour after sunrise / sunset. */
const TWILIGHT_HALF_S = 3_600;
const sinceS = (now: number, event: number) => (((now - event) % DAY_S) + DAY_S) % DAY_S;

/**
 * Phase of the day at `now`. With sun times: dawn and dusk are the two hours centred on sunrise and sunset.
 * Only the time of day of the sun times is used, so a reading from yesterday still gives a sensible phase.
 * Without them: fixed local clock hours (dawn 6-8, day 8-18, dusk 18-20, night otherwise).
 */
export function dayPhase(now: Date, sunrise?: number | null, sunset?: number | null): DayPhase {
  if (sunrise == null || sunset == null) {
    const hour = now.getHours();
    return hour >= 6 && hour < 8 ? 'dawn' : hour >= 8 && hour < 18 ? 'day' : hour >= 18 && hour < 20 ? 'dusk' : 'night';
  }
  const seconds = Math.floor(now.getTime() / 1000);
  if (sinceS(seconds, sunrise - TWILIGHT_HALF_S) < 2 * TWILIGHT_HALF_S) return 'dawn';
  if (sinceS(seconds, sunset - TWILIGHT_HALF_S) < 2 * TWILIGHT_HALF_S) return 'dusk';
  return sinceS(seconds, sunrise) < sinceS(sunset, sunrise) ? 'day' : 'night';
}

/**
 * Open-Meteo WMO code → one of four desk moods. Fog 45/48. Rain covers drizzle 51-57, rain 61-67,
 * showers 80-82 and thunderstorms 95-99. Snow 71-77 and snow showers 85/86. Everything else
 * (clear 0, cloudy 1-3, unknown codes) is clear.
 */
export function weatherMood(code: number): WeatherMood {
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rain';
  return 'clear';
}
