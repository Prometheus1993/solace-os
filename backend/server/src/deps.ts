import type { Clock } from '@solace/core';
import type { OpenMeteoClient, SqliteRepository } from '@solace/data';
import type { SyncRunner } from './sync-runner.ts';

/** What the route modules need. Built once at boot (index.ts) and passed in, so no route opens the DB. */
export interface Deps {
  repo: SqliteRepository;
  clock: Clock;
  weather: OpenMeteoClient;
  /** Run a mutation that recomputes the stat tracks strictly after the previous one finished. */
  serialize: <T>(fn: () => Promise<T>) => Promise<T>;
  /** The one Garmin sync path (the ⟲ SYNC route): busy flag and write queue. */
  sync: SyncRunner;
  /** Outgoing HTTP for the Google Books routes; tests inject a fake. Default: the global fetch. */
  fetch?: typeof fetch;
}

// recomputeStats does a read-prev → append, so two overlapping recomputes (e.g. a weigh-in POST arriving
// mid-sync) would both read the same history and append DUPLICATE stat_history rows. This in-process
// promise chain runs them one after another. (better-sqlite3 ops are themselves synchronous/atomic.)
export function createSerializer(): Deps['serialize'] {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
