import { useEffect, useRef, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { dayPhase, weatherMood } from '@solace/core/domain';
import { DeskTerminalCloseup } from './DeskTerminalCloseup.tsx';
import { useTerminalRoute } from './use-terminal-route.ts';
import { terminalHash, type TerminalTarget } from './terminal-route.ts';
import { navigate } from '../navigate.ts';
import { DeskHud } from './DeskHud.tsx';
import { SCAN_POINTS, recoveryReading } from './scanner-data.ts';
import { DeskHologramCloseup } from './DeskHologramCloseup.tsx';
import { DeskBookcaseCloseup } from './DeskBookcaseCloseup.tsx';
import type { SyncReport } from './sync-report.ts';
import { forcedSkyPhase } from './desk-sky.ts';
import { forcedSkyMood } from './desk-weather.ts';
import '../../styles/components/desktop.css';
import '../../styles/components/desktop-sprites.css';
import '../../styles/components/desk-radio.css';
import '../../styles/components/desk-sky.css';
import '../../styles/components/desk-weather.css';
import '../../styles/components/desk-surface.css';
import { DeskSpriteScene, hasDeskSprites } from './DeskSpriteScene.tsx';
import { CollectiblePanel, Scratchpad, useDeskRadio } from './DeskPersonalTools.tsx';
import { DeskRadioCloseup } from './DeskRadioCloseup.tsx';
import { DeskLayoutEditor, useDeskLayout } from './DeskLayoutEditor.tsx';
import { DeskCanvas } from './DeskCanvas.tsx';
import { readStored, reducedMotionQuery, writeStored } from './desk-browser.ts';
import { useVisited } from './use-visited.ts';

const SURFACES = [
  { id: 'scratchpad', label: 'Scratchpad', path: 'DESK / PERSONAL NOTES', origin: 'notebook', nav: 'NOTES' },
  { id: 'collection', label: 'Small Companions', path: 'SHELF / COLLECTION', origin: 'shelf', nav: 'FIGURES' },
] as const;
type Surface = typeof SURFACES[number]['id'];
/** `nav` = label of the header button that opens the surface (surfaces sharing an origin share one button). */
type SurfaceItem = { id: Surface; label: string; path: string; origin: string; nav?: string };
const SURFACE_LIST: readonly SurfaceItem[] = SURFACES;
type View = Surface | 'desk';
export type DesktopHubProps = {
  dto: DashboardDTO;
  syncing: boolean;
  busy: boolean;
  syncReport: SyncReport | null;
  onSyncGarmin: () => void;
  onReload: () => void | Promise<void>;
};

export default function DesktopHub(props: DesktopHubProps) {
  const layout = useDeskLayout();
  const radio = useDeskRadio();
  const [figure, setFigure] = useState(0);
  const [radioOpen, setRadioOpen] = useState(false);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [bookcaseOpen, setBookcaseOpen] = useState(false);
  const terminal = useTerminalRoute();
  const terminalOpen = terminal !== null;
  const [view, setView] = useState<View>('desk');
  const [visited, visit] = useVisited<Surface>();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!hasDeskSprites);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => reducedMotionQuery().matches);
  const [now, setNow] = useState(() => new Date());
  const [ambience, setAmbience] = useState(() => readStored('solace.desk.ambience') !== 'off');
  const scene = useRef<HTMLDivElement>(null);
  const surfaces = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const deskButton = useRef<HTMLButtonElement>(null);
  const layoutButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const current = SURFACE_LIST.find(item => item.id === view);
  const moving = ambience && visible && !reduced && view === 'desk' && !layout.editing;
  // The sky and room looks hook onto data-sky-phase (desk-sky.css); the weather look hooks onto data-sky-mood (desk-weather.css).
  const sky = props.dto.sky;
  const skyPhase = (import.meta.env.DEV ? forcedSkyPhase(window.location.search) : null) ?? dayPhase(now, sky?.sunrise, sky?.sunset);
  const skyMood = (import.meta.env.DEV ? forcedSkyMood(window.location.search) : null) ?? (sky ? weatherMood(sky.weatherCode) : 'clear');
  const open = (next: View) => {
    if (layout.editing || showcaseOpen || bookcaseOpen) return;
    if (next === view) return;
    if (view === 'desk' && document.activeElement instanceof HTMLElement) returnTo.current = document.activeElement;
    if (next !== 'desk') visit(next);
    setView(next);
  };
  useEffect(() => {
    const media = reducedMotionQuery();
    const updateMotion = () => setReduced(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => { media.removeEventListener('change', updateMotion); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);
  // The phase follows the clock by itself: re-read once a minute, and at once when the page shows again.
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [visible]);
  // A link or hash that opens the terminal closes any desk surface first.
  useEffect(() => { if (terminalOpen) { setView('desk'); setShowcaseOpen(false); setBookcaseOpen(false); } }, [terminalOpen]);
  useEffect(() => {
    if (scene.current) scene.current.inert = view !== 'desk' || radioOpen || terminalOpen || showcaseOpen || bookcaseOpen;
    if (radioOpen || terminalOpen || showcaseOpen || bookcaseOpen) return;
    if (layout.editing) { wasEditing.current = true; return; }
    if (wasEditing.current) { wasEditing.current = false; layoutButton.current?.focus({ preventScroll: true }); return; }
    if (view !== 'desk') surfaces.current?.querySelector<HTMLElement>(`[data-surface="${view}"]`)?.focus({ preventScroll: true });
    else if (returnTo.current) (returnTo.current.isConnected ? returnTo.current : deskButton.current)?.focus({ preventScroll: true });
  }, [view, layout.editing, radioOpen, terminalOpen, showcaseOpen, bookcaseOpen]);
  const openRadio = () => {
    if (layout.editing || radioOpen || showcaseOpen || bookcaseOpen) return;
    if (document.activeElement instanceof HTMLElement) returnTo.current = document.activeElement;
    setRadioOpen(true);
  };
  const openShowcase = () => {
    if (layout.editing || showcaseOpen || radioOpen || terminalOpen || bookcaseOpen) return;
    if (document.activeElement instanceof HTMLElement) returnTo.current = document.activeElement;
    setShowcaseOpen(true);
  };
  const openBookcase = () => {
    if (layout.editing || showcaseOpen || radioOpen || terminalOpen || bookcaseOpen) return;
    if (document.activeElement instanceof HTMLElement) returnTo.current = document.activeElement;
    setBookcaseOpen(true);
  };
  // The terminal reopens where it was last open (the drafts in its views survive anyway).
  const lastTerminal = useRef<TerminalTarget>({ folder: 'body', view: 'overview' });
  if (terminal) lastTerminal.current = terminal;
  const openTerminal = (at: TerminalTarget = lastTerminal.current) => {
    if (layout.editing || terminalOpen || radioOpen || showcaseOpen || bookcaseOpen) return;
    if (document.activeElement instanceof HTMLElement) returnTo.current = document.activeElement;
    navigate(terminalHash(at));
  };
  const toggleAmbience = () => {
    setAmbience(previous => { const next = !previous; writeStored('solace.desk.ambience', next ? 'on' : 'off'); return next; });
  };

  return <section
    className={`desktop-hub desktop-sprite-hub desk-view-${view}`}
    data-editing={layout.editing}
    data-motion={moving}
    data-origin={current?.origin ?? 'monitor'}
    aria-label="Your desktop above the city"
    onKeyDown={event => {
    if (event.key === 'Escape' && layout.editing) { event.preventDefault(); layout.cancel(); return; }
    if (event.key === 'Escape'
      && !event.defaultPrevented
      && view !== 'desk'
      && !document.querySelector('dialog[open]')) { event.preventDefault(); open('desk'); }
  }}>
    <audio
      ref={radio.audio}
      src={radio.src}
      preload="none"
      onPlaying={radio.onPlaying}
      onPause={radio.onPause}
      onEnded={radio.onEnded}
      onError={radio.onError} />
    <DeskCanvas>
      <div ref={scene} className="desk-scenery" data-sky-phase={skyPhase} data-sky-mood={skyMood} aria-hidden={view !== 'desk' || undefined}>
        <DeskSpriteScene
          moving={moving}
          reduced={reduced}
          syncing={props.syncing}
          skyPhase={skyPhase}
          skyMood={skyMood}
          radio={radio}
          layout={layout}
          onFigure={index => { setFigure(index); open('collection'); }}
          onOpen={open}
          onTerminal={() => openTerminal()}
          onRadio={openRadio}
          onHologram={openShowcase}
          onBookcase={openBookcase}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)} />
      </div>
    </DeskCanvas>

    <header className="desk-header">
      <button ref={deskButton} className="desk-home" onClick={() => open('desk')} aria-label="Return to your desk"><span>07</span> PERSONAL DESK</button>
      <nav aria-label="Desktop tools">
        <button disabled={layout.editing} aria-pressed={bookcaseOpen} onClick={openBookcase}>LIBRARY</button>
        {SURFACE_LIST.filter(item => item.nav).map(item => <button
          key={item.id}
          disabled={layout.editing}
          aria-pressed={current?.origin === item.origin}
          onClick={() => open(item.id)}>
          {item.nav}
        </button>)}
        <button disabled={layout.editing} aria-pressed={terminalOpen} onClick={() => openTerminal()}>TERMINAL</button>
        <button disabled={layout.editing} aria-pressed={radioOpen} onClick={openRadio}>RADIO{radio.playing ? ' ●' : ''}</button>
      </nav>
      <div className="desk-settings">
        <DeskHud dto={props.dto} />
        <button
          ref={layoutButton}
          disabled={layout.editing}
          aria-pressed={layout.editing}
          onClick={() => { open('desk'); layout.begin(); }}>EDIT LAYOUT</button>
        <button
          aria-label={ambience ? 'Pause ambient movement' : 'Enable ambient movement'}
          aria-pressed={ambience}
          onClick={toggleAmbience}>MOTION {ambience ? 'ON' : 'OFF'}
        </button>
      </div>
    </header>
    {radioOpen && <DeskRadioCloseup
      radio={radio}
      reduced={reduced}
      origin={() => scene.current?.querySelector('.desk-prop-radio')?.getBoundingClientRect() ?? null}
      onClose={() => setRadioOpen(false)} />}
    {showcaseOpen && <DeskHologramCloseup
      dto={props.dto}
      syncing={props.syncing}
      busy={props.busy}
      syncReport={props.syncReport}
      reduced={reduced}
      moving={ambience && visible && !reduced}
      origin={() => scene.current?.querySelector('.desk-prop-hologram')?.getBoundingClientRect() ?? null}
      onSync={props.onSyncGarmin}
      onClose={() => setShowcaseOpen(false)} />}
    {bookcaseOpen && <DeskBookcaseCloseup
      series={props.dto.series}
      reduced={reduced}
      origin={() => scene.current?.querySelector('.desk-prop-books')?.getBoundingClientRect() ?? null}
      onPick={target => navigate(terminalHash(target))}
      onClose={() => setBookcaseOpen(false)} />}
    <DeskTerminalCloseup
      dto={props.dto}
      target={terminal}
      reduced={reduced}
      origin={() => scene.current?.querySelector('.desk-prop-monitor .desk-monitor')?.getBoundingClientRect() ?? null}
      onReload={props.onReload} />
    {layout.editing && <DeskLayoutEditor layout={layout} />}
    {!layout.editing && layout.message && <p className="desk-layout-status" role="status">{layout.message}</p>}
    {view === 'desk'
      && (!loaded || failed)
      && <p className="desk-loading" role="status">{failed ? 'Some sprite artwork is unavailable. Your tools remain accessible.' : 'Opening your desk…'}</p>}

    <div ref={surfaces} className="desk-surfaces">
      {SURFACE_LIST.map(surface => visited.has(surface.id)
        && <section key={surface.id} data-surface={surface.id} className="desk-surface" hidden={view !== surface.id} tabIndex={-1} aria-label={surface.label}>
        <header className="desk-surface-header">
          <div><small>{surface.path}</small><h1>{surface.label}</h1></div>
          <button className="parts-button" onClick={() => open('desk')}>← DESK <kbd>ESC</kbd></button>
        </header>
        <div className="desk-surface-content">
          {surface.id === 'scratchpad' && <Scratchpad />}
          {surface.id === 'collection'
            && <CollectiblePanel selected={figure} onSelect={setFigure} />}
        </div>
      </section>)}
    </div>
    <footer className="desk-signals" aria-label="Always equipped signals">
      {SCAN_POINTS.map(point => {
        const recovery = point.id === 'sleep' || point.id === 'hrv' || point.id === 'bodyBattery' ? recoveryReading(props.dto, point.id) : null;
        const stat = point.id === 'strength' || point.id === 'stamina' || point.id === 'leanness' ? props.dto.stats[point.id] : null;
        const value = recovery?.value ?? stat?.progressPct ?? null;
        const max = point.id === 'hrv' ? Math.max(1, value ?? 0, ...recovery!.points.map(item => item.value).filter(Number.isFinite)) : 100;
        const context = recovery
          ? `${recovery.source}${recovery.stale != null && recovery.stale > 0 ? ` · ${recovery.stale}D OLD` : ''}${point.id === 'hrv' ? ' · VS PEAK' : ''}`
          : `${stat!.progressPct}% TO NEXT LEVEL`;
        const label = recovery ? value == null ? '—' : `${Math.round(value)}${point.id === 'hrv' ? ' ms' : '/100'}` : `LV ${stat!.level}`;
        return <div className="desk-signal" key={point.id}>
          <span>{point.label}<strong>{label}</strong></span>
          <i aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, (value ?? 0) / max * 100))}%` }} /></i>
          <small>{context}</small>
        </div>;
      })}
    </footer>
  </section>;
}
