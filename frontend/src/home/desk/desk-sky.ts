import type { DayPhase } from '@solace/core';

const PHASES: readonly DayPhase[] = ['dawn', 'day', 'dusk', 'night'];

/** Development preview: `?skyPhase=night` in the page URL pins the phase. Null when absent or not a phase. */
export function forcedSkyPhase(search: string): DayPhase | null {
  const value = new URLSearchParams(search).get('skyPhase');
  return PHASES.find(phase => phase === value) ?? null;
}
