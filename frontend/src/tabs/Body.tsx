import { useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { C, cssVars, ddmm, todayIso } from '../tokens.ts';
import { Card, Field, LineChart, StatTile, TabShell } from './parts.tsx';

const STAMINA_C = 'var(--stamina)';
const LEANNESS_C = 'var(--leanness)';
type Win = DashboardDTO['recovery']['hrv'];
type Series = DashboardDTO['vitals']['weight'];
type Point = Series[number];

function bmiCategory(bmi: number | null): string {
  if (bmi == null) return '—';
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

/** The latest DAILY reading for a recovery vital (never a rolling mean — showing a windowed
 *  average as "today's number" would flatten the day you're actually in). The series skips
 *  nulls, so the newest point can be older than today; its date is always shown so a stale
 *  number is never mistaken for today's. The rolling window's confidence dot + day-coverage
 *  (the same numbers that gate the daily directive) stay visible as the footer line + dot
 *  title, so the app never loses its "how thin is this data" honesty. */
function VitalTile({ label, point, win, unit, fmt }: { label: string; point: Point | undefined; win: Win; unit: string; fmt?: (v: number) => string }) {
  const v = point?.value ?? null;
  const dot = win.confidence === 'high' ? C.ok : win.confidence === 'medium' ? 'var(--z3)' : C.muted3;
  return (
    <div className="vitals-tile">
      <div className="vitals-tile__header">
        <div className="vitals-tile__label">{label}</div>
        <span title={`rolling-window confidence: ${win.confidence} (${win.nDays}/${win.windowDays}d covered)`} className="vitals-tile__dot" style={cssVars({ '--vitals-dot': dot })} />
      </div>
      <div className={`vitals-tile__value${v == null ? ' is-null' : ''}`}>
        {v == null ? '—' : fmt ? fmt(v) : String(Math.round(v))}
        {v != null && <span className="vitals-tile__unit"> {unit}</span>}
      </div>
      <div className="vitals-tile__footer">{point == null ? 'no data yet' : `${ddmm(point.date)} · window ${win.nDays}/${win.windowDays}d`}</div>
    </div>
  );
}

function TrendCard({ title, series, color, unit, precision, hint }: { title: string; series: Series; color: string; unit: string; precision: number; hint: string }) {
  return (
    <Card title={title}>
      <LineChart data={series.map((p) => ({ label: p.date.slice(5), value: p.value }))} color={color} unit={unit} precision={precision} />
      <div className="vitals-trend-hint">{hint}</div>
    </Card>
  );
}

export function Body({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  const b = dto.body;
  const rec = dto.recovery;
  const v = dto.vitals;
  const [kg, setKg] = useState(b?.latestWeightKg ? String(b.latestWeightKg) : '');
  const [bf, setBf] = useState('');
  const [date, setDate] = useState(todayIso());
  const g = dto.goals;
  // Empty when the goal is still the default (shown as placeholder), so saving never stores an untouched default as a user goal.
  const userVal = (x: { value: number; userSet: boolean }) => (x.userSet ? String(x.value) : '');
  const [goalWeight, setGoalWeight] = useState(userVal(g.weightKg));
  const [goalBf, setGoalBf] = useState(userVal(g.bodyFatPct));
  const [goalPace, setGoalPace] = useState(userVal(g.paceMinPerKm));
  const [goalWeekly, setGoalWeekly] = useState(userVal(g.weeklyKm));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = (s: Series): Point | undefined => (s.length > 0 ? s[s.length - 1] : undefined);

  // Only chartable series (>=2 points) get a card; a lone weigh-in shows the friendly empty-state instead of four placeholders.
  const trends = [
    { title: '◆ Weight trend (kg)', series: v.weight, color: LEANNESS_C, unit: ' kg', precision: 1, hint: 'Trend over weeks.' },
    { title: '◆ Resting HR trend (bpm)', series: v.restingHr, color: C.danger, unit: '', precision: 0, hint: 'Lower = fitter.' },
    { title: '◆ Overnight HRV trend (ms)', series: v.hrv, color: STAMINA_C, unit: '', precision: 0, hint: 'Higher = better recovered.' },
    { title: '◆ Sleep trend (/100)', series: v.sleep, color: 'var(--z3)', unit: '', precision: 0, hint: 'Garmin sleep score.' },
  ].filter((t) => t.series.length >= 2);

  async function send(method: 'POST' | 'PATCH', path: string, body: unknown, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setMsg(ok);
        await onReload();
      } else {
        setMsg(`⚠ ${j.error ?? `HTTP ${res.status}`}`);
      }
    } catch (e) {
      setMsg(`⚠ ${String(e)}`);
    }
    setBusy(false);
  }
  const post = (path: string, body: unknown, ok: string) => send('POST', path, body, ok);
  // An empty box = reset that goal to its default (null).
  const goalNum = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  return (
    <TabShell>
      <Card title="◆ Recovery vitals">
        <div className="parts-tile-grid">
          <VitalTile label="Overnight HRV" point={latest(v.hrv)} win={rec.hrv} unit="ms" />
          <VitalTile label="Sleep" point={latest(v.sleep)} win={rec.sleep} unit="/100" />
          <VitalTile label="Resting HR" point={latest(v.restingHr)} win={rec.restingHr} unit="bpm" />
          <VitalTile label="Body Battery" point={latest(v.bodyBattery)} win={rec.bodyBattery} unit="%" />
        </div>
        <div className="vitals-recovery-note">
          Latest day per value.
        </div>
      </Card>

      <Card title="◆ Body composition">
        <div className="parts-tile-grid">
          <StatTile label="Weight" value={b?.latestWeightKg != null ? `${b.latestWeightKg} kg` : '—'} sub={b?.weightDate ?? 'nothing logged yet'} />
          <StatTile label="BMI" value={b?.bmi != null ? String(b.bmi) : '—'} sub={`${bmiCategory(b?.bmi ?? null)} · ${b?.heightCm ?? dto.athlete.heightCm ?? '—'} cm`} />
          <StatTile label="Body fat" value={b?.bodyFatPct != null ? `${b.bodyFatPct}%` : '—'} sub="BIA — rough trend" />
          <StatTile label="Weigh-ins" value={String(b?.weighIns ?? 0)} sub="logged" />
        </div>
      </Card>

      {trends.length > 0 ? (
        <div className="vitals-trends-grid">
          {trends.map((t) => (
            <TrendCard key={t.title} title={t.title} series={t.series} color={t.color} unit={t.unit} precision={t.precision} hint={t.hint} />
          ))}
        </div>
      ) : (
        <Card title="◆ Trends">
          <div className="vitals-empty-note">
            No trend data yet. Log a few weigh-ins below, or pull wellness data with ⟲ SYNC — weight, HRV, resting-HR and sleep charts will appear here.
          </div>
        </Card>
      )}

      <Card title="◆ Add a weigh-in">
        <div className="parts-tile-grid vitals-form-grid">
          <Field label="Date">
            <input className="yorha-input parts-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Weight (kg)">
            <input className="yorha-input parts-input" type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 75.0" />
          </Field>
          <Field label="Body fat % (optional)">
            <input className="yorha-input parts-input" type="number" inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} placeholder="e.g. 18.0" />
          </Field>
          <button
            className="yorha-btn parts-button"
            disabled={busy || !kg}
            onClick={() => void post('/api/weight', { date, weightKg: Number(kg), bodyFatPct: bf ? Number(bf) : null }, 'Weight saved ✓')}
          >
            Save
          </button>
        </div>
      </Card>

      <Card title="◆ Goals">
        <div className="parts-tile-grid vitals-form-grid">
          <Field label="Goal weight (kg)">
            <input className="yorha-input parts-input" type="number" inputMode="decimal" placeholder={String(g.weightKg.value)} value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} />
          </Field>
          <Field label="Goal body fat (%)">
            <input className="yorha-input parts-input" type="number" inputMode="decimal" placeholder={String(g.bodyFatPct.value)} value={goalBf} onChange={(e) => setGoalBf(e.target.value)} />
          </Field>
          <Field label="Goal pace (decimal min/km: 5.5 = 5:30)">
            <input className="yorha-input parts-input" type="number" inputMode="decimal" step="0.1" placeholder={String(g.paceMinPerKm.value)} value={goalPace} onChange={(e) => setGoalPace(e.target.value)} />
          </Field>
          <Field label="Goal weekly km">
            <input className="yorha-input parts-input" type="number" inputMode="decimal" placeholder={String(g.weeklyKm.value)} value={goalWeekly} onChange={(e) => setGoalWeekly(e.target.value)} />
          </Field>
          <button
            className="yorha-btn parts-button"
            disabled={busy}
            onClick={() =>
              void send('PATCH', '/api/goals', { weightKg: goalNum(goalWeight), bodyFatPct: goalNum(goalBf), paceMinPerKm: goalNum(goalPace), weeklyKm: goalNum(goalWeekly) }, 'Goals saved ✓')
            }
          >
            Save
          </button>
        </div>
        <div className="vitals-goals-hint">
          Empty field = default.
        </div>
      </Card>

      {msg && <div className={`vitals-msg${msg.startsWith('⚠') ? ' is-error' : ''}`}>{msg}</div>}
    </TabShell>
  );
}
