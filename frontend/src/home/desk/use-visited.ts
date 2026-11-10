import { useState } from 'react';

/** Tracks which panels have been opened at least once, so they mount on first visit and stay mounted. */
export function useVisited<T>(initial: T[] = []) {
  const [visited, setVisited] = useState<Set<T>>(() => new Set(initial));
  return [visited, (item: T) => setVisited(previous => new Set([...previous, item]))] as const;
}
