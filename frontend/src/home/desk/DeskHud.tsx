import type { DashboardDTO, DataFreshness } from '@solace/core';
import { round1 } from '../../tokens.ts';

/** A silent ingestion gap (DB behind the export file) needs to be visibly wrong, not buried in a confidence word: once wellness is
 *  2 or more days stale, one compact marker; below that, nothing. Folds in run staleness rather than adding a second chip. */
function staleLabel(f: DataFreshness): string | null {
  const rec = f.recoveryDaysStale;
  if (rec == null || rec < 2) return null;
  const runs = f.runsDaysStale;
  return runs != null && runs >= 2 ? `WELLNESS ${rec}D STALE · RUNS ${runs}D` : `WELLNESS ${rec}D STALE`;
}

/** The desk's run/km totals and the one ⟲ SYNC trigger (POST /api/sync-garmin, owned by App). */
export function DeskHud({ dto, syncing, busy, disabled, onSync }: { dto: DashboardDTO; syncing: boolean; busy: boolean; disabled: boolean; onSync: () => void }) {
  const stale = staleLabel(dto.dataFreshness);
  return <div className="desk-hud">
    <span className="desk-hud-totals">{dto.totals.runCount} RUNS · {round1(dto.totals.totalRunKm)} KM</span>
    {stale && <span
      className="desk-hud-stale"
      title={`Newest wellness reading: ${dto.dataFreshness.recoveryLatestDate ?? '—'}. Sync to pull the rest.`}>{stale}</span>}
    <button
      className="desk-hud-sync"
      disabled={disabled || syncing || busy}
      data-syncing={syncing}
      title={syncing ? 'Syncing Garmin…' : 'Sync Garmin (pull new runs + wellness)'}
      onClick={onSync}>
      <span aria-hidden="true">⟲</span> {syncing ? 'SYNCING' : 'SYNC'}
    </button>
  </div>;
}
