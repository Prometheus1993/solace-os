import type { DayPhase } from '@solace/core';

const PHASES: readonly DayPhase[] = ['dawn', 'day', 'dusk', 'night'];

/** Lamp atlas cell: 0 = off, 1 = on. The lamp burns from dusk until dawn begins. */
export const lampFrame = (phase: DayPhase) => phase === 'dusk' || phase === 'night' ? 1 : 0;

/** Development preview: `?skyPhase=night` in the page URL pins the phase. Null when absent or not a phase. */
export function forcedSkyPhase(search: string): DayPhase | null {
  const value = new URLSearchParams(search).get('skyPhase');
  return PHASES.find(phase => phase === value) ?? null;
}
