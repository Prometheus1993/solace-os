import { useEffect, useRef, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { deckSignal } from '../desk-state.ts';
import { navigate } from '../navigate.ts';

const signals = [
  { key:'sleep', label:'SLEEP', unit:'/100' },
  { key:'hrv', label:'HRV', unit:'ms' },
  { key:'bodyBattery', label:'BATTERY', unit:'/100' }
] as const;
type Today = DashboardDTO['recovery']['today'];
export function DeckPanel({
  dto,
  syncing,
  busy,
  onSync,
  onScanner
}: { dto: DashboardDTO; syncing: boolean; busy: boolean; onSync: () => void; onScanner: () => void }) {
  const active = syncing;
  const signal = deckSignal(syncing, busy);
  const before = useRef<Today | null>(null);
  const wasActive = useRef(false);
  const [changes, setChanges] = useState<Today | null>(null);
  useEffect(() => {
    if (active && !wasActive.current) { before.current = { ...dto.recovery.today }; setChanges(null); }
    if (!active && wasActive.current) setChanges(before.current);
    wasActive.current = active;
  }, [active, dto.recovery.today]);
  return <section className="wp-deck-panel wp-deck-console" aria-labelledby="wp-deck-title">
    <span className="wp-eyebrow">HARDWARE / 02 · GARMIN</span><h1 id="wp-deck-title">CYBERDECK</h1>
    <div className={`wp-signal is-${signal.kind}`} role="status"><i />{signal.label}</div>
    <div className="wp-deck-readiness"><h2>TODAY’S READINESS <small>{dto.readiness.confidence.toUpperCase()} CONFIDENCE</small></h2>
      <strong className="wp-readiness-call">
        {{ go_hard:'READY FOR INTENSITY', go_easy:'KEEP IT EASY', rest:'RECOVERY FIRST' }[dto.readiness.recommendation]}
      </strong>
      <div className="wp-deck-vitals">
        {signals.map(({key,label,unit}) => <div key={key}>
          <span>{label}</span>
          <strong>{dto.recovery.today[key] ?? '—'} <small>{dto.recovery.today[key] == null ? '' : unit}</small></strong>
          {changes && changes[key] !== dto.recovery.today[key] && <small>Previously {changes[key] ?? 'unavailable'}</small>}
        </div>)}
      </div>
      <p>{dto.readiness.rationale[0] ?? 'No readiness explanation available.'}</p>
      <small>Today’s readings only. Missing values stay blank; readiness may use rolling averages.{dto.dataFreshness.recoveryDaysStale != null
            && dto.dataFreshness.recoveryDaysStale > 0
          ? ` Recovery data is ${dto.dataFreshness.recoveryDaysStale} days old.`
          : ''}
      </small>
    </div>
    <button className="wp-sync" type="button" disabled={active || busy} onClick={onSync}>{active ? 'SYNC IN PROGRESS…' : '↗ INITIATE SYNC'}</button>
    <div className="wp-deck-links">
      <button type="button" onClick={onScanner}>OPEN SCANNER ↗</button>
      <button type="button" onClick={() => navigate('body/running')}>VIEW RUNS ↗</button>
    </div>
  </section>;
}
