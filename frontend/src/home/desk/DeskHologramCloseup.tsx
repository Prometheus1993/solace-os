import { useLayoutEffect, useRef } from 'react';
import type { DashboardDTO } from '@solace/core';
import { avatarUrl } from '../avatar.ts';
import { cssVars, STAT_COLOR } from '../../tokens.ts';
import { deskAsset as asset } from './desk-assets.ts';
import { historyPlot, recoveryReading } from './scanner-data.ts';
import {
  calloutLabel, conditionOf, HEAD_GLOW, journeyRow, journeyText, shortDate, STAT_ZONE, zoneBrightness, type StatKey,
} from './hologram-state.ts';
import { boxPercent, CALLOUTS, FIGURE, FLOOR, WORLD, type Box } from './hologram-layout.ts';
import { syncReportLines, syncStamp, type SyncReport } from './sync-report.ts';
import '../../styles/components/desk-hologram.css';

const ZOOM_MS = 320;
const STATS: readonly StatKey[] = ['stamina', 'strength', 'leanness'];
const ZONE_FILE = { legs: 'hologram-zone-legs', 'arms-torso': 'hologram-zone-arms-torso', head: 'hologram-zone-head', silhouette: 'hologram-zone-silhouette' } as const;

/** A world box as the `--x/--y/--w/--h` percentages `.holo-box` reads. */
const place = (box: Box) => {
  const p = boxPercent(box);
  return cssVars({ '--x': `${p.x}%`, '--y': `${p.y}%`, '--w': `${p.w}%`, '--h': `${p.h}%` });
};
const point = (x: number, y: number) => cssVars({ '--x': `${x / WORLD.w * 100}%`, '--y': `${y / WORLD.h * 100}%` });

/** The hologram body: the zone layers lit per stat level. Without the private art (a public clone) the tinted avatar stands in. */
function Figure({ dto }: { dto: DashboardDTO }) {
  const full = asset('hologram-body-full');
  const zones = { legs: asset(ZONE_FILE.legs), 'arms-torso': asset(ZONE_FILE['arms-torso']), head: asset(ZONE_FILE.head), silhouette: asset(ZONE_FILE.silhouette) };
  if (!full || Object.values(zones).some(src => !src)) {
    return <img className="holo-layer" src={avatarUrl} alt="" draggable={false} style={cssVars({ '--lit': zoneBrightness(dto.stats.hero.level) })} />;
  }
  return <>
    <img className="holo-layer" src={full} alt="" draggable={false} style={cssVars({ '--lit': 0.25 })} />
    {STATS.map(stat => <img
      key={stat}
      className="holo-layer"
      data-zone={STAT_ZONE[stat]}
      src={zones[STAT_ZONE[stat]]}
      alt=""
      draggable={false}
      style={cssVars({ '--lit': zoneBrightness(dto.stats[stat].level) })} />)}
    <img className="holo-layer" data-zone="head" src={zones.head} alt="" draggable={false} style={cssVars({ '--lit': HEAD_GLOW })} />
  </>;
}

function ConditionPanel({ dto }: { dto: DashboardDTO }) {
  const condition = conditionOf(dto.readiness.recommendation);
  const signals = [
    { label: 'SLEEP', value: recoveryReading(dto, 'sleep').value, unit: '' },
    { label: 'HRV', value: recoveryReading(dto, 'hrv').value, unit: ' ms' },
    { label: 'BATTERY', value: recoveryReading(dto, 'bodyBattery').value, unit: '' },
  ];
  return <section className="holo-panel holo-condition" aria-labelledby="holo-condition-title">
    <h2 id="holo-condition-title">CONDITION</h2>
    <div className="holo-aura" data-tone={condition.tone}><strong>{condition.word}</strong></div>
    <ul className="holo-signals">
      {signals.map(s => <li key={s.label}><span>{s.label}</span><b>{s.value == null ? '—' : `${Math.round(s.value)}${s.unit}`}</b></li>)}
    </ul>
    <small>{dto.readiness.confidence.toUpperCase()} CONFIDENCE · FROM TODAY’S READINGS</small>
  </section>;
}

function SyncPanel({ dto, syncing, busy, report, onSync }: { dto: DashboardDTO; syncing: boolean; busy: boolean; report: SyncReport | null; onSync: () => void }) {
  const f = dto.dataFreshness;
  return <section className="holo-panel holo-sync-panel" aria-labelledby="holo-sync-title">
    <h2 id="holo-sync-title">LAST SYNC</h2>
    <p className="holo-stamp">{syncing ? 'SYNCING…' : report ? syncStamp(report) : 'NO SYNC THIS SESSION'}</p>
    <ul className="holo-brought" aria-live="polite">
      {report && !syncing
        ? syncReportLines(report).map(line => <li key={line}>{line}</li>)
        : <li>LATEST RUN {f.runsLatestDate ?? '—'}</li>}
      {!report && <li>LATEST WELLNESS {f.recoveryLatestDate ?? '—'}</li>}
    </ul>
    <button className="holo-sync" type="button" disabled={syncing || busy} onClick={onSync}>
      <span aria-hidden="true" className="holo-sync-glyph">⟲</span> {syncing ? 'SYNCING…' : 'SYNC GARMIN'}
    </button>
  </section>;
}

function JourneyPanel({ dto }: { dto: DashboardDTO }) {
  return <section className="holo-panel holo-journey" aria-labelledby="holo-journey-title">
    <h2 id="holo-journey-title">JOURNEY</h2>
    {STATS.map(stat => {
      const current = dto.stats[stat];
      const row = journeyRow(dto.journey[stat], current);
      const plot = dto.journey[stat] ? historyPlot(dto.journey[stat]!.points) : null;
      return <div className="holo-journey-row" key={stat} style={cssVars({ '--accent': STAT_COLOR[stat] })}>
        <div className="holo-journey-head">
          <span>{stat.toUpperCase()}</span>
          <b>{row ? `LV ${row.startLevel} → ${current.level}` : `LV ${current.level}`}</b>
        </div>
        {row
          ? <>
            <div className="holo-level" aria-hidden="true" style={cssVars({ '--from': `${row.startLevel}%`, '--now': `${current.level}%` })}>
              <i className="holo-level-from" /><i className="holo-level-gain" /><i className="holo-level-drop" />
            </div>
            <p>{journeyText(row)} <small>SINCE {shortDate(row.sinceDate)}</small></p>
            {plot && <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true"><polyline points={plot.xy} /></svg>}
          </>
          : <p><small>NO HISTORY YET</small></p>}
      </div>;
    })}
  </section>;
}

/** The hologram on the desk, zoomed in: a body showcase (stat zones, condition, journey) that also runs the Garmin sync. Its own
 *  overlay layer (the desk scene is never scaled): it grows out of the hologram prop and shrinks back into it. Esc or a click
 *  outside closes it; reduced motion only fades. */
export function DeskHologramCloseup({ dto, syncing, busy, syncReport, reduced, moving, origin, onSync, onClose }: {
  dto: DashboardDTO; syncing: boolean; busy: boolean; syncReport: SyncReport | null; reduced: boolean; moving: boolean;
  origin: () => DOMRect | null; onSync: () => void; onClose: () => void;
}) {
  const shade = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  // forward = zooming in. Reduced motion only fades.
  const zoom = (forward: boolean): Promise<unknown> => {
    const from = origin(), box = stage.current!.getBoundingClientRect();
    const small = !reduced && from ? `translate(${from.left + from.width / 2 - box.left - box.width / 2}px, ${from.top + from.height / 2 - box.top - box.height / 2}px) scale(${from.width / box.width})` : 'none';
    const options: KeyframeAnimationOptions = { duration: reduced ? 160 : ZOOM_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both', direction: forward ? 'normal' : 'reverse' };
    shade.current!.animate([{ opacity: 0 }, { opacity: 1 }], options);
    return stage.current!.animate([{ transform: small, opacity: reduced ? 0 : .5 }, { transform: 'none', opacity: 1 }], options).finished;
  };
  useLayoutEffect(() => { void zoom(true); shade.current!.focus({ preventScroll: true }); }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    void zoom(false).then(onClose, onClose);
  };
  return <div
    ref={shade}
    className="holo-closeup"
    role="dialog"
    aria-modal="true"
    aria-label="Body showcase"
    tabIndex={-1}
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault(); event.stopPropagation(); close();
    }}>
    <div className="holo-stage" ref={stage} data-syncing={syncing} data-motion={moving}>
      <header className="holo-head">
        <h1>BODY SHOWCASE <small>COMPANION ONLINE</small></h1>
        <button type="button" onClick={close}>← DESK <kbd>ESC</kbd></button>
      </header>
      <div className="holo-body">
        <div className="holo-col">
          <ConditionPanel dto={dto} />
          <SyncPanel dto={dto} syncing={syncing} busy={busy} report={syncReport} onSync={onSync} />
        </div>
        <div className="holo-world" role="img" aria-label={`Hologram body. ${STATS.map(s => { const l = calloutLabel(s, dto); return `${l.name} ${l.detail}`; }).join('. ')}.`}>
          <span className="holo-box holo-floor" style={place(FLOOR)} aria-hidden="true" />
          <div className="holo-box holo-figure" style={place(FIGURE)}>
            <Figure dto={dto} />
            <span className="holo-scan" aria-hidden="true" />
          </div>
          <svg className="holo-lines" viewBox={`0 0 ${WORLD.w} ${WORLD.h}`} aria-hidden="true">
            {CALLOUTS.map(c => <g key={c.stat} data-stat={c.stat}>
              <line x1={c.label.x} y1={c.label.y} x2={c.target.x} y2={c.target.y} />
              <circle cx={c.target.x} cy={c.target.y} r="9" />
            </g>)}
          </svg>
          {CALLOUTS.map(c => {
            const label = calloutLabel(c.stat, dto);
            return <div className="holo-callout" key={c.stat} data-side={c.side} data-stat={c.stat} style={point(c.label.x, c.label.y)} aria-hidden="true">
              <span>{label.name}</span>
              <b>{label.detail}</b>
            </div>;
          })}
          {syncing && <p className="holo-scan-label">SYNCING…</p>}
        </div>
        <div className="holo-col">
          <JourneyPanel dto={dto} />
        </div>
      </div>
    </div>
  </div>;
}
