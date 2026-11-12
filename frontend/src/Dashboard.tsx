import { useState } from 'react';
import type { DashboardDTO, QuestProgress, RunRead, StatName, StatResult, WeeklyReport } from '@solace/core';
import { C, cssVars, dayOf, fmtNum, fmtPace, monthOf, READINESS, round1, STAT_COLOR } from './tokens.ts';
import { BarTrack, ConfidenceChip, OsBlock, Panel, Strip, SubTile, TierBadge, ZonePill } from './ui.tsx';
import { StatRef } from './tabs/parts.tsx';
import { useMobile, useNarrow } from './responsive.ts';

const isSoft = (run: RunRead): boolean => run.reasons.some((r) => /soft ~\d/.test(r));

// ── Character Status ─────────────────────────────────────────────────────────

/** Format a breakdown sub-factor (pace as m:ss, everything else as value + unit). */
const fmtSub = (b: { value: number; unit: string }): string =>
  b.unit === 'min/km' ? `${fmtPace(b.value)}/km` : `${round1(b.value)} ${b.unit}`;

/** The breakdown sub-factors are collapsed by default (Persona 5 / Destiny 2 pattern) — click the
 *  stat row to expand them; `toNext`/`note` stay visible either way (headline progress, not detail). */
function StatBarRow({ label, color, stat, leveledUp }: { label: string; color: string; stat: StatResult; leveledUp?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dash-stat-row" style={cssVars({ '--stat-accent': color })}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Show breakdown"
        className="dash-stat-row__toggle"
      >
        <div className="dash-stat-row__toggle-left">
          <div className="dash-stat-row__dot" />
          <span className="dash-stat-row__label">{label}</span>
          <TierBadge tier={stat.tier} />
          <span className="dash-stat-row__caret">{open ? '▾' : '▸'}</span>
        </div>
        <div className="dash-stat-row__toggle-right">
          <ConfidenceChip level={stat.confidence} />
          <span className={`dash-stat-row__level${leveledUp ? ' is-leveled-up' : ''}`}>LV {stat.level}</span>
        </div>
      </button>
      <BarTrack pct={stat.progressPct} color={color} />
      <div className="dash-stat-row__footer">
        {open && (
          <div className="dash-stat-row__breakdown">
            {stat.breakdown.map((b) => (
              <span key={b.label} className="dash-stat-row__breakdown-item">
                <span className="dash-stat-row__breakdown-label">{b.label} </span>
                {fmtSub(b)}
              </span>
            ))}
          </div>
        )}
        <span className={`dash-stat-row__to-next${stat.toNext == null ? ' is-max' : ''}`}>
          {stat.toNext == null ? '★ MAX' : `${round1(stat.toNext)} pt → LV ${stat.level + 1}`}
        </span>
      </div>
      <span className="dash-stat-row__note">{stat.note}</span>
    </div>
  );
}

function CharacterStatus({ data }: { data: DashboardDTO }) {
  const { stats, levelEvents } = data;
  const eventFor = (s: StatName) => levelEvents.find((e) => e.stat === s);
  return (
    <Panel>
      <div className="dash-char-header">
        <div>
          <div className="dash-char-level-row">
            <span className="dash-char-level-badge">LV {stats.hero.level}</span>
            <TierBadge tier={stats.hero.tier} />
          </div>
        </div>
      </div>
      {/* Level-up is celebrated ONCE, by FxOverlay's fanfare — no second banner list here (3.2 #14). */}
      <div className="dash-char-divider" />
      <StatBarRow label="Stamina" color={STAT_COLOR.stamina} stat={stats.stamina} leveledUp={eventFor('STAMINA')?.trigger === 'level_up'} />
      <StatBarRow label="Strength" color={STAT_COLOR.strength} stat={stats.strength} leveledUp={eventFor('STRENGTH')?.trigger === 'level_up'} />
      <StatBarRow label="Leanness" color={STAT_COLOR.leanness} stat={stats.leanness} leveledUp={eventFor('LEANNESS')?.trigger === 'level_up'} />
    </Panel>
  );
}

// ── Today's Directive ─────────────────────────────────────────────────────────
function Directive({ data }: { data: DashboardDTO }) {
  const r = data.readiness;
  const rec = data.recovery;
  const { verb, color } = READINESS[r.recommendation] ?? { verb: r.recommendation, color: C.muted };
  return (
    <OsBlock
      title="Today's Directive"
      pad={false}
      style={cssVars({ '--directive-color': color })}
    >
      <Strip>
        <span className="dash-directive-label">
          <span className="dash-directive-dot" />
          Directive
        </span>
        <span className="dash-directive-verb">{verb}</span>
      </Strip>
      {r.rationale.length > 0 && (
        <div className="dash-directive-lines">
          {r.rationale.map((line, i) => (
            <div key={i} className="dash-directive-line">
              <span className="dash-directive-line-dot" />
              <span className="dash-directive-line-text">{line}</span>
            </div>
          ))}
        </div>
      )}
      {/* The 4 vitals tiles live only at VITALS/Body.tsx (canonical per 3.2 #2) — STATUS keeps
          just the composite verdict above plus this drill-in reference. */}
      <div className="dash-directive-footer">
        <StatRef label="Vitals" value={rec.bodyBattery.value != null ? `${Math.round(rec.bodyBattery.value)}% battery` : '—'} hash="body/vitals" />
      </div>
    </OsBlock>
  );
}

// ── Weekly report ─────────────────────────────────────────────────────────────
// Last completed Mon–Sun week next to the week before. Numbers and arrows only; arrows are neutral
// (no good/bad colouring), the direction is last week relative to the week before.
const ARROW = { up: '↑', down: '↓', same: '=' } as const;

const fmtRange = (start: string, end: string): string =>
  `${dayOf(start)}–${dayOf(end)} ${monthOf(end).charAt(0)}${monthOf(end).slice(1).toLowerCase()}`;

const fmtSigned = (n: number): string => (n > 0 ? `+${fmtNum(n)}` : fmtNum(n));

const WEEKLY_ROWS: Array<{ label: string; key: Exclude<keyof WeeklyReport, 'lastWeek' | 'weekBefore'>; fmt: (n: number) => string }> = [
  { label: 'Runs', key: 'runs', fmt: fmtNum },
  { label: 'Distance', key: 'distanceKm', fmt: (n) => `${fmtNum(n)} km` },
  { label: 'Avg pace', key: 'paceMinPerKm', fmt: (n) => `${fmtPace(n)}/km` },
  { label: 'Avg HR', key: 'avgHrBpm', fmt: (n) => `${Math.round(n)} bpm` },
  { label: 'Strength sessions', key: 'strengthSessions', fmt: fmtNum },
  { label: 'Kg lifted', key: 'kgLifted', fmt: (n) => `${fmtNum(n)} kg` },
  { label: 'HRV', key: 'hrvMs', fmt: (n) => `${Math.round(n)} ms` },
  { label: 'Resting HR', key: 'restingHrBpm', fmt: (n) => `${Math.round(n)} bpm` },
  { label: 'Sleep', key: 'sleepScore', fmt: (n) => `${Math.round(n)}/100` },
  { label: 'Body Battery', key: 'bodyBattery', fmt: (n) => `${fmtNum(n)}%` },
  { label: 'Weight', key: 'weightChangeKg', fmt: (n) => `${fmtSigned(n)} kg` },
];

function WeeklyReportBlock({ data }: { data: DashboardDTO }) {
  const w = data.weeklyReport;
  const cell = (hasData: boolean, v: number | null, fmt: (n: number) => string): string =>
    !hasData ? 'No data' : v == null ? '—' : fmt(v);
  return (
    <OsBlock title="Weekly report" right={<span className="dash-weekly__range">{fmtRange(w.lastWeek.start, w.lastWeek.end)}</span>} pad={false}>
      <table className="dash-weekly">
        <thead>
          <tr>
            <th />
            <th>Last week</th>
            <th>Week before</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {WEEKLY_ROWS.map(({ label, key, fmt }) => {
            const m = w[key];
            return (
              <tr key={key}>
                <td className="dash-weekly__label">{label}</td>
                <td>{cell(w.lastWeek.hasData, m.lastWeek, fmt)}</td>
                <td>{cell(w.weekBefore.hasData, m.weekBefore, fmt)}</td>
                <td className="dash-weekly__arrow">{m.direction ? ARROW[m.direction] : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </OsBlock>
  );
}

// ── Combat Log ──────────────────────────────────────────────────────────────────
function Pill({ text, color }: { text: string; color: string }) {
  return <span className="dash-pill" style={cssVars({ '--pill-color': color })}>{text}</span>;
}

function RunRow({ run }: { run: RunRead }) {
  const mobile = useMobile();
  const hr =
    run.avgHrBpm != null
      ? `♥ ${run.heatOffsetBpm > 0 && run.adjustedAvgHr != null ? `${run.avgHrBpm}→${Math.round(run.adjustedAvgHr)}` : run.avgHrBpm} bpm`
      : null;
  // Phone: a clean 2-line row (date + km + zone, then HR/label/flags) instead of one cramped flex line.
  if (mobile) {
    return (
      <div className="dash-run-mobile">
        <div className="dash-run-mobile__top">
          <div className="dash-run-mobile__date-group">
            <span className="dash-run-mobile__date">{dayOf(run.date)} {monthOf(run.date)}</span>
            <span className="dash-run-mobile__km">{round1(run.distanceKm)} km</span>
          </div>
          {run.zone != null && <ZonePill zone={run.zone} soft={isSoft(run)} />}
        </div>
        <div className="dash-run-mobile__meta">
          {run.label && <span className="dash-run-mobile__label">{run.label}</span>}
          {hr && <span className="dash-run-mobile__hr">{hr}</span>}
          {run.heatOffsetBpm > 0 && <Pill text={`🔥 −${Math.round(run.heatOffsetBpm)}`} color={C.danger} />}
          {run.driftFlag && <Pill text="⚑" color={C.danger} />}
        </div>
      </div>
    );
  }
  return (
    <div className="dash-run">
      <div className="dash-run__row">
        <div className="dash-run__date">
          <div className="dash-run__day">{dayOf(run.date)}</div>
          <div className="dash-run__month">{monthOf(run.date)}</div>
        </div>
        <span className="dash-run__km">{round1(run.distanceKm)} km</span>
        {run.zone != null && <ZonePill zone={run.zone} soft={isSoft(run)} />}
        {run.label && <span className="dash-run__label">{run.label}</span>}
        {run.avgHrBpm != null && (
          <span className="dash-run__hr">
            ♥ {run.heatOffsetBpm > 0 && run.adjustedAvgHr != null ? `${run.avgHrBpm}→${Math.round(run.adjustedAvgHr)} bpm` : `${run.avgHrBpm} bpm`}
          </span>
        )}
        {run.heatOffsetBpm > 0 && <Pill text={`🔥 −${Math.round(run.heatOffsetBpm)}`} color={C.danger} />}
        {run.driftFlag && <Pill text="⚑" color={C.danger} />}
      </div>
    </div>
  );
}

function BattleLog({ data }: { data: DashboardDTO }) {
  return (
    <OsBlock
      title="Combat Log · Recent Runs"
      pad={false}
    >
      <div className="dash-battlelog-body">
        {[...data.recentRuns].reverse().slice(0, 4).map((run) => (
          <RunRow key={run.date + run.distanceKm} run={run} />
        ))}
        <div className="dash-battlelog-divider">
          <StatRef label="All runs" value={String(data.totals.runCount)} hash="body/running" />
        </div>
      </div>
    </OsBlock>
  );
}

// ── Objectives ──────────────────────────────────────────────────────────────────
const fmtQuestVal = (v: number | null, unit: string): string => (v == null ? '—' : unit === 'min/km' ? fmtPace(v) : String(v));

function QuestBar({ q }: { q: QuestProgress }) {
  const color = q.done ? C.ok : C.danger;
  return (
    <div className="dash-quest">
      <div className="dash-quest__header">
        <div className="dash-quest__left">
          <span className="dash-quest__label">{q.label}</span>
          {q.done && <span className="dash-quest__done-chip">✓ DONE</span>}
        </div>
        <span className="dash-quest__value">
          <span className="dash-quest__value-current">{fmtQuestVal(q.current, q.unit)}</span>
          <span className="dash-quest__value-target"> / {fmtQuestVal(q.target, q.unit)} {q.unit}</span>
        </span>
      </div>
      <BarTrack pct={q.pct} color={color} height={10} />
      <div className="dash-quest__detail">{q.detail}</div>
    </div>
  );
}

function ActiveQuests({ data }: { data: DashboardDTO }) {
  return (
    <OsBlock title="Objectives" pad={false}>
      <div className="dash-quests-body">
        <span className="dash-quests-intro">On your way to your goals.</span>
        {data.quests.map((q) => (
          <QuestBar key={q.key} q={q} />
        ))}
      </div>
    </OsBlock>
  );
}

// ── Equipment ────────────────────────────────────────────────────────────────────
function Equipped({ data }: { data: DashboardDTO }) {
  const shoe = data.shoe;
  if (!shoe) {
    return (
      <SubTile className="dash-equip">
        <span className="dash-equip__eyebrow">Equipment</span>
        <div className="dash-equip__empty">No shoe data.</div>
      </SubTile>
    );
  }
  const pct = Math.min(100, Math.max(3, (shoe.authoritativeKm / 800) * 100));
  return (
    <SubTile className="dash-equip">
      <div className="dash-equip__header">
        <span className="dash-equip__eyebrow">Equipment</span>
        <span className="dash-equip__model">{shoe.model}</span>
      </div>
      <div className="dash-equip__bar-row">
        <div className="dash-equip__bar-track">
          <BarTrack pct={pct} color={C.gold} height={13} />
        </div>
        <span className="dash-equip__km">{shoe.authoritativeKm} km</span>
      </div>
      <div className="dash-equip__note">{shoe.note}</div>
    </SubTile>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────────
export function Dashboard({ data }: { data: DashboardDTO }) {
  const narrow = useNarrow();
  return (
    <div className="dash-root">
      {/* alignItems:'start' (not 'stretch') — since the vitals tiles moved to VITALS/Body.tsx
          (3.2 #2) this column is shorter than the character panel; forcing it to stretch would
          leave dead space below the weekly report instead of just sitting at its natural height. */}
      <div className={`dash-grid-top${narrow ? ' is-narrow' : ''}`}>
        <CharacterStatus data={data} />
        <div className="dash-grid-top__side">
          <Directive data={data} />
          {!narrow && <WeeklyReportBlock data={data} />}
        </div>
      </div>

      {narrow && <WeeklyReportBlock data={data} />}

      <div className={`dash-grid-bottom${narrow ? ' is-narrow' : ''}`}>
        <BattleLog data={data} />
        <div className="dash-grid-bottom__side">
          <ActiveQuests data={data} />
          <Equipped data={data} />
        </div>
      </div>
    </div>
  );
}
