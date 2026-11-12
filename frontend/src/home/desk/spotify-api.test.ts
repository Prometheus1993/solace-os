import { describe, expect, it } from 'vitest';
import { devicesRequest, nextRequest, pauseRequest, pickDevice, playlistUri, playRequest, readPlayer, volumeRequest } from './spotify-api.ts';

const ID = '37i9dQZF1DX0XUsuxWHRQd';

describe('playlistUri', () => {
  it.each([
    `https://open.spotify.com/playlist/${ID}`,
    `https://open.spotify.com/playlist/${ID}?si=abc123def`,
    `https://open.spotify.com/intl-nl/playlist/${ID}?si=x&pt=y`,
    `  https://open.spotify.com/playlist/${ID}/  `,
    `spotify:playlist:${ID}`,
  ])('reads %s', link => expect(playlistUri(link)).toBe(`spotify:playlist:${ID}`));
  it.each([
    '', 'lofi', `https://open.spotify.com/album/${ID}`, `https://open.spotify.com/track/${ID}`,
    'https://open.spotify.com/playlist/short', `https://example.com/playlist/${ID}`, `spotify:playlist:${ID}x`,
  ])('refuses %s', link => expect(playlistUri(link)).toBeNull());
});

describe('requests', () => {
  it('starts a playlist with a context_uri body, or resumes with none', () => {
    expect(playRequest(`spotify:playlist:${ID}`)).toEqual({ method: 'PUT', path: '/v1/me/player/play', body: { context_uri: `spotify:playlist:${ID}` } });
    expect(playRequest()).toEqual({ method: 'PUT', path: '/v1/me/player/play' });
    expect(playRequest(undefined, 'dev 1').path).toBe('/v1/me/player/play?device_id=dev%201');
  });
  it('builds pause, next, devices and the volume percent (rounded and clamped)', () => {
    expect(pauseRequest()).toEqual({ method: 'PUT', path: '/v1/me/player/pause' });
    expect(nextRequest()).toEqual({ method: 'POST', path: '/v1/me/player/next' });
    expect(devicesRequest().path).toBe('/v1/me/player/devices');
    expect(volumeRequest(.356).path).toBe('/v1/me/player/volume?volume_percent=36');
    expect(volumeRequest(-1).path).toBe('/v1/me/player/volume?volume_percent=0');
    expect(volumeRequest(7).path).toBe('/v1/me/player/volume?volume_percent=100');
  });
});

describe('readPlayer', () => {
  it('204 = no active device; 401 = unauthorized; other = error', () => {
    expect(readPlayer({ status: 204, body: null })).toEqual({ kind: 'snapshot', snapshot: { device: false, playing: false, title: '', artist: '', contextUri: null } });
    expect(readPlayer({ status: 401, body: null })).toEqual({ kind: 'unauthorized' });
    expect(readPlayer({ status: 429, body: null })).toEqual({ kind: 'error' });
    expect(readPlayer({ status: 200, body: null })).toEqual({ kind: 'error' });
  });
  it('reads title, artists and context of a playing track', () => {
    const body = { device: { id: 'd' }, is_playing: true, item: { name: 'Song', artists: [{ name: 'A' }, { name: 'B' }] }, context: { uri: `spotify:playlist:${ID}` } };
    expect(readPlayer({ status: 200, body })).toEqual({ kind: 'snapshot', snapshot: { device: true, playing: true, title: 'Song', artist: 'A, B', contextUri: `spotify:playlist:${ID}` } });
  });
  it('falls back to the show name for a podcast and survives a missing item', () => {
    expect(readPlayer({ status: 200, body: { device: {}, is_playing: false, item: { name: 'Ep', show: { name: 'Show' } } } })).toMatchObject({ snapshot: { artist: 'Show', playing: false } });
    expect(readPlayer({ status: 200, body: { device: {}, item: null } })).toMatchObject({ snapshot: { title: '', artist: '', contextUri: null } });
  });
});

describe('pickDevice', () => {
  it('takes the first controllable device, none when there is none', () => {
    expect(pickDevice({ devices: [{ id: null }, { id: 'r', is_restricted: true }, { id: 'ok' }, { id: 'later' }] })).toBe('ok');
    expect(pickDevice({ devices: [] })).toBeNull();
    expect(pickDevice(null)).toBeNull();
  });
});
