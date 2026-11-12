import { useEffect, useRef, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { dayPhase, weatherMood } from '@solace/core/domain';
import { SchoolTasks } from '../../tabs/SchoolTasks.tsx';
import { StrengthLog } from '../../tabs/StrengthLog.tsx';
import { TerminalExplorer } from './TerminalExplorer.tsx';
import { ShardPanel } from './ShardPanel.tsx';
import { DeckPanel } from './DeckPanel.tsx';
import { ScannerPanel } from './ScannerPanel.tsx';
import { SCAN_POINTS, recoveryReading, type ScanMetric } from './scanner-data.ts';
import { avatarState } from './avatar-state.ts';
import '../../styles/components/desk-panels.css';
import '../../styles/components/desktop.css';
import '../../styles/components/desktop-sprites.css';
import { DeskSpriteScene, hasDeskSprites } from './DeskSpriteScene.tsx';
import { CollectiblePanel, RadioPanel, Scratchpad, useDeskRadio } from './DeskPersonalTools.tsx';
import { DeskLayoutEditor, useDeskLayout } from './DeskLayoutEditor.tsx';
import { DeskCanvas } from './DeskCanvas.tsx';
import { readStored, reducedMotionQuery, writeStored } from './desk-browser.ts';
import { courseNames } from './school-courses.ts';
import { useVisited } from './use-visited.ts';

const SURFACES = [
  { id: 'school', label: 'School', path: 'WORKSPACE / SCHOOL', origin: 'monitor', nav: 'WORKSPACE' },
  { id: 'terminal', label: 'Terminal', path: 'WORKSPACE / PERSONAL FILES', origin: 'monitor' },
  { id: 'library', label: 'Library', path: 'COLLECTION / MANGA + BOOKS', origin: 'books', nav: 'LIBRARY' },
  { id: 'signals', label: 'Signals', path: 'PUCK / BIOMONITOR', origin: 'puck', nav: 'PUCK' },
  { id: 'sync', label: 'Sync', path: 'PUCK / GARMIN UPLINK', origin: 'puck' },
  { id: 'gym', label: 'Gym log', path: 'PUCK / MANUAL TRAINING LOG', origin: 'puck' },
  { id: 'radio', label: 'After Hours Radio', path: 'DESK / OPEN LO-FI', origin: 'radio', nav: 'RADIO' },
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
  onSyncGarmin: () => void;
  onReload: () => void | Promise<void>;
};

export default function DesktopHub(props: DesktopHubProps) {
  const layout = useDeskLayout();
  const radio = useDeskRadio();
  const [figure, setFigure] = useState(0);
  const [view, setView] = useState<View>('desk');
  const [visited, visit] = useVisited<Surface>();
  const [metric, setMetric] = useState<ScanMetric>('sleep');
  const [course, setCourse] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!hasDeskSprites);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reduced, setReduced] = useState(() => reducedMotionQuery().matches);
  const [ambience, setAmbience] = useState(() => readStored('solace.desk.ambience') !== 'off');
  const scene = useRef<HTMLDivElement>(null);
  const surfaces = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const deskButton = useRef<HTMLButtonElement>(null);
  const layoutButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const current = SURFACE_LIST.find(item => item.id === view);
  const moving = ambience && visible && !reduced && view === 'desk' && !layout.editing;
  const avatar = avatarState(props.dto);
  // Not styled yet: the sky, room and weather looks hook onto these two attributes later (#17).
  const sky = props.dto.sky;
  const skyPhase = dayPhase(new Date(), sky?.sunrise, sky?.sunset);
  const skyMood = sky ? weatherMood(sky.weatherCode) : undefined;
  const open = (next: View) => {
    if (layout.editing) return;
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
  useEffect(() => {
    if (scene.current) scene.current.inert = view !== 'desk';
    if (layout.editing) { wasEditing.current = true; return; }
    if (wasEditing.current) { wasEditing.current = false; layoutButton.current?.focus({ preventScroll: true }); return; }
    if (view !== 'desk') surfaces.current?.querySelector<HTMLElement>(`[data-surface="${view}"]`)?.focus({ preventScroll: true });
    else if (returnTo.current) (returnTo.current.isConnected ? returnTo.current : deskButton.current)?.focus({ preventScroll: true });
  }, [view, layout.editing]);
  const toggleAmbience = () => {
    setAmbience(previous => { const next = !previous; writeStored('solace.desk.ambience', next ? 'on' : 'off'); return next; });
  };
  const saved = async () => { await props.onReload(); };

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
      onError={radio.onError}
      onTimeUpdate={radio.onTimeUpdate}
      onLoadedMetadata={radio.onTimeUpdate} />
    <DeskCanvas>
      <div ref={scene} className="desk-scenery" data-sky-phase={skyPhase} data-sky-mood={skyMood} aria-hidden={view !== 'desk' || undefined}>
        <DeskSpriteScene
          moving={moving}
          reduced={reduced}
          syncing={props.syncing}
          view={view}
          avatar={avatar}
          radio={radio}
          layout={layout}
          onFigure={index => { setFigure(index); open('collection'); }}
          onOpen={open}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)} />
      </div>
    </DeskCanvas>

    <header className="desk-header">
      <button ref={deskButton} className="desk-home" onClick={() => open('desk')} aria-label="Return to your desk"><span>07</span> PERSONAL DESK</button>
      <nav aria-label="Desktop tools">
        {SURFACE_LIST.filter(item => item.nav).map(item => <button
          key={item.id}
          disabled={layout.editing}
          aria-pressed={current?.origin === item.origin}
          onClick={() => open(item.id)}>
          {item.nav}
          {item.id === 'radio' && radio.playing ? ' ●' : ''}
        </button>)}
      </nav>
      <div className="desk-settings">
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
          <button onClick={() => open('desk')}>← DESK <kbd>ESC</kbd></button>
        </header>
        <nav
          className="desk-surface-tabs"
          aria-label="Work surfaces">
          {SURFACE_LIST.filter(item => item.origin === surface.origin).map(item => <button
            key={item.id}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => open(item.id)}>
            {item.label}
          </button>)}
        </nav>
        <div className="desk-surface-content">
          {surface.id === 'school'
            && <div className="desk-school">
              <nav aria-label="School folders">
                <button aria-pressed={course === undefined} onClick={() => setCourse(undefined)}>▤ All tasks</button>
                {courseNames(props.dto.schoolTasks).map(name => <button
                  key={name}
                  aria-pressed={course === name}
                  onClick={() => setCourse(name)}>▤ {name}
                </button>)}
              </nav>
              <div><SchoolTasks compact courseFilter={course} dto={props.dto} onReload={saved} /></div>
            </div>}
          {surface.id === 'terminal' && <TerminalExplorer dto={props.dto} onReload={props.onReload} />}
          {surface.id === 'library' && <ShardPanel series={props.dto.series} />}
          {surface.id === 'signals' && <ScannerPanel dto={props.dto} selected={metric} onLogWorkout={() => open('gym')} />}
          {surface.id === 'sync'
            && <DeckPanel
              dto={props.dto}
              syncing={props.syncing}
              busy={props.busy}
              onSync={props.onSyncGarmin}
              onScanner={() => open('signals')} />}
          {surface.id === 'gym'
            && <div className="desk-gym">
              <p>Log what you trained. Your draft stays here when you return to the desk; save before leaving Home.</p>
              <StrengthLog dto={props.dto} onReload={saved} />
            </div>}
          {surface.id === 'radio' && <RadioPanel radio={radio} />}
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
        return <button
          disabled={layout.editing}
          key={point.id}
          title={`${point.label}: ${label} · ${context}`}
          onClick={() => { setMetric(point.id); open('signals'); }}
          aria-label={`${point.label}: ${label}. ${context}`}
          aria-pressed={view === 'signals' && metric === point.id}>
          <span>{point.label}<strong>{label}</strong></span>
          <i aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, (value ?? 0) / max * 100))}%` }} /></i>
          <small>{context}</small>
        </button>;
      })}
    </footer>
  </section>;
}
