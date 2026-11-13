import { describe, expect, it } from 'vitest';
import {
  angleToVolume, decodePlaylists, decodeStation, decodeVolume, needleX, pointerAngle, radioDisplay, radioStatus, stationAngle,
  stationFromAngle, stationUri, spotifySupport, stepStation, stepVolume, turnedAngle, volumeToAngle, type SpotifyConnection,
} from './radio-state.ts';
import type { PlayerSnapshot } from './spotify-api.ts';

const snap = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({ device: true, playing: true, title: 'Song', artist: 'Artist', contextUri: null, ...over });

describe('remembered values', () => {
  it('falls back for station and volume, clamps volume', () => {
    expect(decodeStation('JAZZ')).toBe('JAZZ');
    expect(decodeStation('POLKA')).toBe('LOFI');
    expect(decodeStation(null)).toBe('LOFI');
    expect(decodeVolume(null)).toBe(.35);
    expect(decodeVolume('0.8')).toBe(.8);
    expect(decodeVolume('7')).toBe(1);
    expect(decodeVolume('abc')).toBe(0);
  });
  it('keeps typed playlist links per station and turns them into URIs', () => {
    const id = '37i9dQZF1DX0XUsuxWHRQd';
    const playlists = decodePlaylists(JSON.stringify({ LOFI: `https://open.spotify.com/playlist/${id}?si=1`, JAZZ: 'nonsense', BOSSA: '', OTHER: 'x' }));
    expect(playlists).toEqual({ LOFI: `https://open.spotify.com/playlist/${id}?si=1`, JAZZ: 'nonsense' });
    expect(stationUri(playlists, 'LOFI')).toBe(`spotify:playlist:${id}`);
    expect(stationUri(playlists, 'JAZZ')).toBeNull();
    expect(stationUri(playlists, 'BOSSA')).toBeNull();
    expect(decodePlaylists('not json')).toEqual({});
    expect(decodePlaylists(null)).toEqual({});
  });
});

describe('volume knob', () => {
  it('maps 0..1 to -135..135 degrees and back', () => {
    expect(volumeToAngle(0)).toBe(-135);
    expect(volumeToAngle(.5)).toBe(0);
    expect(volumeToAngle(1)).toBe(135);
    expect(volumeToAngle(9)).toBe(135);
    for (const v of [0, .25, .35, 1]) expect(angleToVolume(volumeToAngle(v))).toBeCloseTo(v, 10);
    expect(angleToVolume(-500)).toBe(0);
  });
  it('steps by 5 percent without float noise and clamps (Home/End as infinite steps)', () => {
    expect(stepVolume(.35, 1)).toBe(.4);
    expect(stepVolume(.1, 3)).toBe(.25);
    expect(stepVolume(.02, -1)).toBe(0);
    expect(stepVolume(.5, Infinity)).toBe(1);
    expect(stepVolume(.5, -Infinity)).toBe(0);
  });
  it('measures pointer angles from 12 o\'clock, clockwise', () => {
    expect(pointerAngle(0, -10)).toBe(0);
    expect(pointerAngle(10, 0)).toBe(90);
    expect(pointerAngle(0, 10)).toBe(180);
    expect(pointerAngle(-10, 0)).toBe(-90);
  });
  it('turns by the pointer\'s movement, wraps at 180 and stops at the limit', () => {
    expect(turnedAngle(10, 20, 50, 135)).toBe(40);
    expect(turnedAngle(0, 170, -170, 135)).toBe(20);
    expect(turnedAngle(0, -170, 170, 135)).toBe(-20);
    expect(turnedAngle(120, 0, 90, 135)).toBe(135);
    expect(turnedAngle(-120, 0, -90, 135)).toBe(-135);
  });
});

describe('station dial', () => {
  it('snaps an angle to the nearest station', () => {
    expect(stationFromAngle(-75)).toBe('LOFI');
    expect(stationFromAngle(-31)).toBe('LOFI');
    expect(stationFromAngle(-29)).toBe('JAZZ');
    expect(stationFromAngle(29)).toBe('JAZZ');
    expect(stationFromAngle(31)).toBe('BOSSA');
    expect(stationFromAngle(75)).toBe('BOSSA');
  });
  it('steps between stations without wrapping', () => {
    expect(stepStation('LOFI', 1)).toBe('JAZZ');
    expect(stepStation('JAZZ', 1)).toBe('BOSSA');
    expect(stepStation('BOSSA', 1)).toBe('BOSSA');
    expect(stepStation('LOFI', -1)).toBe('LOFI');
    expect(stepStation('LOFI', Infinity)).toBe('BOSSA');
  });
  it('moves the needle through the three station positions of the art', () => {
    expect(needleX(stationAngle('LOFI'))).toBe(612);
    expect(needleX(stationAngle('JAZZ'))).toBe(1100);
    expect(needleX(stationAngle('BOSSA'))).toBe(1590);
    expect(needleX(-30)).toBe(856);
    expect(needleX(-90)).toBe(612);
    expect(needleX(90)).toBe(1590);
  });
});

describe('radio status (fallback state machine)', () => {
  const s = (connection: SpotifyConnection, over: { useLocal?: boolean; snapshot?: PlayerSnapshot | null; failed?: boolean } = {}) =>
    radioStatus({ connection, useLocal: false, snapshot: null, failed: false, ...over });
  it('plays local without Spotify (browser, demo, Docker, no Client ID)', () => {
    expect(s('unavailable')).toBe('local');
    expect(s('unavailable', { snapshot: snap() })).toBe('local');
  });
  it('stays on local only when the user chose it', () => {
    expect(s('connected', { useLocal: true, snapshot: snap() })).toBe('local');
    expect(s('disconnected', { useLocal: true })).toBe('local');
  });
  it('shows disconnected, no-device, error, playing and paused', () => {
    expect(s('disconnected')).toBe('disconnected');
    expect(s('connected')).toBe('no-device');
    expect(s('connected', { snapshot: snap({ device: false, playing: false }) })).toBe('no-device');
    expect(s('connected', { failed: true, snapshot: snap() })).toBe('error');
    expect(s('connected', { snapshot: snap() })).toBe('playing');
    expect(s('connected', { snapshot: snap({ playing: false }) })).toBe('paused');
  });
  it('never changes source by itself: no-device offers buttons, it does not pick local', () => {
    const display = radioDisplay({ status: 'no-device', station: 'LOFI', hasPlaylist: true, snapshot: null, localTitle: 'T', localError: '', connection: 'connected' });
    expect(display.headline).toBe('OPEN SPOTIFY TO PLAY');
    expect(display.actions).toEqual(['open-spotify', 'play-local']);
  });
});

describe('radio display', () => {
  const base = { station: 'JAZZ', hasPlaylist: true, snapshot: snap(), localTitle: 'High Rise Haze', localError: '', connection: 'unavailable' } as const;
  it('shows title and artist from Spotify', () => {
    expect(radioDisplay({ ...base, status: 'playing' })).toEqual({ kicker: 'JAZZ', headline: 'Song', sub: 'Artist', actions: [], spotify: true });
    expect(radioDisplay({ ...base, status: 'paused' }).kicker).toBe('JAZZ · PAUSED');
  });
  it('names the missing playlist when nothing else is known', () => {
    expect(radioDisplay({ ...base, status: 'paused', snapshot: snap({ title: '', artist: '' }), hasPlaylist: false }).sub).toBe('NO PLAYLIST SET FOR JAZZ');
  });
  it('local mode shows the track title and no Spotify mark; with a login it offers to go back', () => {
    expect(radioDisplay({ ...base, status: 'local' })).toEqual({ kicker: 'LOCAL LOFI', headline: 'High Rise Haze', sub: 'OPEN LO-FI', actions: [], spotify: false });
    expect(radioDisplay({ ...base, status: 'local', connection: 'connected' }).actions).toEqual(['use-spotify']);
    expect(radioDisplay({ ...base, status: 'local', localError: 'THIS TRACK IS UNAVAILABLE' }).sub).toBe('THIS TRACK IS UNAVAILABLE');
  });
  it('offers to connect when logged out', () => {
    expect(radioDisplay({ ...base, status: 'disconnected' }).actions).toEqual(['connect', 'play-local']);
  });
});

describe('spotifySupport', () => {
  it('tells a browser, an old Mac app and a Mac app with the Spotify bridge apart', () => {
    expect(spotifySupport(undefined)).toBe('browser');
    expect(spotifySupport({})).toBe('outdated');
    expect(spotifySupport({ spotify: {} })).toBe('ready');
  });
});
