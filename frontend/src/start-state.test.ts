import { describe, expect, it } from 'vitest';
import { createEntryState, entryHash, type StorageLike } from './start-state.ts';

const AREAS = ['home', 'training', 'school', 'archives'];
const mem = (): StorageLike => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };
const throwing = (): StorageLike => ({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });

describe('start-screen entry state', () => {
  it('shows the screen on a fresh session, then remembers entry in storage', () => {
    const store = mem();
    expect(createEntryState(() => store).hasEntered()).toBe(false);
    createEntryState(() => store).markEntered();
    expect(createEntryState(() => store).hasEntered()).toBe(true); // a reload reads the same session storage
  });
  it('falls back to memory when storage throws, without crashing', () => {
    const s = createEntryState(throwing);
    expect(s.hasEntered()).toBe(false);
    expect(() => s.markEntered()).not.toThrow();
    expect(s.hasEntered()).toBe(true);
  });
});

describe('entryHash (deep-link preservation)', () => {
  it('keeps a valid deep link as is', () => {
    expect(entryHash('#training/running', AREAS)).toBe('training/running');
    expect(entryHash('#archives/manga', AREAS)).toBe('archives/manga');
  });
  it('falls back to home for empty or unknown hashes', () => {
    expect(entryHash('', AREAS)).toBe('home');
    expect(entryHash('#nope/x', AREAS)).toBe('home');
  });
});
