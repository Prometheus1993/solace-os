import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Thrown when the default DB path would silently start an empty DB next to a pre-rename ragnarok.sqlite. */
export class LegacyDbError extends Error {}

/** The ONE demo DB path (`<cwd>/data/demo.sqlite`). Never reads SOLACE_DB, so the demo can never resolve to the live DB. */
export function demoDbPath(cwd: string = process.cwd()): string {
  return resolve(cwd, 'data', 'demo.sqlite');
}

/** True when the process runs in demo mode (`npm run demo` sets SOLACE_DEMO=1). */
export function isDemoEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['SOLACE_DEMO'] === '1';
}

/**
 * The DB path for the CLI and the server: in demo mode (SOLACE_DEMO=1) always data/demo.sqlite, else SOLACE_DB, else data/solace.sqlite under `cwd`.
 * Guard: on the default path, if the pre-rename data/ragnarok.sqlite exists and data/solace.sqlite does not,
 * throw instead of creating an empty DB (a sync would then fill it with a second, partial history).
 */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
  if (isDemoEnv(env)) return demoDbPath(cwd);
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
