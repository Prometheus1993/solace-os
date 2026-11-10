import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Thrown when the default DB path would silently start an empty DB next to a pre-rename ragnarok.sqlite. */
export class LegacyDbError extends Error {}

/**
 * The DB path for the CLI and the server: SOLACE_DB, else data/solace.sqlite under `cwd`.
 * Guard: on the default path, if the pre-rename data/ragnarok.sqlite exists and data/solace.sqlite does not,
 * throw instead of creating an empty DB (a sync would then fill it with a second, partial history).
 */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
  const fromEnv = env['SOLACE_DB'];
  if (fromEnv) return fromEnv;
  const path = resolve(cwd, 'data', 'solace.sqlite');
  if (existsSync(resolve(cwd, 'data', 'ragnarok.sqlite')) && !existsSync(path)) {
    throw new LegacyDbError(
      'Found data/ragnarok.sqlite but no data/solace.sqlite. The project was renamed to Solace and the database ' +
        'file name changed. Nothing was created or changed. Follow "Upgrading from ragnarok" in the README ' +
        '(rename ragnarok.sqlite, -wal and -shm together), then start again.',
    );
  }
  return path;
}
