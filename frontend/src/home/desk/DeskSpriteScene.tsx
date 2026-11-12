import { useEffect, useState, type CSSProperties } from 'react';
import type { DayPhase } from '@solace/core';
import { AnimatedAvatar } from '../AnimatedAvatar.tsx';
import { avatarPoseUrls, avatarUrl } from '../avatar.ts';
import { Icon } from '../icons.tsx';
import type { AvatarMood } from './avatar-state.ts';
import { DeskSprite } from './DeskSprite.tsx';
import { DeskObjectSprite } from './DeskObjectSprite.tsx';
import { DeskCat } from './DeskCat.tsx';
import { CityStories } from './CityStories.tsx';
import type { DeskObjectId } from './desk-layout-state.ts';
import { puckFrame } from './sprite-atlas.ts';
import { lampFrame } from './desk-sky.ts';
import { carLaneCount } from './city-story-motion.ts';
import type { DeskRadio } from './DeskPersonalTools.tsx';
import { deskAsset as asset } from './desk-assets.ts';
import { DeskLayoutHandles, type DeskLayoutControl } from './DeskLayoutEditor.tsx';

export const hasDeskSprites = [
  'desk-city-far',
  'desk-surface',
  'desk-monitor-atlas',
  'desk-books-atlas',
  'desk-puck-atlas',
  'desk-window-frame',
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

export function DeskSpriteScene({ moving, reduced, syncing, skyPhase, view, avatar, radio, layout, onFigure, onOpen, onLoad, onError }: {
  moving: boolean; reduced: boolean; syncing: boolean; skyPhase: DayPhase; view: string; avatar: { mood: AvatarMood; label: string };
  radio: DeskRadio; onFigure: (index: number) => void;
  layout: DeskLayoutControl;
  onOpen: (view: 'terminal' | 'library' | 'signals' | 'radio' | 'scratchpad') => void; onLoad: () => void; onError: () => void;
}) {
  const root = layout.scene;
  const [awake, setAwake] = useState(true);
  const [booksHover, setBooksHover] = useState(false), [puckHover, setPuckHover] = useState(false);
  const [phase, setPhase] = useState(0);
  const [reaction, setReaction] = useState('');
  useEffect(
    () => { if (!reaction) return; const timer = window.setTimeout(() => setReaction(''), 2400); return () => window.clearTimeout(timer); },
    [reaction]
  );
  const propSprite = (id: DeskObjectId, state?: number) => <DeskObjectSprite id={id} state={state} onError={onError} />;
  const accessory = (frame: number, name: string) => <DeskSprite
    src={asset('desk-accessories-atlas')}
    columns={4}
    rows={4}
    independent
    frame={frame}
    name={name}
    onError={onError} />;
  useEffect(() => {
    if (!moving || !syncing) return;
    const timer = window.setInterval(() => setPhase(previous => previous + 1), 650);
    return () => window.clearInterval(timer);
  }, [moving, syncing]);
  const car = asset('cyberpunk-hovercar');
  const flightLanes = (near: boolean) => car && LANES.filter(lane => (lane.depth === 'near') === near && lane.rank < carLaneCount(skyPhase)).map(lane => (
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
    onPointerDownCapture={layout.pointerDown}
    onPointerMoveCapture={layout.pointerMove}
    onPointerUpCapture={layout.pointerUp}
    onPointerCancelCapture={layout.pointerCancel}
    onLostPointerCapture={layout.pointerUp}
    onClickCapture={layout.suppressClick}
    onFocusCapture={layout.focusProp}
    onKeyDownCapture={layout.keyDown}>
    <div {...layout.prop('window')} className="desk-prop desk-prop-window-group">
    <div className="desk-city" aria-hidden="true">
      {asset('desk-city-far') && <img className="desk-city-far" src={asset('desk-city-far')} alt="" draggable={false} onLoad={onLoad} onError={onError} />}
      {asset('desk-city-far') && <img className="desk-city-far desk-city-far-second" src={asset('desk-city-far')} alt="" draggable={false} onError={onError} />}
      <div className="desk-city-haze desk-haze-far" />
      <div className="desk-sky-tint" />
      <CityStories moving={moving && !layout.values.window?.hidden} onError={onError} />
      {flightLanes(false)}
      <div className="desk-delivery-drone">{accessory(14, 'delivery drone')}</div>
      <div className="desk-delivery-drone desk-delivery-drone-far">{accessory(14, 'distant delivery drone')}</div>
      <div className="desk-extra-windows">
        {Array.from(
          { length: 24 },
          (_, i) => <i key={i} style={{ left: `${12 + (i * 17) % 76}%`, top: `${21 + (i * 13) % 64}%`, animationDelay: `${-i * 2.3}s` }} />
        )}
      </div>
      <div className="desk-city-haze desk-haze-near" />
      {flightLanes(true)}
      <div className="desk-distant-traffic"><i /><i /><i /></div>
      <div className="desk-rain">
        {Array.from(
          { length: 18 },
          (_, index) => <i
            key={index}
            style={{ left: `${4 + index * 5.3}%`, '--rain-delay': `${-index * 1.7}s`, '--rain-duration': `${8 + index % 5}s` } as CSSProperties} />
        )}
      </div>
      <div className="desk-glass-reflection" />
    </div>
    <div className="desk-prop desk-prop-window"><DeskSprite src={asset('desk-window-frame')} name="window frame" onError={onError} /></div>
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
    <div {...layout.prop('surface')} className="desk-prop desk-prop-surface">{propSprite('surface')}</div>
    <div {...layout.prop('lamp')} className="desk-prop desk-prop-lamp">
      {propSprite('lamp', lampFrame(skyPhase))}
      <span className="desk-lamp-glow" aria-hidden="true" />
    </div>
    <button
      {...layout.prop('books')}
      className="desk-prop desk-prop-books"
      aria-label="Open manga and books"
      {...hoverFocus(setBooksHover)}
      onClick={() => onOpen('library')}>
      {propSprite('books', booksHover || view === 'library' ? 1 : 0)}<span className="desk-prop-label">LIBRARY <small>MANGA + BOOKS</small></span>
    </button>
    <div {...layout.prop('monitor')} className="desk-prop desk-prop-monitor" data-awake={awake}>
      {propSprite('monitor', awake ? 1 : 0)}
      {awake ? <div className="desk-monitor">
        <span className="desk-monitor-caption">PERSONAL / ONLINE</span>
        <div className="desk-folders"><button onClick={() => onOpen('terminal')}><Icon name="folder" size={40} /><span>TERMINAL</span></button></div>
        <span className="desk-monitor-footer">YOUR FILES. YOUR PACE.</span>
      </div> : <button className="desk-wake-monitor" onClick={() => setAwake(true)}>WAKE DISPLAY</button>}
      <button
        className="desk-monitor-power"
        aria-label={awake ? 'Put monitor to sleep' : 'Wake monitor'}
        aria-pressed={awake}
        onClick={() => setAwake(!awake)} />
    </div>
    <button
      {...layout.prop('hologram')}
      className="desk-prop desk-prop-hologram"
      onClick={() => onOpen('signals')}
      aria-label={`Open signals. Hologram avatar: ${avatar.label}`}>
      <span className="desk-hologram-person">
        {moving && avatar.mood === 'neutral' ? <AnimatedAvatar /> : <img src={avatarPoseUrls[avatar.mood] ?? avatarUrl} alt="" draggable={false} />}
      </span>
      <span className="desk-hologram-beam" aria-hidden="true" />
      <span className="desk-hologram-base">{propSprite('hologram')}</span>
      <span className="desk-prop-label">COMPANION ONLINE<small>{avatar.label} / SIGNALS</small></span>
    </button>
    <button
      {...layout.prop('radio')}
      className="desk-prop desk-prop-radio"
      data-playing={radio.playing && !radio.muted && radio.volume > 0}
      onClick={() => onOpen('radio')}
      aria-label={`Open lo-fi radio. ${radio.playing ? 'Playing' : 'Paused'}: ${radio.track.title}`}>
      {propSprite('radio')}
      <span className="desk-radio-led" aria-hidden="true" />
      <span className="desk-prop-label">AFTER HOURS RADIO<small>{radio.playing ? radio.track.title : 'OPEN LO-FI / TUNE IN'}</small></span>
    </button>
    {[
      0,
      1
    ].map(i => <button
      key={i}
      {...layout.prop(i === 0 ? 'speaker-0' : 'speaker-1')}
      className={`desk-prop desk-prop-speaker desk-prop-speaker-${i}`}
      aria-label={`${radio.muted ? 'Unmute' : 'Mute'} radio from ${i === 0 ? 'left' : 'right'} speaker`}
      aria-pressed={radio.muted}
      onClick={radio.toggleMute}>
      {propSprite(i === 0 ? 'speaker-0' : 'speaker-1')}
      <span className="desk-prop-label">{radio.muted ? 'UNMUTE' : 'MUTE'} RADIO</span>
    </button>)}
    <button
      {...layout.prop('headphones')}
      className="desk-prop desk-prop-headphones"
      onClick={radio.cycleMood}
      aria-label={`Change lo-fi mood. Current mood: ${radio.mood}`}>
      {propSprite('headphones')}
      <span className="desk-prop-label">CHANGE FREQUENCY<small>{radio.mood.toUpperCase()} / CLICK TO CYCLE</small></span>
    </button>
    <button
      {...layout.prop('notebook')}
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
    <div {...layout.prop('keyboard')} className="desk-prop desk-prop-keyboard">{propSprite('keyboard')}</div>
    <div {...layout.prop('mouse')} className="desk-prop desk-prop-mouse">{propSprite('mouse')}</div>
    <button
      {...layout.prop('puck')}
      className="desk-prop desk-prop-puck"
      aria-label={syncing ? 'Open biomonitor puck. Garmin sync in progress.' : 'Open biomonitor puck: health, Garmin sync and gym log'}
      {...hoverFocus(setPuckHover)}
      onClick={() => onOpen('signals')}>
      {propSprite('puck', puckFrame(syncing, puckHover || ['signals', 'sync', 'gym'].includes(view), moving ? phase : 0))}
      <span className="desk-prop-label">BIOMONITOR <small>{syncing ? 'SYNCING…' : 'SIGNALS / SYNC / GYM'}</small></span>
    </button>
    <div {...layout.prop('companion')} className="desk-prop desk-prop-companion" aria-hidden="true">{propSprite('companion')}</div>
    <DeskCat
      moving={moving}
      reduced={reduced}
      layout={layout.values}
      petted={reaction === 'companion'}
      onPet={() => setReaction('companion')}
      onError={onError} />
    <DeskLayoutHandles layout={layout} />
  </div>;
}
