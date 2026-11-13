/** Design tokens: colour + a few small formatters — layout sizing/spacing/fonts live in
 * styles/components/*.css as clamp() literals now, not here. Colours are CSS variables (defined once
 * in styles/tokens.css); read as `C.x` everywhere — values are
 * `'var(--x)'` strings, usable in inline styles or CSS alike. `cssVars()` below is the one place a
 * component sets a CSS custom property inline for a data-driven value a stylesheet then reads. */
import type { CSSProperties } from 'react';
import type { Confidence } from '@solace/core';

/** Typed helper for setting CSS custom properties inline (data-driven values only — e.g. an
 * accent colour prop, a computed percentage/width) that a component's stylesheet then reads via
 * `var(--x)`. React's CSSProperties type doesn't know about custom properties, hence the cast;
 * this is the one sanctioned place for it. Usage: `style={cssVars({ '--accent': st.color })}`. */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties;
}

export const C = {
  pageBg: 'var(--color-base)',
  panel: 'var(--color-surface-1)',
  panelBorder: 'var(--color-border)',
  subTile: 'var(--color-surface-2)',
  subBorder: 'var(--color-border)',
  trackBg: 'var(--color-surface-input)',
  trackBorder: 'var(--color-border)',
  hairline: 'var(--color-hairline)',
  gold: 'var(--color-cyan)', // the default light: interaction and data
  text: 'var(--color-text-1)',
  headingWarm: 'var(--color-text-1)',
  muted: 'var(--color-text-2)',
  muted2: 'var(--color-text-2)',
  muted3: 'var(--color-text-3)',
  faint: 'var(--color-text-3)',
  faint2: 'var(--color-text-3)',
  nullText: 'var(--color-text-4)',
  onAccent: 'var(--color-text-on-accent)', // text/marks that sit on a filled accent surface
  ok: 'var(--color-ok)', // success / done
  danger: 'var(--color-danger)', // overdue/failed/delete only
} as const;

export const STAT_COLOR = { stamina: 'var(--stat-stamina)', strength: 'var(--stat-strength)', leanness: 'var(--stat-leanness)' } as const;

/** RPG rank colours per tier: the ramp climbs grey, cyan, violet, amber; only Mythic gets the hot colour. */
export const TIER_COLOR: Record<string, string> = {
  Novice: 'var(--tier-novice)',
  Apprentice: 'var(--tier-apprentice)',
  Adept: 'var(--tier-adept)',
  Veteran: 'var(--tier-veteran)',
  Elite: 'var(--tier-elite)',
  Mythic: 'var(--tier-mythic)',
};
export const ZONE_COLOR: Record<number, string> = { 1: 'var(--zone-1)', 2: 'var(--zone-2)', 3: 'var(--zone-3)', 4: 'var(--zone-4)', 5: 'var(--zone-5)' };

export const confidenceColor = (c: Confidence): string => (c === 'high' ? 'var(--color-ok)' : c === 'medium' ? 'var(--zone-3)' : 'var(--color-text-2)');

/** Directive verbs (UI-only). */
export const READINESS: Record<string, { verb: string; color: string }> = {
  go_hard: { verb: 'TRAIN', color: 'var(--color-ok)' },
  go_easy: { verb: 'EASY', color: 'var(--color-amber)' },
  rest: { verb: 'REST', color: 'var(--color-danger)' },
};

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Shared number format: from 10,000 up compact with "k" (55647 -> "55.65k", 15000 -> "15k"); below that
 * max 2 decimals. Trailing zeros are always trimmed. */
export function fmtNum(n: number): string {
  const trim = (v: number): string => `${Math.round(v * 100) / 100}`;
  return Math.abs(n) >= 10_000 ? `${trim(n / 1000)}k` : trim(n);
}
/** Format INTEGER EUR CENTS as a fixed 2-decimal euro string, e.g. 16077 -> "€160.77", 0 -> "€0.00". */
export const formatEur = (cents: number): string => `€${(Math.round(cents) / 100).toFixed(2)}`;
/** Capitalise the first letter, lowercase the rest ("STRENGTH" → "Strength"). */
export const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-06-19" -> "Jun 19, 2026". */
export const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  const mi = Number(m) - 1;
  return `${MONTHS[mi] ?? '?'} ${Number(d)}, ${y}`;
};

export const dayOf = (iso: string): string => String(Number(iso.slice(8, 10)));
export const monthOf = (iso: string): string => (MONTHS[Number(iso.slice(5, 7)) - 1] ?? '').toUpperCase();

export const todayIso = (): string => new Date().toLocaleDateString('sv-SE');
export const ddmm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Compact T-minus for a countdown ("T-3" / "TODAY" / "+2"). */
export const tMinus = (d: number | null): string => (d == null ? '—' : d > 0 ? `T-${d}` : d === 0 ? 'TODAY' : `+${-d}`);
/** Pace/duration as m:ss (e.g. 5.5 -> "5:30"). */
export const fmtPace = (p: number): string => {
  const mins = Math.floor(p);
  const secs = Math.round((p % 1) * 60);
  // Carry a rounded-up 60s back into minutes (mirrors units.ts formatPace).
  const adjMins = secs === 60 ? mins + 1 : mins;
  const adjSecs = secs === 60 ? 0 : secs;
  return `${adjMins}:${String(adjSecs).padStart(2, '0')}`;
};
