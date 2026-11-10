import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate, openDatabase, resolveDbPath, SqliteRepository, type DB } from '@solace/data';

export function defaultDbPath(): string {
  // SOLACE_DB overrides the project DB (shared with @solace/server via resolveDbPath) — used by tests to point at a
  // throwaway DB so a CLI command (e.g. `seed`) never touches data/solace.sqlite.
  return resolveDbPath();
}

export interface CliContext {
  db: DB;
  repo: SqliteRepository;
}

/** Open (creating dirs), migrate, and wrap the DB in a Repository. */
export function openContext(dbPath: string = defaultDbPath()): CliContext {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDatabase(dbPath);
  migrate(db);
  return { db, repo: new SqliteRepository(db) };
}
