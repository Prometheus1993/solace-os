import { useEffect, useState } from 'react';
import { Icon } from '../icons.tsx';
import { AMBIENT_LINES, clockText, planAmbient } from './terminal-ambience.ts';

/**
 * What the awake desk monitor shows. The caption, the TERMINAL control and the footer are the screen; the wake-up fade, the
 * clock, the cursor and the occasional line are decoration only (pointer-events: none, no server calls, no commands).
 * It mounts when the display wakes, so the wake sequence runs once per wake.
 */
export function MonitorScreen({ moving, onOpenTerminal }: { moving: boolean; onOpenTerminal: () => void }) {
  const [clock, setClock] = useState(() => clockText(new Date()));
  const [line, setLine] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(clockText(new Date())), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  // Lines only while the scene moves: a paused or reduced-motion desk keeps a still, readable screen.
  useEffect(() => {
    if (!moving) return;
    let timer = 0, previous: number | null = null;
    const next = () => {
      const plan = planAmbient(Math.random, previous);
      timer = window.setTimeout(() => {
        previous = plan.line; setLine(plan.line);
        timer = window.setTimeout(() => { setLine(null); next(); }, plan.hold * 1000);
      }, plan.wait * 1000);
    };
    next();
    return () => { window.clearTimeout(timer); setLine(null); };
  }, [moving]);
  return <div className="desk-monitor">
    <span className="desk-monitor-caption">PERSONAL / ONLINE</span>
    <time className="desk-monitor-clock">{clock}</time>
    <div className="desk-folders"><button onClick={onOpenTerminal}><Icon name="folder" size={40} /><span>TERMINAL</span></button></div>
    <span className="desk-monitor-footer">YOUR FILES. YOUR PACE.<i className="desk-cursor" aria-hidden="true" /></span>
    <span className="desk-monitor-boot" aria-hidden="true">DISPLAY ONLINE</span>
    {line !== null && <span key={line} className="desk-monitor-ambient" aria-hidden="true">{AMBIENT_LINES[line]}</span>}
  </div>;
}
