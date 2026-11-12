import type { CSSProperties, ReactNode } from 'react';
import type { Confidence, StatTier } from '@solace/core';
import { C, TIER_COLOR, ZONE_COLOR, confidenceColor, cssVars } from './tokens.ts';
import { TIER_LABELS } from './labels.ts';

/** A framed panel: the pixel-art frame over an opaque Surface 1 fill. */
export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="ui-panel" style={style}>
      {children}
    </div>
  );
}

/** Block header: ◆ diamond mark in the panel accent + letterspaced mono label, full-bleed bottom rule. */
function BlockHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="ui-block-header">
      <span className="ui-block-header__dot" />
      <span className="ui-block-header__label">{children}</span>
      {right}
    </div>
  );
}

/** Summary strip: the OS block's "headline" row, tinted with the block's `--directive-color`.
 *  Callers provide the spans; justify-between spreads them. */
export function Strip({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="ui-strip" style={style}>
      {children}
    </div>
  );
}

/** A full block: panel + BlockHeader + content. `pad:false` for full-bleed rows
 *  (list rows / Strips manage their own padding). Clickable when onClick is given. */
export function OsBlock({ title, right, onClick, pad = true, style, children }: { title: ReactNode; right?: ReactNode; onClick?: () => void; pad?: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      className={onClick ? 'ui-os-block ui-card-row' : 'ui-os-block'}
      onClick={onClick}
      style={style}
    >
      <BlockHeader right={right}>{title}</BlockHeader>
      <div className={pad ? 'ui-os-block__body' : undefined}>{children}</div>
    </div>
  );
}

export function SubTile({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={className ? `ui-sub-tile ${className}` : 'ui-sub-tile'} style={style}>
      {children}
    </div>
  );
}

export function ConfidenceChip({ level }: { level: Confidence }) {
  const c = confidenceColor(level);
  return <span className="ui-chip ui-chip--outline" style={cssVars({ '--chip-color': c })}>{level}</span>;
}

export function TierBadge({ tier }: { tier: StatTier }) {
  const c = TIER_COLOR[tier.name] ?? C.muted;
  return <span className="ui-chip ui-chip--filled" style={cssVars({ '--chip-color': c })} title={tier.name}>{TIER_LABELS[tier.name] ?? tier.name}</span>;
}

/** Progress bar: solid fill on a recessed track, thin border, square ends. */
export function BarTrack({ pct, color, height = 13 }: { pct: number; color: string; height?: number }) {
  const w = Math.max(2, Math.min(100, pct));
  return (
    <div className="ui-bar-track" style={{ height }}>
      <div className="ui-bar-track__fill" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function ZonePill({ zone, soft }: { zone: number; soft: boolean }) {
  const zc = ZONE_COLOR[zone] ?? C.muted;
  return (
    <span className={`ui-zone-pill${soft ? ' is-soft' : ''}`} style={cssVars({ '--zone-color': zc })}>
      Z{zone}
    </span>
  );
}
