import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DashboardDTO, LevelEvent } from '@solace/core';
import { C, STAT_COLOR, cssVars, titleCase } from './tokens.ts';

/**
 * Full-screen "LEVEL UP" fanfare (flat YoRHa). Mounted once at the app root; watches `levelEvents`
 * and fires ONLY on a genuinely new level-up (a signature ref guards against the 30s poll re-firing).
 * Particle angles are index-derived (no Math.random). Reduced-motion → a static flash via FX_CSS.
 */
const STAT_KEY: Record<LevelEvent['stat'], keyof typeof STAT_COLOR> = { STAMINA: 'stamina', STRENGTH: 'strength', LEANNESS: 'leanness' };

export function FxOverlay({ events }: { events: DashboardDTO['levelEvents'] }) {
  const [active, setActive] = useState<LevelEvent | null>(null);
  const seen = useRef('');
  useEffect(() => {
    const ups = events.filter((e) => e.trigger === 'level_up');
    const sig = ups.map((e) => `${e.stat}:${e.level}:${e.date}`).join('|');
    if (ups.length === 0 || sig === seen.current) return;
    seen.current = sig;
    setActive(ups[0]!);
    const t = window.setTimeout(() => setActive(null), 2600);
    return () => window.clearTimeout(t);
  }, [events]);

  if (!active) return null;
  const color = STAT_COLOR[STAT_KEY[active.stat]] ?? C.gold;
  return (
    <div className="fx-overlay">
      <div className="fx-flash" style={{ background: `radial-gradient(circle at 50% 45%, color-mix(in srgb, ${color} 22%, transparent), transparent 60%)` }} />
      {Array.from({ length: 14 }, (_, i) => {
        const ang = (i / 14) * Math.PI * 2;
        return <span key={i} className="fx-shard" style={shardStyle(Math.cos(ang) * 230, Math.sin(ang) * 230, color)} />;
      })}
      <div className="fx-text">
        <div className="fx-title" style={{ color }}>LEVEL UP</div>
        <div className="fx-subtitle">{titleCase(active.stat)} → LV {active.level}</div>
      </div>
    </div>
  );
}

const shardStyle = (dx: number, dy: number, color: string): CSSProperties => ({
  background: color,
  ...cssVars({ '--dx': `${dx}px`, '--dy': `${dy}px` }),
});
