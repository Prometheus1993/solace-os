import Database from 'better-sqlite3';

export type DB = Database.Database;

export interface OpenOptions {
  /** ":memory:" for tests, or a file path. */
  readonly?: boolean;
}

/**
 * Open a SQLite database with the pragmas this app relies on:
 * - foreign_keys ON  (so ON DELETE CASCADE and FK checks actually fire)
 * - WAL            (better concurrent read behaviour; harmless for a local app)
 */
export function openDatabase(path: string, options: OpenOptions = {}): DB {
  const db = new Database(path, { readonly: options.readonly ?? false });
  db.pragma('foreign_keys = ON');
  if (!options.readonly) {
    db.pragma('journal_mode = WAL');
  }
  return db;
}
