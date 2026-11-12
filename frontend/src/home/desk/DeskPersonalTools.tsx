import { useEffect, useRef, useState } from 'react';
import { loadScratchpad, saveScratchpad, TRACKS, nextLocalTrack } from './desk-personal-state.ts';
import { readStored, writeStored } from './desk-browser.ts';
import { DeskObjectSprite } from './DeskObjectSprite.tsx';
import {
  decodePlaylists, decodeStation, decodeVolume, radioDisplay, radioStatus, stationUri,
  type Playlists, type RadioAction, type Station, type SpotifyConnection,
} from './radio-state.ts';
import {
  devicesRequest, nextRequest, pauseRequest, pickDevice, playRequest, playerRequest, readPlayer, volumeRequest,
  type PlayerSnapshot, type SpotifyRequest, type SpotifyResponse,
} from './spotify-api.ts';

const VOLUME_KEY = 'solace.desk.radio.volume';
const STATION_KEY = 'solace.desk.radio.station';
const PLAYLISTS_KEY = 'solace.desk.radio.playlists';
const POLL_MS = 4000;

/**
 * The desk radio. Two sources: the 6 local Open Lo-Fi tracks (the <audio> element in DesktopHub) and, inside the Mac
 * app only, the user's own Spotify (remote control through `window.solaceDesktop.spotify`). It never switches source
 * by itself: only the buttons on the radio's glass do.
 */
export function useDeskRadio() {
  const spotify = window.solaceDesktop?.spotify;
  const audio = useRef<HTMLAudioElement>(null);
  const intent = useRef(false);
  const generation = useRef(0);
  const volumeTimer = useRef(0);
  const [index, setIndex] = useState(0);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() => decodeVolume(readStored(VOLUME_KEY)));
  const [station, setStationState] = useState<Station>(() => decodeStation(readStored(STATION_KEY)));
  const [playlists, setPlaylists] = useState<Playlists>(() => decodePlaylists(readStored(PLAYLISTS_KEY)));
  const [localError, setLocalError] = useState('');
  const [info, setInfo] = useState({ configured: false, connected: false });
  const [useLocal, setUseLocal] = useState(false);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const track = TRACKS[index];
  const connection: SpotifyConnection = !spotify || !info.configured ? 'unavailable' : info.connected ? 'connected' : 'disconnected';
  const status = radioStatus({ connection, useLocal, snapshot, failed });
  const uri = stationUri(playlists, station);

  const playLocal = async () => {
    const element = audio.current;
    if (!element) return;
    intent.current = true; setLocalError('');
    const token = ++generation.current;
    try { await element.play(); }
    catch {
      if (token === generation.current) { intent.current = false; setLocalPlaying(false); setLocalError('PLAYBACK DID NOT START'); }
    }
  };
  const pauseLocal = () => { intent.current = false; generation.current++; audio.current?.pause(); };
  const selectLocal = (next: number) => { generation.current++; setLocalError(''); setIndex(next); };

  /** One call to Spotify; a refused login (401) turns the radio back to "connect". */
  const call = async (req: SpotifyRequest): Promise<SpotifyResponse> => {
    try {
      const response = await spotify!.request(req);
      if (response.status === 401) { setInfo(previous => ({ ...previous, connected: false })); setSnapshot(null); }
      return response;
    } catch { return { status: 0, body: null }; }
  };
  const refresh = async () => {
    const read = readPlayer(await call(playerRequest()));
    if (read.kind === 'snapshot') { setSnapshot(read.snapshot); setFailed(false); }
    else if (read.kind === 'error') setFailed(true);
  };
  const spotifyPlay = async (context: string | null, resume: boolean) => {
    const start = resume || context === null ? undefined : context;
    const response = await call(playRequest(start));
    if (response.status === 404) {
      // Spotify is open but not the active player: wake the first device. No device at all = "OPEN SPOTIFY TO PLAY".
      const device = pickDevice((await call(devicesRequest())).body);
      if (device) await call(playRequest(start, device));
    }
    await refresh();
  };

  useEffect(() => {
    if (!spotify) return;
    let cancelled = false;
    void spotify.status().then(value => { if (!cancelled) setInfo(value); });
    return () => { cancelled = true; };
  }, []);
  // While Spotify is the source, follow the player (what plays, whether a device exists) while the page is visible.
  const following = connection === 'connected' && !useLocal;
  useEffect(() => {
    if (!following) return;
    const poll = () => { if (!document.hidden) void refresh(); };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [following]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  useEffect(() => { if (intent.current) void playLocal(); }, [index]);
  useEffect(() => () => { generation.current++; intent.current = false; window.clearTimeout(volumeTimer.current); }, []);

  const playing = status === 'local' ? localPlaying : status === 'playing';
  const display = radioDisplay({ status, station, hasPlaylist: uri !== null, snapshot, localTitle: track.title, localError, connection });
  const connect = async () => {
    const result = await spotify!.login();
    setInfo(previous => ({ ...previous, connected: result.connected }));
    if (result.connected) setUseLocal(false);
  };
  return {
    audio, status, playing, volume, station, playlists, display, connection, hasSpotify: !!spotify, configured: info.configured,
    src: `${import.meta.env.BASE_URL}music/open-lofi/${track.file}`,
    toggle: () => {
      if (status === 'local') { if (localPlaying || intent.current) pauseLocal(); else void playLocal(); }
      else if (status === 'disconnected') void connect();
      else if (status === 'playing') void call(pauseRequest()).then(refresh);
      else void spotifyPlay(uri, snapshot?.contextUri === uri);
    },
    next: () => {
      if (status === 'local') selectLocal(nextLocalTrack(index));
      else if (status === 'playing' || status === 'paused') void call(nextRequest()).then(refresh);
    },
    setVolume: (next: number) => {
      setVolumeState(next);
      writeStored(VOLUME_KEY, String(next));
      if (following) {
        window.clearTimeout(volumeTimer.current);
        volumeTimer.current = window.setTimeout(() => void call(volumeRequest(next)), 150);
      }
    },
    tune: (next: Station) => {
      setStationState(next);
      writeStored(STATION_KEY, next);
      if (status === 'playing' && next !== station) void spotifyPlay(stationUri(playlists, next), false);
    },
    connect,
    disconnect: async () => { await spotify!.logout(); setInfo(previous => ({ ...previous, connected: false })); setSnapshot(null); },
    act: (action: RadioAction) => {
      if (action === 'connect') void connect();
      else if (action === 'open-spotify') void spotify!.openApp();
      else if (action === 'play-local') { setUseLocal(true); void playLocal(); }
      else if (action === 'use-spotify') { pauseLocal(); setUseLocal(false); }
      else void refresh();
    },
    setPlaylist: (target: Station, link: string) => {
      const next = { ...playlists, [target]: link };
      setPlaylists(next);
      writeStored(PLAYLISTS_KEY, JSON.stringify(next));
    },
    onPlaying: () => setLocalPlaying(true), onPause: () => setLocalPlaying(false),
    onEnded: () => { intent.current = true; selectLocal(nextLocalTrack(index)); },
    onError: () => { generation.current++; intent.current = false; setLocalPlaying(false); setLocalError('THIS TRACK IS UNAVAILABLE'); },
  };
}
export type DeskRadio = ReturnType<typeof useDeskRadio>;

export function Scratchpad() {
  const [note, setNote] = useState(() => {
    try { return loadScratchpad(localStorage); } catch { return { text: '', error: true }; }
  });
  const update = (text: string) => {
    let saved = false;
    try { saved = saveScratchpad(localStorage, text); } catch { /* storage access denied */ }
    setNote({ text, error: !saved });
  };
  return <div className="desk-scratchpad">
    <label htmlFor="desk-note">A little room for your thoughts.</label>
    <p
      id="desk-note-status"
      role="status">
      {note.error ? 'Browser storage is unavailable. Keep this page open and copy your note before leaving.' : 'Saved automatically on this device.'}
    </p>
    <textarea
      id="desk-note"
      aria-describedby="desk-note-status"
      value={note.text}
      onChange={event => update(event.target.value)}
      placeholder="Ideas, reminders, the next small thing…"
      spellCheck />
  </div>;
}

const FIGURES = [
  {
    name: 'The Wayfarer',
    description: 'An explorer with a weathered suit and an unreasonable belief that there is always another route home.',
    detail: 'DESK COLLECTION / 01 · Copper trim, midnight visor, planted boots.'
  },
  {
    name: 'Little Relay',
    description: 'A tiny maintenance robot. Keeps the lights on, carries the spare parts, never asks for credit.',
    detail: 'DESK COLLECTION / 02 · Box chassis, cyan optics, oversized feet.'
  },
];
export function CollectiblePanel({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  const figure = FIGURES[selected];
  return <div className="desk-collection-panel">
    <nav aria-label="Collectible figures">
      {FIGURES.map((item, i) => <button key={item.name} aria-pressed={selected === i} onClick={() => onSelect(i)}>{item.name}</button>)}
    </nav>
    <div key={selected} className="desk-collection-figure"><DeskObjectSprite id={selected === 0 ? 'figure-one' : 'figure-two'} /></div>
    <p className="desk-eyebrow">{figure.detail}</p>
    <h2>{figure.name}</h2>
    <p>{figure.description}</p>
    <p>Small reminders that every adventure needs a companion.</p>
  </div>;
}
