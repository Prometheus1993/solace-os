/**
 * Injected clock. Coaching and gamification must be deterministic and
 * replayable, so they NEVER call Date.now() directly — they take a Clock.
 * Tests pass a fixed clock; the CLI passes a real one (from backend/cli).
 */
import type { UnixSeconds } from './units.ts';

export interface Clock {
  /** Current instant, Unix seconds. */
  now(): UnixSeconds;
  /** Current calendar date in the athlete's local zone, ISO "YYYY-MM-DD". */
  today(): string;
}

/** A frozen clock for tests and reproducible reports. */
export const fixedClock = (unixSeconds: number, isoDate: string): Clock => ({
  now: () => unixSeconds as UnixSeconds,
  today: () => isoDate,
});
