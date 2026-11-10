/** Same query everywhere: callers read `.matches` once, per use, or subscribe to `change`. */
export const reducedMotionQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/** localStorage read; null when the key is absent or storage is unavailable. */
export function readStored(key: string, storage?: Pick<Storage, 'getItem'>) {
  try { return (storage ?? localStorage).getItem(key); } catch { return null; }
}

/** localStorage write; false when storage is unavailable or full. */
export function writeStored(key: string, value: string, storage?: Pick<Storage, 'setItem'>) {
  try { (storage ?? localStorage).setItem(key, value); return true; } catch { return false; }
}
