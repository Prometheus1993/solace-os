import type { DashboardDTO, ReadinessRecommendation, StatJourney } from '@solace/core';
import { round1 } from '../../tokens.ts';

export type StatKey = 'stamina' | 'strength' | 'leanness';

/** Which art layer each stat lights. The head layer is not tied to a stat and glows at a fixed level. */
export const STAT_ZONE = { stamina: 'legs', strength: 'arms-torso', leanness: 'silhouette' } as const;
export const HEAD_GLOW = 0.7;

/** The glow of a stat zone: 0.2 at LV0 (still visible) up to 1 at LV100, linear in the level. A level outside 0-100 (or not finite) clamps. */
export function zoneBrightness(level: number): number {
  const clamped = Number.isFinite(level) ? Math.min(100, Math.max(0, level)) : 0;
  return 0.2 + clamped * 0.008;
}

export type ConditionWord = 'READY' | 'STEADY' | 'RECOVER';
export type Condition = { word: ConditionWord; tone: 'ok' | 'info' | 'warn' };

/** Today's condition from the EXISTING readiness gate (sleep, HRV, resting HR; coaching/readiness.ts), not a second formula:
 *  go_hard to READY, go_easy to STEADY, rest to RECOVER. */
const CONDITIONS: Record<ReadinessRecommendation, Condition> = {
  go_hard: { word: 'READY', tone: 'ok' },
  go_easy: { word: 'STEADY', tone: 'info' },
  rest: { word: 'RECOVER', tone: 'warn' },
};
export const conditionOf = (recommendation: ReadinessRecommendation): Condition => CONDITIONS[recommendation];

export type JourneyRow = { sinceDate: string; startValue: number; startLevel: number; valueDelta: number; levelDelta: number };

/** How far a stat moved since its journey start. Null when the stat has no history since its fresh start. */
export function journeyRow(journey: StatJourney | null, current: { value: number; level: number }): JourneyRow | null {
  if (!journey) return null;
  return {
    sinceDate: journey.sinceDate,
    startValue: journey.startValue,
    startLevel: journey.startLevel,
    valueDelta: round1(current.value - journey.startValue),
    levelDelta: current.level - journey.startLevel,
  };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** `2026-06-22` becomes `22 JUN`. */
export const shortDate = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** `+4 LV · +6.2` for a moved stat, `±0 LV` for a flat one. */
export const journeyText = (row: JourneyRow): string => `${signed(row.levelDelta)} LV · ${signed(row.valueDelta)}`;

/** The callout label next to the hologram: `STAMINA` over `LV 34 · ADEPT`. */
export const calloutLabel = (stat: StatKey, dto: Pick<DashboardDTO, 'stats'>): { name: string; detail: string } => ({
  name: stat.toUpperCase(),
  detail: `LV ${dto.stats[stat].level} · ${dto.stats[stat].tier.name.toUpperCase()}`,
});
