import { describe, expect, it } from 'vitest';
import { GOOGLE_BOOKS_KEY_SETTING, MIGRATIONS, migrate, openDatabase, resolveBooksKey, SqliteRepository, testBooksKey } from '../src/index.ts';

const KEY = 'AIza' + 'a'.repeat(35);

const fresh = () => {
  const db = openDatabase(':memory:');
  migrate(db);
  return { db, repo: new SqliteRepository(db) };
};

describe('migration v22 app_settings (#43)', () => {
  it('is additive: it creates app_settings and leaves the existing tables alone', () => {
    const db = openDatabase(':memory:');
    migrate(db, MIGRATIONS.filter((m) => m.version <= 21));
    const names = () => (db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string; sql: string }[]);
    const before = names();
    expect(before.map((t) => t.name)).not.toContain('app_settings');
    migrate(db);
    const after = names();
    expect(after.map((t) => t.name)).toEqual([...before.map((t) => t.name), 'app_settings'].sort());
    for (const t of before) expect(after.find((a) => a.name === t.name)?.sql).toBe(t.sql);
    expect((db.prepare('PRAGMA table_info(app_settings)').all() as { name: string }[]).map((c) => c.name)).toEqual(['key', 'value', 'updated_at']);
    db.close();
  });
});

describe('app settings repo', () => {
  it('gets, upserts and deletes one setting', async () => {
    const { repo } = fresh();
    expect(await repo.getSetting('k')).toBeNull();
    await repo.setSetting('k', 'a', '2026-11-10T00:00:00Z');
    await repo.setSetting('k', 'b', '2026-11-10T00:00:01Z');
    expect(await repo.getSetting('k')).toBe('b');
    await repo.deleteSetting('k');
    expect(await repo.getSetting('k')).toBeNull();
  });
});

describe('resolveBooksKey precedence', () => {
  it('env > app > none', async () => {
    const { repo } = fresh();
    expect(await resolveBooksKey(repo, {})).toBeNull();
    await repo.setSetting(GOOGLE_BOOKS_KEY_SETTING, KEY, 'now');
    expect(await resolveBooksKey(repo, {})).toEqual({ key: KEY, source: 'app' });
    expect(await resolveBooksKey(repo, { GOOGLE_BOOKS_API_KEY: '  ' })).toEqual({ key: KEY, source: 'app' });
    expect(await resolveBooksKey(repo, { GOOGLE_BOOKS_API_KEY: 'ENVKEY' })).toEqual({ key: 'ENVKEY', source: 'env' });
  });
});

describe('testBooksKey', () => {
  const answer = (status: number) => (async () => new Response('{}', { status })) as typeof fetch;

  it('200 is ok; 400/403, 429, other statuses and network failures are plain messages without the key', async () => {
    expect(await testBooksKey(KEY, answer(200))).toEqual({ ok: true });
    const results = [
      await testBooksKey(KEY, answer(400)),
      await testBooksKey(KEY, answer(403)),
      await testBooksKey(KEY, answer(429)),
      await testBooksKey(KEY, answer(500)),
      await testBooksKey(KEY, (async () => { throw new Error(`fetch failed for key=${KEY}`); }) as typeof fetch),
    ];
    expect(results.map((r) => (r.ok ? 0 : r.status))).toEqual([400, 403, 429, 500, 0]);
    expect(results[0]).toMatchObject({ ok: false, message: expect.stringContaining('Books API') });
    expect(results[2]).toMatchObject({ ok: false, message: expect.stringContaining('Quota') });
    expect(JSON.stringify(results)).not.toContain(KEY);
  });

  it('sends the key to Google Books', async () => {
    let url = '';
    await testBooksKey(KEY, (async (u: string) => { url = u; return new Response('{}'); }) as unknown as typeof fetch);
    expect(url).toContain('https://www.googleapis.com/books/v1/volumes');
    expect(url).toContain(`key=${KEY}`);
  });
});
