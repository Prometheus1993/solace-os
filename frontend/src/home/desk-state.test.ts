import { describe, expect, it } from 'vitest';
import { deckSignal } from './desk-state.ts';

describe('cyberdeck feedback', () => {
  it('shows activity over the busy state and blocks duplicate requests', () => {
    expect(deckSignal(true, true).kind).toBe('active');
    expect(deckSignal(false, true).kind).toBe('blocked');
  });
  it('does not manufacture success when a request ends without confirmed data', () => {
    expect(deckSignal(false, false).kind).toBe('unknown');
  });
});
