import { MIGRATIONS, type Migration } from './schema.ts';
import type { DB } from './connection.ts';

/**
 * Forward-only migrator. Applies any migrations newer than the recorded version,
 * each in its own transaction, recording the version in schema_migrations.
 * Re-running on an up-to-date database is a no-op (idempotent).
 */
export function migrate(db: DB, migrations: Migration[] = MIGRATIONS): { applied: number[] } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const currentVersion =
    (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }).v ?? 0;

  const pending = [...migrations].sort((a, b) => a.version - b.version).filter((m) => m.version > currentVersion);

  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
  const applied: number[] = [];

  for (const migration of pending) {
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      // applied_at uses a wall-clock read; that's fine here (audit metadata, not
      // domain logic). Domain time always comes from the injected Clock.
      record.run(migration.version, migration.name, Date.now());
    });
    apply();
    applied.push(migration.version);
  }

  return { applied };
}
