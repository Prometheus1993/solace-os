// Pure state of the desk radio: stations, the two knobs, and which of the radio's states applies. The Spotify
// request building is in `spotify-api.ts`, the 6 local tracks in `desk-personal-state.ts`.
import { playlistUri, type PlayerSnapshot } from './spotify-api.ts';

export const STATIONS = ['LOFI', 'JAZZ', 'BOSSA'] as const;
export type Station = typeof STATIONS[number];
export const decodeStation = (raw: string | null): Station => STATIONS.find(s => s === raw) ?? 'LOFI';
export const DEFAULT_VOLUME = .35;
export function decodeVolume(raw: string | null): number {
  return raw === null ? DEFAULT_VOLUME : Math.max(0, Math.min(1, Number(raw) || 0));
}

/** The pasted playlist link per station, as typed (a station without a link is absent). */
export type Playlists = Partial<Record<Station, string>>;
export function decodePlaylists(raw: string | null): Playlists {
  if (raw === null) return {};
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return {}; }
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(STATIONS.flatMap(s => {
    const link = (value as Record<string, unknown>)[s];
    return typeof link === 'string' && link !== '' ? [[s, link]] : [];
  }));
}
export const stationUri = (playlists: Playlists, station: Station): string | null => playlistUri(playlists[station] ?? '');

// Knobs: 0 degrees = 12 o'clock, clockwise positive (the art's convention).
export const VOLUME_SWEEP = 135;
export const TUNING_SWEEP = 75;
const STATION_ANGLE: Record<Station, number> = { LOFI: -60, JAZZ: 0, BOSSA: 60 };
/** The needle's x on the radio body (art pixels) at each station (`parts.json`). */
const STATION_X: Record<Station, number> = { LOFI: 612, JAZZ: 1100, BOSSA: 1590 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const volumeToAngle = (volume: number) => (clamp(volume, 0, 1) * 2 - 1) * VOLUME_SWEEP;
export const angleToVolume = (angle: number) => clamp((angle + VOLUME_SWEEP) / (2 * VOLUME_SWEEP), 0, 1);
/** Steps of 5 percent for wheel and arrow keys; the rounding keeps repeated steps free of float noise. */
export const stepVolume = (volume: number, steps: number) => clamp(Math.round((volume + steps * .05) * 100) / 100, 0, 1);

export const stationAngle = (station: Station) => STATION_ANGLE[station];
export const stationFromAngle = (angle: number): Station => STATIONS.reduce((best, s) => Math.abs(STATION_ANGLE[s] - angle) < Math.abs(STATION_ANGLE[best] - angle) ? s : best);
export const stepStation = (station: Station, steps: number): Station => STATIONS[clamp(STATIONS.indexOf(station) + steps, 0, STATIONS.length - 1)];
/** The needle follows the tuning knob: straight line between the stations' x positions. */
export function needleX(angle: number): number {
  const a = clamp(angle, STATION_ANGLE.LOFI, STATION_ANGLE.BOSSA);
  const [from, to] = a <= 0 ? ['LOFI', 'JAZZ'] as const : ['JAZZ', 'BOSSA'] as const;
  return STATION_X[from] + (a - STATION_ANGLE[from]) / (STATION_ANGLE[to] - STATION_ANGLE[from]) * (STATION_X[to] - STATION_X[from]);
}

/** Angle of a pointer relative to a knob's centre, 0 = straight up, clockwise, in (-180, 180]. */
export const pointerAngle = (dx: number, dy: number) => Math.atan2(dx, -dy) * 180 / Math.PI;
/** The knob follows the pointer's turning (not its position), so grabbing it anywhere does not make it jump. */
export function turnedAngle(angle: number, fromPointer: number, toPointer: number, limit: number): number {
  let delta = toPointer - fromPointer;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return clamp(angle + delta, -limit, limit);
}

/** Which of the radio's states shows. `local` = the 6 Open Lo-Fi tracks; the rest are Spotify. */
export type RadioStatus = 'local' | 'disconnected' | 'no-device' | 'playing' | 'paused' | 'error';
export type SpotifyConnection = 'unavailable' | 'disconnected' | 'connected';
export function radioStatus(a: { connection: SpotifyConnection; useLocal: boolean; snapshot: PlayerSnapshot | null; failed: boolean }): RadioStatus {
  if (a.connection === 'unavailable' || a.useLocal) return 'local';
  if (a.connection === 'disconnected') return 'disconnected';
  if (a.failed) return 'error';
  if (!a.snapshot?.device) return 'no-device';
  return a.snapshot.playing ? 'playing' : 'paused';
}

export type RadioAction = 'connect' | 'open-spotify' | 'play-local' | 'use-spotify' | 'retry';
export type RadioDisplay = { kicker: string; headline: string; sub: string; actions: RadioAction[]; spotify: boolean };
/** The words on the radio's glass. */
export function radioDisplay(a: { status: RadioStatus; station: Station; hasPlaylist: boolean; snapshot: PlayerSnapshot | null; localTitle: string; localError: string; connection: SpotifyConnection }): RadioDisplay {
  switch (a.status) {
    case 'local': return { kicker: 'LOCAL LOFI', headline: a.localTitle, sub: a.localError || 'OPEN LO-FI', actions: a.connection === 'connected' ? ['use-spotify'] : [], spotify: false };
    case 'disconnected': return { kicker: 'SPOTIFY · NOT CONNECTED', headline: 'CONNECT SPOTIFY', sub: '', actions: ['connect', 'play-local'], spotify: true };
    case 'no-device': return { kicker: 'NO ACTIVE SPOTIFY DEVICE', headline: 'OPEN SPOTIFY TO PLAY', sub: '', actions: ['open-spotify', 'play-local'], spotify: true };
    case 'error': return { kicker: 'NEEDS SPOTIFY PREMIUM AND THE SPOTIFY APP', headline: 'SPOTIFY DID NOT ANSWER', sub: '', actions: ['retry', 'play-local'], spotify: true };
    case 'playing':
    case 'paused':
      return {
        kicker: a.status === 'paused' ? `${a.station} · PAUSED` : a.station,
        headline: a.snapshot?.title || a.station,
        sub: a.snapshot?.artist || (a.hasPlaylist ? '' : `NO PLAYLIST SET FOR ${a.station}`),
        actions: [],
        spotify: true,
      };
  }
}
