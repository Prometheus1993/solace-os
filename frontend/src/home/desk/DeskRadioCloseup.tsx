import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { deskAsset as asset } from './desk-assets.ts';
import type { DeskRadio } from './DeskPersonalTools.tsx';
import {
  angleToVolume, needleX, pointerAngle, stationAngle, stationFromAngle, STATIONS, stepStation, stepVolume, turnedAngle, TUNING_SWEEP,
  volumeToAngle, VOLUME_SWEEP, type RadioAction,
} from './radio-state.ts';
import { playlistUri } from './spotify-api.ts';

// The close-up radio. Art coordinates are pixels of the 2400x1600 body image (`parts.json` of the art): every part is
// drawn at body_anchor - local_anchor and placed here as a percentage of the stage.
const BODY = { w: 2400, h: 1600 };
const pct = (x: number, y: number, w: number, h: number): CSSProperties => ({ left: `${x / BODY.w * 100}%`, top: `${y / BODY.h * 100}%`, width: `${w / BODY.w * 100}%`, height: `${h / BODY.h * 100}%` });
const TUNING = { anchor: [1948, 668], size: 254 } as const;
const VOLUME = { anchor: [1940, 1076], size: 312 } as const;
const NEEDLE = { y: 498, w: 10, h: 66 } as const;
const BUTTON = { w: 280, h: 90, y: 902, playX: 793, nextX: 1328 } as const;
const DISPLAY = { x: 413, y: 624, w: 1260, h: 166 } as const;
const ACTION_LABEL: Record<RadioAction, string> = {
  connect: 'CONNECT', 'open-spotify': 'OPEN SPOTIFY APP', 'play-local': 'PLAY LOCAL LOFI', 'use-spotify': 'USE SPOTIFY', retry: 'RETRY',
};
const ZOOM_MS = 320;

function Knob({ src, anchor, size, angle, limit, label, min, max, now, text, onTurn, onRelease, onStep }: {
  src: string | undefined; anchor: readonly number[]; size: number; angle: number; limit: number; label: string;
  min: number; max: number; now: number; text: string;
  onTurn: (angle: number) => void; onRelease?: () => void; onStep: (steps: number) => void;
}) {
  const turning = useRef<{ pointer: number; angle: number } | null>(null);
  const pointerAt = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return pointerAngle(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2));
  };
  const key = (event: KeyboardEvent) => {
    const steps = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 2, PageDown: -2, End: Infinity, Home: -Infinity } as Record<string, number>)[event.key];
    if (steps === undefined) return;
    event.preventDefault(); onStep(steps);
  };
  return <div
    className="radio-knob"
    role="slider"
    tabIndex={0}
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={now}
    aria-valuetext={text}
    style={pct(anchor[0] - size / 2, anchor[1] - size / 2, size, size)}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); turning.current = { pointer: pointerAt(event), angle }; }}
    onPointerMove={event => {
      const t = turning.current; if (!t) return;
      const to = pointerAt(event);
      t.angle = turnedAngle(t.angle, t.pointer, to, limit); t.pointer = to;
      onTurn(t.angle);
    }}
    onPointerUp={() => { if (turning.current) { turning.current = null; onRelease?.(); } }}
    onPointerCancel={() => { if (turning.current) { turning.current = null; onRelease?.(); } }}
    onWheel={(event: WheelEvent) => onStep(event.deltaY < 0 ? 1 : -1)}
    onKeyDown={key}>
    <img src={src} alt="" draggable={false} style={{ transform: `rotate(${angle}deg)` }} />
  </div>;
}

function Symbol({ kind }: { kind: 'play' | 'pause' | 'next' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {kind === 'play' && <polygon points="8,5 19,12 8,19" />}
    {kind === 'pause' && <><rect x="6.5" y="5" width="4" height="14" /><rect x="13.5" y="5" width="4" height="14" /></>}
    {kind === 'next' && <><polygon points="5,5 15,12 5,19" /><rect x="16" y="5" width="3.5" height="14" /></>}
  </svg>;
}

/** The scene grows out of the radio prop into this close-up (a transform from the prop's box). Esc or a click outside zooms back. */
export function DeskRadioCloseup({ radio, reduced, origin, onClose }: { radio: DeskRadio; reduced: boolean; origin: () => DOMRect | null; onClose: () => void }) {
  const shade = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const [tuning, setTuning] = useState<number | null>(null);
  const tuningNow = useRef(0);
  const logo = asset('spotify-logo');
  // forward = zooming in. Reduced motion only fades.
  const zoom = (forward: boolean): Promise<unknown> => {
    const from = origin(), box = stage.current!.getBoundingClientRect();
    const small = !reduced && from ? `translate(${from.left + from.width / 2 - box.left - box.width / 2}px, ${from.top + from.height / 2 - box.top - box.height / 2}px) scale(${from.width / box.width})` : 'none';
    const options: KeyframeAnimationOptions = { duration: reduced ? 160 : ZOOM_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both', direction: forward ? 'normal' : 'reverse' };
    shade.current!.animate([{ opacity: 0 }, { opacity: 1 }], options);
    return stage.current!.animate([{ transform: small, opacity: reduced ? 0 : .5 }, { transform: 'none', opacity: 1 }], options).finished;
  };
  useLayoutEffect(() => { void zoom(true); shade.current!.focus(); }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    void zoom(false).then(onClose, onClose);
  };

  const volumeAngle = volumeToAngle(radio.volume);
  const tuningAngle = tuning ?? stationAngle(radio.station);
  const { display } = radio;
  const body = asset('radio-closeup-body');
  const buttonSprite = (name: 'play' | 'next'): CSSProperties => ({ backgroundImage: `url(${asset(`radio-closeup-button-${name}`)})` });
  return <div
    ref={shade}
    className="radio-closeup"
    role="dialog"
    aria-modal="true"
    aria-label="Radio"
    tabIndex={-1}
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="radio-stage" ref={stage}>
      <img className="radio-body" src={body} alt="" draggable={false} />
      <img
        className="radio-needle"
        src={asset('radio-closeup-needle')}
        alt=""
        draggable={false}
        data-dragging={tuning !== null}
        style={pct(needleX(tuningAngle) - NEEDLE.w / 2, NEEDLE.y - NEEDLE.h / 2, NEEDLE.w, NEEDLE.h)} />
      <Knob
        src={asset('radio-closeup-tuning-knob')}
        anchor={TUNING.anchor}
        size={TUNING.size}
        angle={tuningAngle}
        limit={TUNING_SWEEP}
        label="Station"
        min={0}
        max={STATIONS.length - 1}
        now={STATIONS.indexOf(radio.station)}
        text={radio.station}
        onTurn={angle => { tuningNow.current = angle; setTuning(angle); }}
        onRelease={() => { radio.tune(stationFromAngle(tuningNow.current)); setTuning(null); }}
        onStep={steps => radio.tune(stepStation(radio.station, steps))} />
      <Knob
        src={asset('radio-closeup-volume-knob')}
        anchor={VOLUME.anchor}
        size={VOLUME.size}
        angle={volumeAngle}
        limit={VOLUME_SWEEP}
        label="Volume"
        min={0}
        max={100}
        now={Math.round(radio.volume * 100)}
        text={`${Math.round(radio.volume * 100)}%`}
        onTurn={angle => radio.setVolume(Math.round(angleToVolume(angle) * 100) / 100)}
        onStep={steps => radio.setVolume(stepVolume(radio.volume, steps))} />
      <button
        className="radio-button"
        aria-label={radio.playing ? 'Pause' : 'Play'}
        style={{ ...pct(BUTTON.playX - BUTTON.w / 2, BUTTON.y - BUTTON.h / 2, BUTTON.w, BUTTON.h), ...buttonSprite('play') }}
        onClick={radio.toggle}>
        <Symbol kind={radio.playing ? 'pause' : 'play'} />
      </button>
      <button
        className="radio-button"
        aria-label="Next track"
        style={{ ...pct(BUTTON.nextX - BUTTON.w / 2, BUTTON.y - BUTTON.h / 2, BUTTON.w, BUTTON.h), ...buttonSprite('next') }}
        onClick={radio.next}>
        <Symbol kind="next" />
      </button>
      <div className="radio-display" style={pct(DISPLAY.x, DISPLAY.y, DISPLAY.w, DISPLAY.h)} aria-live="polite" data-status={radio.status}>
        <div className="radio-display-text">
          <small>{display.kicker}</small>
          <strong>{display.headline}</strong>
          <span>
            {display.sub}
            {display.actions.map(action => <button key={action} onClick={() => radio.act(action)}>{ACTION_LABEL[action]}</button>)}
          </span>
        </div>
        {display.spotify && <div className="radio-display-brand">
          {logo ? <img src={logo} alt="Spotify" draggable={false} /> : <b>Spotify</b>}
          <a href="https://open.spotify.com" target="_blank" rel="noreferrer">OPEN SPOTIFY</a>
        </div>}
      </div>
    </div>
    <details className="radio-setup">
      <summary>SPOTIFY SETUP</summary>
      {!radio.hasSpotify
        ? <p>Spotify works in the Solace Mac app. Here the radio plays the local lofi tracks.</p>
        : !radio.configured
          ? <p>Put SOLACE_SPOTIFY_CLIENT_ID in .env and restart the app (see the README, "Desk radio").</p>
          : <>
            {STATIONS.map(station => {
              const text = radio.playlists[station] ?? '';
              return <label key={station}>{station}
                <input
                  value={text}
                  placeholder="Paste a Spotify playlist link"
                  aria-invalid={text !== '' && playlistUri(text) === null}
                  onChange={event => radio.setPlaylist(station, event.target.value)} />
                <output>{text === '' ? '' : playlistUri(text) ? '✓' : 'not a playlist link'}</output>
              </label>;
            })}
            {radio.connection === 'connected' ? <button onClick={() => void radio.disconnect()}>DISCONNECT SPOTIFY</button> : <button onClick={() => void radio.connect()}>CONNECT SPOTIFY</button>}
          </>}
    </details>
  </div>;
}
