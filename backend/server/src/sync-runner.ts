import type { Clock } from '@solace/core';
import { GarminSyncError, syncGarmin, type GarminSyncSummary, type OpenMeteoClient, type SqliteRepository } from '@solace/data';
import type { Deps } from './deps.ts';

/** `busy` = another sync holds the lock; `failed` = a GarminSyncError (any other error is rethrown). */
export type SyncOutcome =
  | { state: 'busy' }
  | { state: 'ok'; summary: GarminSyncSummary }
  | { state: 'failed'; kind: GarminSyncError['kind']; message: string };

export interface SyncRunner {
  run: () => Promise<SyncOutcome>;
}

/** The Garmin sync path behind ⟲ SYNC: one `syncing` flag (a second caller gets `busy`) and the serialised
 *  write queue. */
export function createSyncRunner({ repo, clock, weather, serialize, doSync = syncGarmin }: { repo: SqliteRepository; clock: Clock; weather: OpenMeteoClient; serialize: Deps['serialize']; doSync?: typeof syncGarmin | undefined }): SyncRunner {
  let syncing = false;
  return {
    async run() {
      if (syncing) return { state: 'busy' };
      syncing = true;
      try {
        const summary = await serialize(() => doSync(repo, clock, weather));
        return { state: 'ok', summary };
      } catch (err) {
        if (!(err instanceof GarminSyncError)) throw err; // dispatch logs it and returns the generic 500
        return { state: 'failed', kind: err.kind, message: err.message };
      } finally {
        syncing = false;
      }
    },
  };
}

/** Stands in for `syncGarmin` when the server runs on the demo DB: never spawns the fetcher or touches source-exports/. */
export const demoSyncDisabled: typeof syncGarmin = async () => {
  throw new GarminSyncError('Garmin sync is disabled in the demo.', 'fetch');
};
