// Pure Spotify Web API helpers for the desk radio: request building and answer reading. The Mac app (desktop/src/spotify.ts)
// adds the token and sends the request; nothing here touches the network.

export type SpotifyRequest = { method: 'GET' | 'PUT' | 'POST'; path: string; body?: unknown };
export type SpotifyResponse = { status: number; body: unknown };
/** `window.solaceDesktop.spotify`, exposed by desktop/src/preload.cjs. */
export interface SolaceSpotify {
  status(): Promise<{ configured: boolean; connected: boolean }>;
  login(): Promise<{ connected: boolean }>;
  logout(): Promise<void>;
  openApp(): Promise<void>;
  request(req: SpotifyRequest): Promise<SpotifyResponse>;
}

/** `spotify:playlist:<id>` from a pasted playlist link (web link, with or without `intl-xx` and `?si=`, or the URI itself). */
export function playlistUri(text: string): string | null {
  const match = /^(?:spotify:playlist:|https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2,3}\/)?playlist\/)([A-Za-z0-9]{22})(?:[/?#].*)?$/.exec(text.trim());
  return match ? `spotify:playlist:${match[1]}` : null;
}

export const playerRequest = (): SpotifyRequest => ({ method: 'GET', path: '/v1/me/player' });
export const devicesRequest = (): SpotifyRequest => ({ method: 'GET', path: '/v1/me/player/devices' });
/** Start a playlist (`contextUri`) or, without one, resume what was paused; `deviceId` wakes an inactive device. */
export const playRequest = (contextUri?: string, deviceId?: string): SpotifyRequest => ({
  method: 'PUT',
  path: `/v1/me/player/play${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''}`,
  ...(contextUri ? { body: { context_uri: contextUri } } : {}),
});
export const pauseRequest = (): SpotifyRequest => ({ method: 'PUT', path: '/v1/me/player/pause' });
export const nextRequest = (): SpotifyRequest => ({ method: 'POST', path: '/v1/me/player/next' });
/** `volume` 0..1 → Spotify's whole percent. */
export const volumeRequest = (volume: number): SpotifyRequest => ({
  method: 'PUT',
  path: `/v1/me/player/volume?volume_percent=${Math.round(Math.max(0, Math.min(1, volume)) * 100)}`,
});

export type PlayerSnapshot = { device: boolean; playing: boolean; title: string; artist: string; contextUri: string | null };
export type PlayerRead = { kind: 'snapshot'; snapshot: PlayerSnapshot } | { kind: 'unauthorized' } | { kind: 'error' };

/** `GET /v1/me/player`: 204 = no active device, 200 = the player. */
export function readPlayer(response: SpotifyResponse): PlayerRead {
  if (response.status === 401) return { kind: 'unauthorized' };
  if (response.status === 204) return { kind: 'snapshot', snapshot: { device: false, playing: false, title: '', artist: '', contextUri: null } };
  if (response.status !== 200 || typeof response.body !== 'object' || response.body === null) return { kind: 'error' };
  const b = response.body as { device?: unknown; is_playing?: unknown; item?: { name?: unknown; artists?: { name?: unknown }[]; show?: { name?: unknown } } | null; context?: { uri?: unknown } | null };
  const artists = (b.item?.artists ?? []).flatMap(a => typeof a.name === 'string' ? [a.name] : []);
  return {
    kind: 'snapshot',
    snapshot: {
      device: !!b.device,
      playing: b.is_playing === true,
      title: typeof b.item?.name === 'string' ? b.item.name : '',
      artist: artists.length ? artists.join(', ') : typeof b.item?.show?.name === 'string' ? b.item.show.name : '',
      contextUri: typeof b.context?.uri === 'string' ? b.context.uri : null,
    },
  };
}

/** The device to wake when Spotify is open but nothing is active: the first one that can be controlled. */
export function pickDevice(body: unknown): string | null {
  const devices = (body as { devices?: { id?: unknown; is_restricted?: unknown }[] } | null)?.devices;
  const found = devices?.find(d => typeof d.id === 'string' && d.is_restricted !== true);
  return found ? found.id as string : null;
}
