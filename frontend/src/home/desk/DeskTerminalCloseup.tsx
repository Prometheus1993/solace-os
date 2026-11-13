import { useLayoutEffect, useRef, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { TerminalExplorer } from './TerminalExplorer.tsx';
import { terminalHash, type TerminalTarget } from './terminal-route.ts';
import { navigate } from '../navigate.ts';
import '../../styles/components/desk-terminal.css';

const ZOOM_MS = 320;

/** The terminal on the desk monitor, zoomed in. Its own overlay layer (the desk scene is never scaled): the panel grows out of the
 *  monitor screen and shrinks back into it. Esc or a click outside closes it; reduced motion only fades. The route (the URL hash) is
 *  the single source of truth: `target` null = closed. The terminal stays mounted once opened, so drafts survive closing it. */
export function DeskTerminalCloseup({ dto, target, reduced, origin, onReload }: {
  dto: DashboardDTO;
  target: TerminalTarget | null;
  reduced: boolean;
  origin: () => DOMRect | null;
  onReload: () => void | Promise<void>;
}) {
  const shade = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(target !== null);
  const [last, setLast] = useState<TerminalTarget | null>(target);
  const run = useRef(0);
  if (target && (last === null || terminalHash(target) !== terminalHash(last))) setLast(target);
  useLayoutEffect(() => { if (target) setVisible(true); }, [target !== null]);
  const zoom = (forward: boolean): Promise<unknown> => {
    const from = origin(), box = stage.current!.getBoundingClientRect();
    const small = !reduced && from ? `translate(${from.left + from.width / 2 - box.left - box.width / 2}px, ${from.top + from.height / 2 - box.top - box.height / 2}px) scale(${from.width / box.width})` : 'none';
    const options: KeyframeAnimationOptions = { duration: reduced ? 160 : ZOOM_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both', direction: forward ? 'normal' : 'reverse' };
    shade.current!.animate([{ opacity: 0 }, { opacity: 1 }], options);
    return stage.current!.animate([{ transform: small, opacity: reduced ? 0 : .5 }, { transform: 'none', opacity: 1 }], options).finished;
  };
  useLayoutEffect(() => {
    if (!visible) return;
    const id = ++run.current;
    if (target) { void zoom(true); shade.current!.focus({ preventScroll: true }); return; }
    zoom(false).then(() => { if (run.current === id) setVisible(false); }, () => undefined);
  }, [visible, target !== null]);
  const close = () => navigate('desk');
  return <div
    ref={shade}
    className="terminal-closeup"
    hidden={!visible}
    role="dialog"
    aria-modal="true"
    aria-label="Terminal"
    tabIndex={-1}
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault(); event.stopPropagation(); close();
    }}>
    <div className="terminal-stage" ref={stage}>
      {last && <TerminalExplorer dto={dto} target={last} onSelect={t => navigate(terminalHash(t))} onClose={close} onReload={onReload} />}
    </div>
  </div>;
}
