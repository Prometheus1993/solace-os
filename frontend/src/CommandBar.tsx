import type { DataFreshness } from '@solace/core';
import { round1 } from './tokens.ts';
import { AREAS, type Area } from './BottomNav.tsx';
import { useMobile } from './responsive.ts';

/** A silent ingestion gap (DB behind the export file) needs to be visibly wrong, not buried in a
 *  confidence word — so once wellness is ≥2 days stale, render one compact marker; below that,
 *  nothing (no permanent clutter). Folds in run staleness rather than adding a second chip. */
function staleLabel(f: DataFreshness): string | null {
  const rec = f.recoveryDaysStale;
  if (rec == null || rec < 2) return null;
  const runs = f.runsDaysStale;
  return runs != null && runs >= 2 ? `WELLNESS ${rec}D STALE · RUNS ${runs}D` : `WELLNESS ${rec}D STALE`;
}

/** "YoRHa OS" command bar (desktop shell, mock C): deep ink fill, wordmark + inline uppercase area
 *  nav + totals + ⟲ SYNC. On mobile the nav hides (BottomNav serves) and only wordmark + SYNC stay. */
export function CommandBar({ area, setArea, totals, dataFreshness, onSyncGarmin, syncing }: {
  area: Area;
  setArea: (a: Area) => void;
  totals: { runCount: number; totalRunKm: number };
  dataFreshness: DataFreshness;
  onSyncGarmin: () => void;
  syncing: boolean;
}) {
  const mobile = useMobile();
  const stale = staleLabel(dataFreshness);
  return (
    <header className="cb-bar">
      <span className="cb-wordmark">SOLACE — OS</span>
      {!mobile && (
        <nav className="cb-nav" aria-label="areas">
          {AREAS.map((a) => {
            const active = a.id === area;
            return (
              <button
                key={a.id}
                onClick={() => setArea(a.id)}
                aria-current={active ? 'page' : undefined}
                className={`cb-nav-btn${active ? ' is-active' : ''}`}
              >
                {a.label}
              </button>
            );
          })}
        </nav>
      )}
      <div className="cb-right">
        {!mobile && (
          <span className="cb-totals">
            {totals.runCount} RUNS · {round1(totals.totalRunKm)} KM
          </span>
        )}
        {stale && (
          <span
            className="cb-stale-chip"
            title={`Newest wellness reading: ${dataFreshness.recoveryLatestDate ?? '—'}. Sync to pull the rest.`}
          >
            {stale}
          </span>
        )}
        <button
          onClick={onSyncGarmin}
          disabled={syncing}
          title={syncing ? 'Syncing Garmin…' : 'Sync Garmin (pull new runs + wellness)'}
          className={`cb-sync-btn${syncing ? ' is-syncing' : ''}`}
        >
          <span className={syncing ? 'cb-sync-spin' : undefined}>⟲</span>
          <span>{syncing ? 'SYNCING' : 'SYNC'}</span>
        </button>
      </div>
    </header>
  );
}
