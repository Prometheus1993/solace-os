import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { DayPhase, WeatherMood } from '@solace/core';
import { DeskSprite } from './DeskSprite.tsx';
import { DeskObjectSprite } from './DeskObjectSprite.tsx';
import { DeskCat } from './DeskCat.tsx';
import { CityStories } from './CityStories.tsx';
import { WeatherFx } from './WeatherFx.tsx';
import type { DeskObjectId } from './desk-layout-state.ts';
import { catLight, lightLevels, poolVars, receiverVars, type ReceiverId } from './desk-light.ts';
import { MonitorScreen } from './MonitorScreen.tsx';
import { carLaneCount } from './city-story-motion.ts';
import type { DeskRadio } from './DeskPersonalTools.tsx';
import { deskAsset as asset } from './desk-assets.ts';
import { DeskLayoutHandles, type DeskLayoutControl } from './DeskLayoutEditor.tsx';

export const hasDeskSprites = [
  'desk-pano-sky',
  'desk-pano-far',
  'desk-pano-mid',
  'desk-pano-billboard-frame',
  'desk-pano-near',
  'desk-pano-window',
  'desk-pano-desk',
  'desk-monitor-atlas',
  'desk-books-atlas',
  'desk-keyboard-mouse-atlas',
  'desk-lamp-atlas'
].every(name => !!asset(name));
// `rank`: lanes below the current car density (carLaneCount) carry traffic, so a quiet hour keeps one car per depth.
const LANES = [
  { rank: 2, top: '15%', size: '3.4%', duration: '49s', delay: '-27s', direction: 'reverse', depth: 'far' },
  { rank: 4, top: '29%', size: '2.4%', duration: '67s', delay: '-41s', direction: 'normal', depth: 'far' },
  { rank: 0, top: '42%', size: '4.8%', duration: '38s', delay: '-8s', direction: 'normal', depth: 'far' },
  { rank: 5, top: '61%', size: '7%', duration: '31s', delay: '-19s', direction: 'normal', depth: 'middle' },
  { rank: 1, top: '74%', size: '9%', duration: '27s', delay: '-2s', direction: 'reverse', depth: 'middle' },
  { rank: 3, top: '32%', size: '12%', duration: '43s', delay: '-31s', direction: 'normal', depth: 'near' },
] as const;

/** Pointer-hover and keyboard-focus both drive one boolean (a hovered prop swaps to its lit frame). */
const hoverFocus = (set: (on: boolean) => void) => ({
  onPointerEnter: () => set(true), onPointerLeave: () => set(false), onFocus: () => set(true), onBlur: () => set(false),
});

export function DeskSpriteScene({ moving, reduced, syncing, skyPhase, skyMood, view, radio, layout, onFigure, onOpen, onTerminal, onRadio, onHologram, onLoad, onError }: {
  moving: boolean; reduced: boolean; syncing: boolean; skyPhase: DayPhase; skyMood: WeatherMood; view: string;
  radio: DeskRadio; onFigure: (index: number) => void;
  layout: DeskLayoutControl;
  onOpen: (view: 'library' | 'scratchpad') => void; onTerminal: () => void; onRadio: () => void; onHologram: () => void; onLoad: () => void; onError: () => void;
}) {
  const root = layout.scene;
  const [awake, setAwake] = useState(true);
  const [booksHover, setBooksHover] = useState(false);
  const [reaction, setReaction] = useState('');
  const [speakerFrame, setSpeakerFrame] = useState(0);
  useEffect(
    () => { if (!reaction) return; const timer = window.setTimeout(() => setReaction(''), 2400); return () => window.clearTimeout(timer); },
    [reaction]
  );
  // Both speakers loop their 4-frame atlas (160 ms each) while music plays; not synced to the audio. Still otherwise.
  const speakersPlaying = moving && radio.playing;
  useEffect(() => {
    setSpeakerFrame(0);
    if (!speakersPlaying) return;
    const timer = window.setInterval(() => setSpeakerFrame(previous => (previous + 1) % 4), 160);
    return () => window.clearInterval(timer);
  }, [speakersPlaying]);
  const levels = lightLevels(skyPhase, layout.values, awake);
  const sceneLight = useMemo(() => catLight(layout.values, levels), [layout.values, levels.lamp, levels.screen]);
  const sceneStyle = {
    '--lamp-level': levels.lamp, '--screen-level': levels.screen, '--desk-mask': `url(${asset('desk-pano-desk')})`, ...poolVars(layout.values),
  } as CSSProperties;
  // A light receiver carries its own warm and cool ellipses (percentages of its box) on top of its layout transform.
  const lit = (id: ReceiverId) => { const prop = layout.prop(id); return { ...prop, style: { ...prop.style, ...receiverVars(id, layout.values) } }; };
  const propSprite = (id: DeskObjectId, state?: number) => <DeskObjectSprite id={id} state={state} onError={onError} />;
  const accessory = (frame: number, name: string) => <DeskSprite
    src={asset('desk-accessories-atlas')}
    columns={4}
    rows={4}
    independent
    frame={frame}
    name={name}
    onError={onError} />;
  const panoLayer = (name: string, loaded?: () => void) => <img
    className={`desk-pano-layer desk-pano-${name}`}
    src={asset(`desk-pano-${name}`)}
    alt=""
    draggable={false}
    onLoad={loaded}
    onError={onError} />;
  const car = asset('cyberpunk-hovercar');
  const flightLanes = (depth: typeof LANES[number]['depth']) => car && LANES.filter(lane => lane.depth === depth && lane.rank < carLaneCount(skyPhase)).map(lane => (
    <div
      key={lane.rank}
      data-direction={lane.direction}
      className={`desk-flight-lane desk-flight-${lane.depth}`}
      style={{
        '--flight-top': lane.top,
        '--flight-size': lane.size,
        '--flight-duration': lane.duration,
        '--flight-delay': lane.delay,
        '--flight-direction': lane.direction
      } as CSSProperties}>
      <span className="desk-flight"><img src={car} alt="" draggable={false} /></span>
    </div>
  ));
  return <div
    ref={root}
    className="desk-sprite-scene"
    style={sceneStyle}
    onPointerDownCapture={layout.pointerDown}
    onPointerMoveCapture={layout.pointerMove}
    onPointerUpCapture={layout.pointerUp}
    onPointerCancelCapture={layout.pointerCancel}
    onLostPointerCapture={layout.pointerUp}
    onClickCapture={layout.suppressClick}
    onFocusCapture={layout.focusProp}
    onKeyDownCapture={layout.keyDown}>
    {/* The fixed room: seven full-scene layers, bottom to top, with the moving city between them. `desk-glass` = the window opening. */}
    <div className="desk-city" aria-hidden="true">
      {panoLayer('sky', onLoad)}
      <div className="desk-sky-tint" />
      {panoLayer('far')}
      <div className="desk-glass">
        <div className="desk-city-haze desk-haze-far" />
        <div className="desk-fog desk-fog-far" />
        {flightLanes('far')}
        <div className="desk-delivery-drone desk-delivery-drone-far">{accessory(14, 'distant delivery drone')}</div>
        <div className="desk-distant-traffic"><i /><i /><i /></div>
      </div>
      {panoLayer('mid')}
      {panoLayer('billboard-frame')}
      <div className="desk-glass">
        <div className="desk-fog desk-fog-mid" />
        <CityStories moving={moving} onError={onError} />
        <div className="desk-train-glint" />
        {flightLanes('middle')}
        <div className="desk-delivery-drone">{accessory(14, 'delivery drone')}</div>
        <div className="desk-extra-windows">
          {Array.from(
            { length: 24 },
            (_, i) => <i key={i} style={{ left: `${12 + (i * 17) % 76}%`, top: `${40 + (i * 13) % 50}%`, animationDelay: `${-i * 2.3}s` }} />
          )}
        </div>
      </div>
      {panoLayer('near')}
      <div className="desk-glass">
        <div className="desk-city-haze desk-haze-near" />
        {flightLanes('near')}
        <div className="desk-fog desk-fog-near" />
        <WeatherFx mood={skyMood} moving={moving} still={reduced} />
        <div className="desk-glass-reflection" />
      </div>
      {panoLayer('window')}
      {panoLayer('desk')}
      <div className="desk-table-light desk-table-warm" />
      <div className="desk-table-light desk-table-cool" />
      <div className="desk-train-glint desk-train-glint-desk" />
    </div>
    <div {...layout.prop('pipes')} className="desk-prop desk-prop-pipes" aria-hidden="true">{propSprite('pipes')}</div>
    <div {...layout.prop('hanging-plant')} className="desk-prop desk-prop-hanging-plant" aria-hidden="true">{propSprite('hanging-plant')}</div>
    <div {...layout.prop('charm')} className="desk-prop desk-prop-charm" aria-hidden="true">{propSprite('charm')}</div>
    <div {...layout.prop('shelf')} className="desk-prop desk-prop-shelf" aria-hidden="true">{propSprite('shelf')}</div>
    <button
      {...layout.prop('figure-one')}
      className="desk-prop desk-prop-figure desk-prop-figure-one"
      onClick={() => onFigure(0)}
      aria-label="Inspect the Wayfarer collectible">
      {propSprite('figure-one')}
      <span className="desk-prop-label">THE WAYFARER<small>INSPECT FIGURE</small></span>
    </button>
    <button
      {...layout.prop('figure-two')}
      className="desk-prop desk-prop-figure desk-prop-figure-two"
      onClick={() => onFigure(1)}
      aria-label="Inspect Little Relay collectible">
      {propSprite('figure-two')}
      <span className="desk-prop-label">LITTLE RELAY<small>INSPECT FIGURE</small></span>
    </button>
    <div {...layout.prop('lamp')} className="desk-prop desk-prop-lamp">
      {propSprite('lamp', 0)}
      <span className="desk-lamp-on">{propSprite('lamp', 1)}</span>
      <span className="desk-lamp-glow" aria-hidden="true" />
    </div>
    <button
      {...lit('books')}
      className="desk-prop desk-prop-books"
      aria-label="Open manga and books"
      {...hoverFocus(setBooksHover)}
      onClick={() => onOpen('library')}>
      {propSprite('books', booksHover || view === 'library' ? 1 : 0)}<span className="desk-prop-label">LIBRARY <small>MANGA + BOOKS</small></span>
    </button>
    <div {...layout.prop('monitor')} className="desk-prop desk-prop-monitor" data-awake={awake}>
      {propSprite('monitor', awake ? 1 : 0)}
      {awake ? <MonitorScreen moving={moving} onOpenTerminal={onTerminal} /> : <button className="desk-wake-monitor" onClick={() => setAwake(true)}>WAKE DISPLAY</button>}
      <button
        className="desk-monitor-power"
        aria-label={awake ? 'Put monitor to sleep' : 'Wake monitor'}
        aria-pressed={awake}
        onClick={() => setAwake(!awake)} />
    </div>
    <button
      {...layout.prop('hologram')}
      className="desk-prop desk-prop-hologram"
      data-syncing={syncing}
      onClick={onHologram}
      aria-label={syncing ? 'Open the body showcase. Garmin sync in progress.' : 'Open the body showcase'}>
      <span className="desk-hologram-glow" aria-hidden="true" />
      <span className="desk-hologram-base">{propSprite('hologram')}</span>
      <span className="desk-prop-label">COMPANION ONLINE<small>{syncing ? 'SYNCING…' : 'SHOWCASE'}</small></span>
    </button>
    <button
      {...layout.prop('radio')}
      className="desk-prop desk-prop-radio"
      data-playing={radio.playing && radio.volume > 0}
      onClick={onRadio}
      aria-label={`Open the radio. ${radio.playing ? 'Playing' : 'Paused'}: ${radio.display.headline}`}>
      {propSprite('radio')}
      <span className="desk-radio-led" aria-hidden="true" />
      <span className="desk-prop-label">RADIO<small>{radio.playing ? radio.display.headline : 'TUNE IN'}</small></span>
    </button>
    {[
      0,
      1
    ].map(i => <button
      key={i}
      {...layout.prop(i === 0 ? 'speaker-0' : 'speaker-1')}
      className={`desk-prop desk-prop-speaker desk-prop-speaker-${i}`}
      aria-label={`Open the radio (${i === 0 ? 'left' : 'right'} speaker)`}
      onClick={onRadio}>
      {propSprite(i === 0 ? 'speaker-0' : 'speaker-1', speakerFrame)}
      <span className="desk-prop-label">OPEN RADIO</span>
    </button>)}
    <button
      {...lit('notebook')}
      className="desk-prop desk-prop-notebook"
      onClick={() => onOpen('scratchpad')}
      aria-label="Open your saved scratchpad">
      {propSprite('notebook')}
      <span className="desk-prop-label">SCRATCHPAD<small>YOUR NEXT SMALL IDEA</small></span>
    </button>
    <button
      {...layout.prop('plant')}
      className="desk-prop desk-prop-plant"
      data-reaction={reaction === 'plant'}
      onClick={() => setReaction('plant')}
      aria-label="Give the desk plant a little attention">
      {propSprite('plant')}
      <span className="desk-prop-label">A LITTLE GREEN<small>{reaction === 'plant' ? 'GROWING AT ITS OWN PACE.' : 'TAKE A BREATH'}</small></span>
    </button>
    <button
      {...layout.prop('mug')}
      className="desk-prop desk-prop-mug"
      data-reaction={reaction === 'mug'}
      onClick={() => setReaction('mug')}
      aria-label="Take a quiet coffee break">
      {propSprite('mug')}
      <span className="desk-coffee-steam" aria-hidden="true">∿</span>
      <span className="desk-prop-label">COFFEE BREAK<small>{reaction === 'mug' ? 'ONE SLOW BREATH.' : 'A MOMENT TO YOURSELF'}</small></span>
    </button>
    <span
      className="desk-reaction-announcement"
      role="status">
      {reaction === 'plant'
        ? 'A little green. Growing at its own pace.'
        : reaction === 'mug' ? 'Coffee break. One slow breath.' : reaction === 'companion' ? 'Your companion perks up and gives a quiet purr.' : ''}
    </span>
    <div {...lit('keyboard')} className="desk-prop desk-prop-keyboard">{propSprite('keyboard')}</div>
    <div {...lit('mouse')} className="desk-prop desk-prop-mouse">{propSprite('mouse')}</div>
    <div {...layout.prop('companion')} className="desk-prop desk-prop-companion" aria-hidden="true">{propSprite('companion')}</div>
    <DeskCat
      moving={moving}
      reduced={reduced}
      layout={layout.values}
      light={sceneLight}
      petted={reaction === 'companion'}
      onPet={() => setReaction('companion')}
      onError={onError} />
    <DeskLayoutHandles layout={layout} />
  </div>;
}
