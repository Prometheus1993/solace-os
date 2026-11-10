import type { DashboardDTO } from '@solace/core';
import { C, cssVars, dayOf, ddmm, fmtPace, monthOf, round1, STAT_COLOR, todayIso, ZONE_COLOR } from '../tokens.ts';
import { ZonePill } from '../ui.tsx';
import { BarChart, Card, LineChart, StatTile, TabShell } from './parts.tsx';
import { useMobile } from '../responsive.ts';

/** Monday (ISO week start) for a YYYY-MM-DD date, as a YYYY-MM-DD string. */
function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const back = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - back);
  return d.toLocaleDateString('sv-SE');
}

// ── "All runs" feed (rich rows; flat YoRHa with a zone-accent left edge) ──────
type RunItem = DashboardDTO['runs'][number];

function MiniPill({ text, color }: { text: string; color: string }) {
  return (
    <span className="run-mini-pill" style={cssVars({ '--pill-color': color })}>
      {text}
    </span>
  );
}

function RunFeedRow({ r }: { r: RunItem }) {
  const accent = r.zone != null ? ZONE_COLOR[r.zone] ?? C.muted3 : C.muted3;
  const heat = r.heatOffsetBpm > 0 && r.adjustedAvgHr != null;
  const mobile = useMobile();
  return (
    <div
      className="run-feed-row"
      style={cssVars({ '--row-accent': accent })}
    >
      {mobile ? (
        // Phone: 2 lines (date + km + pace, zone right; then HR/heat/temp/label/flags) — no cramped columns.
        <>
          <div className="run-mobile-head">
            <div className="run-mobile-head__left">
              <span className="run-date">{dayOf(r.date)} {monthOf(r.date)}</span>
              <span className="run-km run-km--mobile">{round1(r.km)} km</span>
              <span className="run-pace run-pace--mobile">{r.km > 0 ? `${fmtPace(r.durationMin / r.km)}/km` : '—'} · {r.durationMin}m</span>
            </div>
            {r.zone != null && <ZonePill zone={r.zone} soft={r.zone === 3 || r.zone === 4} />}
          </div>
          <div className="run-mobile-meta">
            <span className="run-hr run-hr--mobile">♥ {heat ? `${r.avgHrBpm}→${Math.round(r.adjustedAvgHr as number)}` : (r.avgHrBpm ?? '—')}</span>
            {heat && <MiniPill text={`🔥 −${Math.round(r.heatOffsetBpm)}`} color={C.danger} />}
            {r.temperatureC != null && <span className="run-temp">{Math.round(r.temperatureC)}°</span>}
            {r.label && <span className="run-label run-label--mobile">{r.label}</span>}
            {r.driftFlag && <MiniPill text="⚑" color={C.danger} />}
          </div>
        </>
      ) : (
        <div className="run-desktop-row">
          <div className="run-daybox">
            <div className="run-daynum">{dayOf(r.date)}</div>
            <div className="run-daymonth">{monthOf(r.date)}</div>
          </div>
          <span className="run-km run-km--desktop">{round1(r.km)} km</span>
          <span className="run-pace run-pace--desktop">
            {r.km > 0 ? `${fmtPace(r.durationMin / r.km)}/km` : '—'}
            <span className="run-pace__sub"> · {r.durationMin}m</span>
          </span>
          <div className="run-desktop-meta">
            {r.zone != null && <ZonePill zone={r.zone} soft={r.zone === 3 || r.zone === 4} />}
            {r.label && <span className="run-label run-label--desktop">{r.label}</span>}
          </div>
          <div className="run-desktop-right">
            <span className="run-hr run-hr--desktop">♥ {heat ? `${r.avgHrBpm}→${Math.round(r.adjustedAvgHr as number)}` : (r.avgHrBpm ?? '—')}</span>
            {heat && <MiniPill text={`🔥 −${Math.round(r.heatOffsetBpm)}`} color={C.danger} />}
            {r.temperatureC != null && <span className="run-temp run-temp--desktop">{Math.round(r.temperatureC)}°</span>}
            {r.driftFlag && <MiniPill text="⚑" color={C.danger} />}
          </div>
        </div>
      )}
    </div>
  );
}

export function Running({ dto }: { dto: DashboardDTO }) {
  const asc = [...(dto.runs ?? [])]; // oldest → newest (already sorted)
  const runs = [...asc].reverse(); // newest first (for the list)

  // Zone distribution
  const zoneCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of asc) if (r.zone) zoneCounts[r.zone] = (zoneCounts[r.zone] ?? 0) + 1;
  const maxZone = Math.max(1, ...Object.values(zoneCounts));

  // Weekly volume (km per ISO week)
  const weekMap = new Map<string, number>();
  for (const r of asc) weekMap.set(weekStart(r.date), (weekMap.get(weekStart(r.date)) ?? 0) + r.km);
  const weekly = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([w, km]) => ({ label: ddmm(w), value: round1(km) }));

  // Pace per run (min/km) — lower is better
  const paceData = asc.filter((r) => r.km > 0).map((r) => ({ label: ddmm(r.date), value: r.durationMin / r.km }));
  // Avg HR per run
  const hrData = asc.filter((r) => r.avgHrBpm != null).map((r) => ({ label: ddmm(r.date), value: r.avgHrBpm as number }));

  // Summary tiles
  const longest = asc.reduce((m, r) => Math.max(m, r.km), 0);
  const totalMin = asc.reduce((s, r) => s + r.durationMin, 0);
  const totalKm = asc.reduce((s, r) => s + r.km, 0);
  const avgPace = totalKm > 0 ? totalMin / totalKm : null;

  // Extra top-box metrics — each degrades to "—" on a fresh file.
  const today = todayIso();
  const thisWeekKm = asc.filter((r) => weekStart(r.date) === weekStart(today)).reduce((s, r) => s + r.km, 0);
  const hrRuns = asc.filter((r) => r.avgHrBpm != null);
  const avgHr = hrRuns.length ? Math.round(hrRuns.reduce((s, r) => s + (r.avgHrBpm as number), 0) / hrRuns.length) : null;

  const RECENT = 5;
  const recent = runs.slice(0, RECENT);

  return (
    <TabShell>
      {/* Run count + total km already sit in the always-visible CommandBar chip — not repeated here (3.2 #7). */}
      <div className="run-stat-grid">
        <StatTile label="This week" value={thisWeekKm > 0 ? `${round1(thisWeekKm)} km` : '—'} sub="current ISO week" />
        <StatTile label="Longest" value={`${round1(longest)} km`} />
        <StatTile label="Avg. pace" value={avgPace != null ? `${fmtPace(avgPace)}` : '—'} sub="min/km" />
        <StatTile label="Avg. HR" value={avgHr != null ? String(avgHr) : '—'} sub="bpm · all runs" />
      </div>

      <div className="run-charts-grid">
        <Card title="◆ Weekly volume (km)">
          <BarChart data={weekly} color={STAT_COLOR.stamina} unit=" km" precision={1} />
          <div className="run-caption">Last 12 weeks.</div>
        </Card>

        <Card title="◆ Pace trend (min/km)">
          <LineChart data={paceData} color={C.gold} unit="" precision={2} />
          <div className="run-caption">Lower = faster.</div>
        </Card>

        <Card title="◆ Heart-rate trend (avg. bpm)">
          <LineChart data={hrData} color={C.danger} unit="" precision={0} />
          <div className="run-caption">Lower at the same pace = fitter.</div>
        </Card>

        <Card title="◆ Zone distribution (all runs)">
          <div className="run-zone-list">
            {[1, 2, 3, 4, 5].map((z) => (
              <div key={z} className="run-zone-row">
                <span className="run-zone-label" style={cssVars({ '--zone-accent': ZONE_COLOR[z] })}>Z{z}</span>
                <div className="run-zone-track">
                  <div className="run-zone-fill" style={{ width: `${((zoneCounts[z] ?? 0) / maxZone) * 100}%`, ...cssVars({ '--zone-accent': ZONE_COLOR[z] }) }} />
                </div>
                <span className="run-zone-count">{zoneCounts[z] ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="run-caption">Runs per heart-rate zone.</div>
        </Card>
      </div>

      <Card title={`◆ Recent runs${runs.length > RECENT ? ` · last ${RECENT} of ${runs.length}` : ''}`}>
        <div className="run-recent-list">
          {recent.map((r, i) => (
            <RunFeedRow key={`${r.date}-${i}`} r={r} />
          ))}
          {runs.length === 0 && <div className="run-empty">No runs yet — drag your FIT files onto the dashboard.</div>}
        </div>
      </Card>
    </TabShell>
  );
}
