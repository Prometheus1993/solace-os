import { SCAN_POINTS, historyPlot, recoveryReading, type ScanMetric, type ScannerData } from './scanner-data.ts';

const EXPLANATIONS = {
  sleep: 'Your Garmin sleep score. Today’s reading is shown when available; otherwise the rolling average is used.',
  hrv: 'Your recorded overnight heart rate variability in milliseconds. Compare your own readings over time.',
  bodyBattery: 'Your recorded morning Garmin Body Battery. Today’s reading is shown when available; otherwise the rolling average is used.',
  stamina: 'Your endurance progression, calculated from your recorded running history.',
  strength: 'Your power progression, calculated from your recorded strength training.',
  leanness: 'Your body composition progression toward your configured goal.',
};

export function ScannerPanel({ dto, selected, onLogWorkout }: { onLogWorkout: () => void; dto: ScannerData; selected: ScanMetric }) {
  const recovery = selected === 'sleep' || selected === 'hrv' || selected === 'bodyBattery' ? recoveryReading(dto, selected) : null;
  const stat = selected === 'stamina' || selected === 'strength' || selected === 'leanness' ? dto.stats[selected] : null;
  const plot = recovery ? historyPlot(recovery.points) : null;
  const unit = selected === 'hrv' ? 'ms' : '/100';
  return <section className="wp-scanner-panel" aria-labelledby="wp-scanner-title">
    <span className="wp-eyebrow">BIOMONITOR / 03</span>
    <h1 id="wp-scanner-title">BODY SCAN</h1>
    <p className="wp-scanner-subtitle">SELECT A SIGNAL TO INSPECT</p>
    <div id="wp-scan-detail" className="wp-scan-detail" aria-live="polite" aria-atomic="true">
      <h2>{SCAN_POINTS.find(p => p.id === selected)!.label}</h2>
      {recovery && <>
        <p className="wp-scan-value">{recovery.value == null ? '—' : Math.round(recovery.value)}<small>{unit}</small></p>
        <div className="wp-scan-meta">
          <span>{recovery.source}</span>
          {recovery.stale != null && recovery.stale >= 2 && <span className="wp-stale">RECOVERY DATA {recovery.stale}D OLD</span>}
        </div>
        <p className="wp-scan-explanation">{EXPLANATIONS[selected]}</p>
        <div className="wp-scan-history">
          <h3>RECORDED HISTORY <span>{plot ? `${plot.count} READINGS` : ''}</span></h3>
          {plot ? <>
            <div className="wp-chart-scale"><span>{plot.max.toFixed(0)} {unit}</span><span>{plot.min.toFixed(0)} {unit}</span></div>
            <svg
              viewBox="0 0 300 90"
              role="img"
              aria-label={`${SCAN_POINTS.find(p => p.id === selected)!.label}: ${plot.count} readings from ${plot.start} to ${plot.end}, range ${plot.min} to ${plot.max} ${unit}`}>
              <path d="M8 10H292M8 45H292M8 80H292" className="wp-chart-grid" />
              <polyline points={plot.xy} fill="none" />
            </svg>
            <div className="wp-chart-dates"><span>{plot.start}</span><span>{plot.end}</span></div>
          </>
          : <p className="wp-scan-explanation">
            {recovery.points.length === 1 ? 'One recorded reading. A trend needs at least two dates.' : 'Not enough recorded readings for a trend.'}
          </p>}
          {recovery.points.length > 0
            && <details>
              <summary>VIEW DATED READINGS</summary>
              <table>
                <thead><tr><th>Date</th><th>Value ({unit})</th></tr></thead>
                <tbody>{recovery.points.map((p, i) => <tr key={`${p.date}-${i}`}><td>{p.date}</td><td>{p.value}</td></tr>)}</tbody>
              </table>
            </details>}
        </div>
        <p className="wp-scan-footnote">{recovery.coverage}{recovery.value == null ? ' · Sync Garmin from the cyberdeck to fetch available readings.' : ''}</p>
      </>}
      {stat && <>
        <p className="wp-scan-value"><small>LV</small> {stat.level}</p>
        <div className="wp-scan-meta"><span>{stat.tier.name.toUpperCase()}</span><span>CONFIDENCE: {stat.confidence.toUpperCase()}</span></div>
        <p className="wp-scan-explanation">{EXPLANATIONS[selected]}</p>
        <label className="wp-progress-label">{stat.progressPct}% TO NEXT LEVEL<progress value={stat.progressPct} max={100} /></label>
        <p className="wp-scan-explanation">{stat.note}</p>
        {selected === 'strength' && <div className="wp-power-actions">
          <p>
            {stat.lastSessionDaysAgo == null
              ? 'No gym sessions logged yet.'
              : stat.lastSessionDaysAgo === 0 ? 'Last gym session: today.' : `Last gym session: ${stat.lastSessionDaysAgo} days ago.`}
          </p>
          <button type="button" className="wp-sync" onClick={onLogWorkout}>＋ LOG WORKOUT</button>
          <a href="#body/strength">PROGRESSION & HISTORY ↗</a>
        </div>}
        <p className="wp-scan-footnote">Current progression snapshot. Attribute level history is not available here.</p>
      </>}
    </div>
    <p className="wp-scan-model-note">SCHEMATIC MODEL · NOT AN ANATOMICAL SCAN</p>
  </section>;
}
