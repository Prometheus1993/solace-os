import { describe, expect, it } from 'vitest';
import { forcedSkyPhase, lampFrame } from './desk-sky.ts';

describe('desk sky', () => {
  it('lights the lamp at dusk and night only', () => {
    expect(lampFrame('dawn')).toBe(0);
    expect(lampFrame('day')).toBe(0);
    expect(lampFrame('dusk')).toBe(1);
    expect(lampFrame('night')).toBe(1);
  });
  it('reads a forced phase from the query string and ignores anything else', () => {
    for (const phase of ['dawn', 'day', 'dusk', 'night'] as const) expect(forcedSkyPhase(`?skyPhase=${phase}`)).toBe(phase);
    expect(forcedSkyPhase('?a=1&skyPhase=night')).toBe('night');
    expect(forcedSkyPhase('')).toBeNull();
    expect(forcedSkyPhase('?skyPhase=noon')).toBeNull();
    expect(forcedSkyPhase('?skyphase=night')).toBeNull();
  });
});
