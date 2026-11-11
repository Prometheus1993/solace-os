import { useEffect, useRef, useState } from 'react';
import { Emblem } from './home/icons.tsx';
import { PLACEHOLDER } from './home/placeholders.ts';

const FADE_MS = 180;
/** Reveal times (ms) for: title+intro, relay, handshake, override, SESSION READY. Total ~800 ms. */
const STEPS = [0, 160, 330, 500, 700];

// reduced-motion intentionally ignored

/** Minimal text-only entry terminal. Purely decorative copy: it probes nothing and says nothing about the API.
 *  Enter or a click skips the sequence at any time and calls `onEnter` (after a short fade unless reduced motion). */
export function StartScreen({ onEnter }: { onEnter: () => void }) {
  const t = PLACEHOLDER.start;
  const [shown, setShown] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  const timers = useRef<number[]>([]);
  const enterRef = useRef<() => void>(() => {});

  useEffect(() => {
    timers.current = STEPS.slice(1).map((ms, i) => window.setTimeout(() => setShown(i + 2), ms));
    const clear = () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; };
    const enter = () => {
      if (done.current) return;
      done.current = true;
      clear();
      setShown(STEPS.length);
      setLeaving(true);
      timers.current = [window.setTimeout(onEnter, FADE_MS)];
    };
    enterRef.current = enter;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
      e.preventDefault(); // also stops the focused button from firing a second click
      enter();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clear(); };
  }, [onEnter]);

  const line = (n: number) => `ss-line${shown > n ? ' is-shown' : ''}`;
  return (
    <div className={`start-screen${leaving ? ' is-leaving' : ''}`}>
      <header className="ss-bar">
        <Emblem size={26} />
        <span>{t.header}</span>
        <span className="ss-term">{t.terminal}</span>
      </header>
      <main className="ss-main" aria-label="Solace access terminal">
        <div className="ss-block" aria-hidden="true">
          <p className={line(0)}><b>SOLACE NETWORK</b></p>
          <p className={`${line(0)} ss-dim`}>External connection detected.</p>
          <p className={`${line(1)} ss-first`}>&gt; locating relay.......... <span>OK</span></p>
          <p className={line(2)}>&gt; external handshake...... <span className="ss-bad">REJECTED</span></p>
          <p className={line(3)}>&gt; loading local override.. <span>OK</span></p>
          <p className={`${line(4)} ss-ready`}>SESSION READY<i className="ss-cursor">_</i></p>
        </div>
        <button type="button" className="ss-enter" onClick={() => enterRef.current()} autoFocus aria-label="Jack in">
          <span className="ss-key">[ ENTER ]</span><span className="ss-jack">JACK IN</span>
        </button>
      </main>
    </div>
  );
}
