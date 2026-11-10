type DeckSignal = 'active' | 'blocked' | 'unknown';

/** A finished request does not imply success, so there is no "confirmed" state. */
export function deckSignal(syncing: boolean, busy: boolean): { kind: DeckSignal; label: string } {
  if (syncing) return { kind: 'active', label: 'UPLINK IN PROGRESS' };
  if (busy) return { kind: 'blocked', label: 'SYSTEM BUSY' };
  return { kind: 'unknown', label: 'NO CONFIRMED SIGNAL' };
}
