import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { C, cssVars } from '../tokens.ts';
import { viewFromHash } from './hash-view.ts';

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function TabShell({ children }: { children: ReactNode }) {
  return <div className="ui-fade parts-tab-shell">{children}</div>;
}

/** Hash-synced sub-view state shared by the BODY / STUDY / SHELF areas (hash `#<area>/<view>`). */
export function useHashView<T extends string>(area: string, views: readonly { id: T }[], def: T): [T, (v: T) => void] {
  const fromHash = (): T => viewFromHash(window.location.hash, views, def);
  const [view, setViewState] = useState<T>(fromHash);
  useEffect(() => {
    const onHash = (): void => setViewState(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setView = (v: T): void => {
    window.location.hash = `${area}/${v}`;
    setViewState(v);
  };
  return [view, setView];
}

/** The sub-tab rail those areas render above their views (a tablist: arrow keys move between the tabs). */
export function SubNav<T extends string>({ views, view, setView }: { views: readonly { id: T; label: string }[]; view: T; setView: (v: T) => void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const to = (views.findIndex((v) => v.id === view) + (e.key === 'ArrowRight' ? 1 : views.length - 1)) % views.length;
    setView(views[to]!.id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
  };
  return (
    <div className="parts-subnav" role="tablist" onKeyDown={onKeyDown}>
      {views.map((v) => {
        const active = v.id === view;
        return (
          <button
            key={v.id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setView(v.id)}
            className={`parts-subnav__btn${active ? ' is-active' : ''}`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

export function Card({
  title,
  children,
  style,
  accent = C.gold,
  headerRight,
}: {
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
  /** Accent colour for the title mark (one accent per card). */
  accent?: string;
  /** Optional right-aligned slot in the title row (e.g. a "＋ Add" add button). */
  headerRight?: ReactNode;
}) {
  return (
    <div className="parts-card" style={{ ...cssVars({ '--panel-accent': accent }), ...style }}>
      {title && (
        <>
          <div className="parts-card__title-row">
            <div className="parts-card__title-left">
              <span className="parts-card__title-dot" />
              <div className="parts-card__title-text">{title.replace(/^[◆■▪◇•▶▸▮▯]\s*/, '')}</div>
            </div>
            {headerRight}
          </div>
          <div className="parts-card__divider" />
        </>
      )}
      {children}
    </div>
  );
}

/** Inline editor container for {@link AccordionList} — a nested sub-panel tied to its row by a cyan
 *  left-accent. `scroll` brings the whole form into view ONCE when it opens (a mount-only effect, so
 *  it never re-fires on keystrokes even though the parent re-renders the list on every change). */
export function InsetPanel({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [scroll]);
  return (
    <div ref={ref} className="parts-inset-panel">
      {children}
    </div>
  );
}

/** A list whose rows expand IN PLACE: when `editingId` matches an item, `renderEditor` is rendered in an
 *  {@link InsetPanel} right under that row — instead of a single edit form far below the list, which would
 *  mean scrolling down to edit each item. Row+editor are wrapped in one keyed div so the editor hugs its
 *  row (the `gap` stays only between items). Callers pass `renderEditor={() => renderForm()}`. */
export function AccordionList<T extends { id: number }>({
  items,
  editingId,
  renderRow,
  renderEditor,
  empty,
  gap = 8,
}: {
  items: T[];
  editingId: number | null;
  renderRow: (item: T) => ReactNode;
  renderEditor: (item: T) => ReactNode;
  empty?: ReactNode;
  gap?: number;
}) {
  return (
    <div className="parts-accordion-list" style={{ gap }}>
      {items.map((item) => (
        <div key={item.id}>
          {renderRow(item)}
          {editingId === item.id && <InsetPanel scroll>{renderEditor(item)}</InsetPanel>}
        </div>
      ))}
      {items.length === 0 && empty != null && <div className="parts-accordion-list__empty">{empty}</div>}
    </div>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="parts-tile-grid">{children}</div>;
}

export function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const accent = color ?? C.gold;
  const valueColor = color ?? C.headingWarm;
  return (
    <div className="parts-stat-tile" style={cssVars({ '--tile-accent': accent, '--tile-value-color': valueColor })}>
      <div className="parts-stat-tile__label">{label}</div>
      <div className="parts-stat-tile__value">{value}</div>
      {sub && <div className="parts-stat-tile__sub">{sub}</div>}
    </div>
  );
}

/** SVG line chart: 1px miter stroke, square dots, mono labels. Colours set via `style`
 * (not SVG attributes) so the CSS-var tokens resolve. */
export function LineChart({
  data,
  color,
  height = 132,
  unit = '',
  precision = 0,
}: {
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  unit?: string;
  precision?: number;
}) {
  const [hi, setHi] = useState<number | null>(null);
  if (data.length < 2) return <div className="parts-chart-empty">too little data for a chart</div>;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = data.length;
  const xAt = (i: number) => (i / (n - 1)) * 100;
  const yAt = (v: number) => 100 - ((v - min) / span) * 90 - 5; // 5% padding top/bottom
  const line = data.map((d, i) => `${xAt(i)},${yAt(d.value)}`).join(' ');
  const last = data[n - 1]!;
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHi(clamp(Math.round(((e.clientX - rect.left) / rect.width) * (n - 1)), 0, n - 1));
  };
  const h = hi != null ? data[hi]! : null;
  const dotStyle = (x: number, y: number, sz: number): CSSProperties => ({
    left: `${x}%`, top: `${y}%`, width: sz, height: sz, background: color,
  });
  return (
    <div>
      <div className="parts-linechart__area" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="parts-linechart__svg">
          <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" strokeLinecap="butt" stroke={color} strokeWidth={1} />
        </svg>
        {h && hi != null ? (
          <>
            <div className="parts-linechart__hoverline" style={{ left: `${xAt(hi)}%`, background: color }} />
            <span className="parts-linechart__dot" style={dotStyle(xAt(hi), yAt(h.value), 6)} />
            <div className="parts-tooltip" style={{ top: 2, left: `${clamp(xAt(hi), 12, 88)}%` }}>
              <span className="parts-chart-muted">{h.label} · </span>
              <strong>{h.value.toFixed(precision)}{unit}</strong>
            </div>
          </>
        ) : (
          <span className="parts-linechart__dot" style={dotStyle(xAt(n - 1), yAt(last.value), 6)} />
        )}
        <span className="parts-linechart__extreme is-max">{max.toFixed(precision)}{unit}</span>
        <span className="parts-linechart__extreme is-min">{min.toFixed(precision)}{unit}</span>
      </div>
      <div className="parts-linechart__footer">
        <span>{data[0]!.label}</span>
        <span className="parts-chart-muted">latest: <strong className="parts-chart-text">{last.value.toFixed(precision)}{unit}</strong></span>
        <span>{last.label}</span>
      </div>
    </div>
  );
}

/** Vertical bar chart with labels under each bar. Last/hovered bar is highlighted (flat). */
export function BarChart({
  data,
  color,
  height = 120,
  unit = '',
  precision = 0,
}: {
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  unit?: string;
  precision?: number;
}) {
  const [hi, setHi] = useState<number | null>(null);
  if (data.length === 0) return <div className="parts-chart-empty">no data yet</div>;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const n = data.length;
  return (
    <div>
      <div className="parts-barchart__bars" style={{ height }} onMouseLeave={() => setHi(null)}>
        {data.map((d, i) => (
          <div key={i} onMouseEnter={() => setHi(i)} className="parts-barchart__bar-wrap">
            <div className="parts-barchart__bar" style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, background: color, opacity: hi === i ? 1 : hi == null && i === n - 1 ? 1 : 0.45 }} />
          </div>
        ))}
        {hi != null && (
          <div className="parts-tooltip" style={{ top: 0, transform: 'translate(-50%,-115%)', left: `${clamp(((hi + 0.5) / n) * 100, 10, 90)}%` }}>
            <span className="parts-chart-muted">{data[hi]!.label} · </span>
            <strong>{data[hi]!.value.toFixed(precision)}{unit}</strong>
          </div>
        )}
      </div>
      <div className="parts-barchart__labels">
        {data.map((d, i) => (
          <div key={i} className={`parts-barchart__label${hi === i ? ' is-active' : ''}`}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

// --- Life-sim shared bits (used by Missions / Archives) --------------

/** Labelled form field (uppercase eyebrow + control). */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="parts-field">
      <span className="parts-field__label">{label}</span>
      {children}
    </label>
  );
}

/** Pure render of a DTO-supplied countdown (deterministic; NO date math here). */
export function Countdown({ daysUntil, status }: { daysUntil: number | null; status?: 'scheduled' | 'pending' | 'graded' }) {
  if (status === 'pending') return <span className="parts-countdown-pending">PENDING</span>;
  if (status === 'graded') return null; // a graded exam's pass/fail is shown by its grade chip
  if (daysUntil == null) return <span className="parts-countdown-dash">—</span>;
  const txt = daysUntil > 0 ? `T-${daysUntil} ${daysUntil === 1 ? 'DAY' : 'DAYS'}` : daysUntil === 0 ? 'T-0 · TODAY' : `T+${-daysUntil} OVERDUE`;
  return <span className={`parts-countdown${daysUntil <= 0 ? ' is-overdue' : ''}`}>{txt}</span>;
}

/** One-line reference to a stat/section that's rendered in FULL somewhere else: a muted uppercase
 *  label, a mono value, and a `▸` link that jumps to the owning tab/sub-view (same `window.location.hash
 *  = '<area>/<view>'` mechanism as {@link useHashView}). Visually echoes the Strip's label/value rhythm
 *  but is deliberately NOT a "headline" strip or a card — just a link row, so a canonical stat
 *  never grows a second full rendering elsewhere (3.2). `stopPropagation` keeps a click from also
 *  firing a clickable parent row/block's own `onClick` (StatRef is often nested inside one, e.g. Home's
 *  OsBlocks). */
export function StatRef({ label, value, hash }: { label: string; value: ReactNode; hash: string }) {
  return (
    <button
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        window.location.hash = hash;
      }}
      className="parts-statref"
    >
      <span className="parts-statref__label">{label}</span>
      <span className="parts-statref__value-wrap">
        <span className="parts-statref__value">{value}</span>
        <span className="parts-statref__arrow">▸</span>
      </span>
    </button>
  );
}

/** Segmented filter strip (outlined chips). */
export function FilterTabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="parts-filtertabs">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            aria-pressed={on}
            onClick={() => onChange(t.id)}
            className={`parts-filtertabs__btn${on ? ' is-active' : ''}`}
          >
            {t.label}
            {t.count != null ? ` · ${t.count}` : ''}
          </button>
        );
      })}
    </div>
  );
}

/** GET JSON from the read API; returns the parsed object, or null on network/parse error. */
export async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** POST (or PATCH) JSON and return the FULL parsed response object (for endpoints richer than ok/error,
 * e.g. the prose parsers). Returns null on network/parse error. */
export async function postJsonFull<T>(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T | null> {
  try {
    const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

/** POST/PATCH/DELETE JSON to the write API; returns a UI message ('' on success, '⚠ …' on error). */
export async function postJson(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<string> {
  try {
    const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body != null ? JSON.stringify(body) : undefined });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return res.ok && j.ok ? '' : `⚠ ${j.error ?? `HTTP ${res.status}`}`;
  } catch (e) {
    return `⚠ ${String(e)}`;
  }
}
