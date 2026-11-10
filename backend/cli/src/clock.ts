import type { Clock, UnixSeconds } from '@solace/core';

/** Real wall-clock. The ONLY place a live Date is read for domain time. */
export function systemClock(): Clock {
  return {
    now: () => Math.floor(Date.now() / 1000) as UnixSeconds,
    // 'sv-SE' locale renders local time as "YYYY-MM-DD".
    today: () => new Date().toLocaleDateString('sv-SE'),
  };
}
