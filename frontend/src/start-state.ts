import { canonicalHash, resolveArea } from './areas.ts';

/** Start-screen entry state (pure, so it can be tested without a DOM). */
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

const KEY = 'solace.entered';

/** "Entered this tab" flag in sessionStorage, falling back to memory when storage throws (blocked/private mode). */
export function createEntryState(getStorage: () => StorageLike) {
  let memory = false;
  return {
    hasEntered(): boolean {
      if (memory) return true;
      try { return getStorage().getItem(KEY) === '1'; } catch { return false; }
    },
    markEntered(): void {
      memory = true;
      try { getStorage().setItem(KEY, '1'); } catch { /* storage blocked: the in-memory flag still holds for this page load */ }
    },
  };
}

/** The hash to land on after entering: a valid deep link (an old area id is renamed to its new one) is kept, anything else becomes the desk. */
export function entryHash(hash: string): string {
  const h = hash.replace(/^#/, '');
  const area = resolveArea(h.split('/')[0] ?? '');
  return area ? canonicalHash(h) : 'desk';
}
