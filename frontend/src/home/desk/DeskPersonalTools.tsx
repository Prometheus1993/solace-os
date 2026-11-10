import { useEffect, useRef, useState } from 'react';
import { loadScratchpad, saveScratchpad, MOODS, TRACKS, nextRadioTrack, type RadioMood } from './desk-personal-state.ts';
import { readStored, writeStored } from './desk-browser.ts';
import { DeskObjectSprite } from './DeskObjectSprite.tsx';
import type { DeskStyle } from './desk-sprite-catalog.ts';

export function useDeskRadio() {
  const audio = useRef<HTMLAudioElement>(null);
  const intent = useRef(false);
  const generation = useRef(0);
  const [index, setIndex] = useState(0);
  const [mood, setMood] = useState<RadioMood>('night');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    const value = readStored('solace.desk.radio.volume');
    return value === null ? .35 : Math.max(0, Math.min(1, Number(value) || 0));
  });
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const track = TRACKS[index];
  const play = async () => {
    const element = audio.current;
    if (!element) return;
    intent.current = true; setError('');
    const token = ++generation.current;
    try { await element.play(); }
    catch {
      if (token === generation.current) {
        intent.current = false;
        setPlaying(false);
        setError('Playback could not start. Press play to retry, or choose another track.');
      }
    }
  };
  const toggle = () => {
    if (playing || intent.current) { intent.current = false; generation.current++; audio.current?.pause(); }
    else void play();
  };
  const select = (next: number) => {
    if (next === index) return;
    generation.current++; setElapsed(0); setDuration(0); setError(''); setIndex(next);
  };
  const next = () => select(nextRadioTrack(index, mood));
  const chooseMood = (next: RadioMood) => { setMood(next); select(TRACKS.findIndex(item => item.mood === next)); };
  const cycleMood = () => chooseMood(MOODS[(MOODS.indexOf(mood) + 1) % MOODS.length]);
  useEffect(() => {
    if (audio.current) { audio.current.volume = volume; audio.current.muted = muted; }
    writeStored('solace.desk.radio.volume', String(volume));
  }, [volume, muted]);
  useEffect(() => { if (intent.current) void play(); }, [index]);
  useEffect(() => () => { generation.current++; intent.current = false; }, []);
  return {
    audio, track, index, mood, playing, muted, volume, error, elapsed, duration,
    src: `${import.meta.env.BASE_URL}music/open-lofi/${track.file}`,
    toggle, next, chooseMood, cycleMood, select, setVolume,
    toggleMute: () => setMuted(previous => !previous),
    onPlaying: () => setPlaying(true), onPause: () => setPlaying(false),
    onEnded: () => { intent.current = true; next(); },
    onError: () => { generation.current++; intent.current = false; setPlaying(false); setError('This track is unavailable. Try the next track.'); },
    onTimeUpdate: () => {
      const element = audio.current;
      if (element) { setElapsed(element.currentTime); setDuration(Number.isFinite(element.duration) ? element.duration : 0); }
    },
  };
}
export type DeskRadio = ReturnType<typeof useDeskRadio>;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function RadioPanel({ radio }: { radio: DeskRadio }) {
  return <div className="desk-radio-panel">
    <p className="desk-eyebrow">AFTER HOURS / OPEN LO-FI</p>
    <div className="desk-radio-display">
      <small>{radio.mood.toUpperCase()} FREQUENCY</small>
      <h2>{radio.track.title}</h2>
      <div
        className="desk-equalizer"
        data-playing={radio.playing && !radio.muted && radio.volume > 0}
        aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ animationDelay: `${-i * .17}s`, height: `${20 + (i * 23) % 80}%` }} />)}
      </div>
      <p>{radio.playing ? 'ON AIR' : 'PAUSED'} · {clock(radio.elapsed)} / {clock(radio.duration)}</p>
    </div>
    <div className="desk-radio-controls">
      <button onClick={radio.toggle}>{radio.playing ? 'Pause' : 'Play'}</button>
      <button onClick={radio.next}>Next track →</button>
      <button onClick={radio.toggleMute} aria-pressed={radio.muted}>{radio.muted ? 'Unmute' : 'Mute'}</button>
      <label>Volume <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={radio.volume}
          onChange={event => radio.setVolume(Number(event.target.value))} /> <output>{Math.round(radio.volume * 100)}%</output>
      </label>
    </div>
    {radio.error && <p role="alert">{radio.error}</p>}
    <div
      className="desk-radio-moods"
      aria-label="Radio mood">
      {MOODS.map(mood => <button key={mood} onClick={() => radio.chooseMood(mood)} aria-pressed={radio.mood === mood}>{mood.toUpperCase()}</button>)}
    </div>
    <ol className="desk-track-list">
      {TRACKS.map((track, i) => track.mood === radio.mood
        && <li key={track.file}>
          <button aria-pressed={radio.index === i} onClick={() => radio.select(i)}>{radio.index === i ? '● ' : '○ '}{track.title}</button>
        </li>)}
    </ol>
    <p className="desk-radio-credit">Music by Open Lo-Fi / btahir · AI-generated · CC0. <a
        href="https://github.com/btahir/open-lofi"
        target="_blank"
        rel="noreferrer">Source & license ↗</a>
    </p>
  </div>;
}

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
export function CollectiblePanel({ selected, onSelect, appearance }: { selected: number; onSelect: (index: number) => void; appearance?: DeskStyle }) {
  const figure = FIGURES[selected];
  return <div className="desk-collection-panel">
    <nav aria-label="Collectible figures">
      {FIGURES.map((item, i) => <button key={item.name} aria-pressed={selected === i} onClick={() => onSelect(i)}>{item.name}</button>)}
    </nav>
    <div key={selected} className="desk-collection-figure"><DeskObjectSprite id={selected === 0 ? 'figure-one' : 'figure-two'} appearance={appearance} /></div>
    <p className="desk-eyebrow">{figure.detail}</p>
    <h2>{figure.name}</h2>
    <p>{figure.description}</p>
    <p>Small reminders that every adventure needs a companion.</p>
  </div>;
}
