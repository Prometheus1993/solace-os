import { round2, type HourlyWeather, type Repository, type Sky, type UnixSeconds, type WeatherCacheEntry, type WeatherPort } from '@solace/core';

/**
 * Open-Meteo historical weather (free, no API key). Used to recover the air
 * temperature for a run from its date + GPS, because the watch records no
 * temperature. Heat raises HR ~5-10 bpm at the same
 * effort, so the run classifier subtracts a heat offset before judging drift.
 *
 * Cache-first: historical data is immutable, so once a day is fetched it is
 * stored in weather_cache (rounded to ~2dp, ≈1km) and never re-fetched.
 *
 * `getSky` is the one live call: today's sunrise/sunset + the current weather code from the forecast
 * API, for the desk. It is not stored here; the server keeps it in memory (sky.ts).
 */

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** A sky read must not hold up the dashboard when Open-Meteo is slow. */
const SKY_TIMEOUT_MS = 4000;

export interface OpenMeteoOptions {
  fetchFn?: FetchLike;
  baseUrl?: string;
  forecastUrl?: string;
}

interface ArchiveResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
  };
}

interface ForecastResponse {
  current?: { weather_code?: number | null };
  daily?: { sunrise?: (number | null)[]; sunset?: (number | null)[] };
}

export class OpenMeteoClient implements WeatherPort {
  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;
  private readonly forecastUrl: string;

  constructor(
    private readonly repo: Repository,
    options: OpenMeteoOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.baseUrl = options.baseUrl ?? 'https://archive-api.open-meteo.com/v1/archive';
    this.forecastUrl = options.forecastUrl ?? 'https://api.open-meteo.com/v1/forecast';
  }

  /** Today's sunrise/sunset (Unix seconds) and the current WMO weather code at a location. Throws on any failure. */
  async getSky(lat: number, lon: number): Promise<Omit<Sky, 'fetchedAt'>> {
    const url =
      `${this.forecastUrl}?latitude=${round2(lat)}&longitude=${round2(lon)}` +
      `&current=weather_code&daily=sunrise,sunset&forecast_days=1&timezone=auto&timeformat=unixtime`;
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(SKY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Open-Meteo forecast request failed (${res.status})`);
    const data = (await res.json()) as ForecastResponse;
    const sunrise = data.daily?.sunrise?.[0];
    const sunset = data.daily?.sunset?.[0];
    const weatherCode = data.current?.weather_code;
    if (typeof sunrise !== 'number' || typeof sunset !== 'number' || typeof weatherCode !== 'number') {
      throw new Error('Open-Meteo forecast response has no sun times or weather code');
    }
    return { sunrise: sunrise as UnixSeconds, sunset: sunset as UnixSeconds, weatherCode };
  }

  async getHourly(lat: number, lon: number, isoDate: string, hour: number): Promise<HourlyWeather | null> {
    const lat2 = round2(lat);
    const lon2 = round2(lon);

    const cached = await this.repo.getWeatherHour(lat2, lon2, isoDate, hour);
    if (cached) return cached;

    const url =
      `${this.baseUrl}?latitude=${lat2}&longitude=${lon2}` +
      `&start_date=${isoDate}&end_date=${isoDate}` +
      `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature&timezone=UTC`;

    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status}) for ${isoDate} @ ${lat2},${lon2}`);
    const data = (await res.json()) as ArchiveResponse;
    const hourly = data.hourly;
    if (!hourly?.time?.length) return null;

    const entries: WeatherCacheEntry[] = [];
    for (let i = 0; i < hourly.time.length; i++) {
      const temp = hourly.temperature_2m?.[i];
      if (temp == null) continue;
      const t = hourly.time[i] ?? '';
      entries.push({
        lat2dp: lat2,
        lon2dp: lon2,
        isoDate,
        hour: Number(t.slice(11, 13)), // "YYYY-MM-DDTHH:MM" -> HH
        temperatureC: temp,
        relativeHumidityPct: hourly.relative_humidity_2m?.[i] ?? null,
        apparentTemperatureC: hourly.apparent_temperature?.[i] ?? null,
      });
    }
    await this.repo.putWeatherHours(entries);
    return this.repo.getWeatherHour(lat2, lon2, isoDate, hour);
  }
}
