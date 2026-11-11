import type { Clock, Sky } from '@solace/core';

/** Sun times + weather for the desk: where to look, and an in-memory cache in front of Open-Meteo. */

export interface SkyLocation {
  lat: number;
  lon: number;
}
export type SkySource = () => Promise<Sky | null>;

/** Antwerp. */
export const DEFAULT_SKY_LOCATION: SkyLocation = { lat: 51.22, lon: 4.4 };
const SKY_TTL_S = 30 * 60;
/** After a failed read, wait this long before asking Open-Meteo again. */
const SKY_RETRY_S = 5 * 60;

/**
 * Location from the environment: SOLACE_LAT + SOLACE_LON (decimal degrees), default Antwerp.
 * SOLACE_SKY=0 turns the lookup off (null): no request leaves the machine.
 */
export function skyLocation(env: NodeJS.ProcessEnv = process.env): SkyLocation | null {
  if (env['SOLACE_SKY'] === '0') return null;
  const latRaw = env['SOLACE_LAT'];
  const lonRaw = env['SOLACE_LON'];
  if (!latRaw && !lonRaw) return DEFAULT_SKY_LOCATION;
  const lat = Number(latRaw || NaN);
  const lon = Number(lonRaw || NaN);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
    console.warn('SOLACE_LAT / SOLACE_LON must both be decimal degrees (lat -90..90, lon -180..180); using the default location.');
    return DEFAULT_SKY_LOCATION;
  }
  return { lat, lon };
}

/**
 * Wrap a sky read in a 30-minute in-memory cache. Concurrent callers share one read. A failed read
 * gives null (never throws) and is retried after 5 minutes, so the dashboard never depends on the network.
 */
export function createSkySource(read: () => Promise<Omit<Sky, 'fetchedAt'>>, clock: Clock): SkySource {
  let current: Promise<Sky | null> | undefined;
  let expires = 0;
  return () => {
    const now = clock.now();
    if (current && now < expires) return current;
    expires = now + SKY_TTL_S;
    current = read().then(
      (reading) => ({ ...reading, fetchedAt: now }),
      (err: unknown) => {
        console.warn('[sky] Open-Meteo read failed:', err instanceof Error ? err.message : err);
        expires = now + SKY_RETRY_S;
        return null;
      },
    );
    return current;
  };
}
