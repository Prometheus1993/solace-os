import { DEFAULT_CONFIG, DEFAULT_SHOE } from '@solace/core';
import { migrate, openDatabase, SqliteRepository } from '@solace/data';
import { describe, expect, it } from 'vitest';
import { seed } from '../src/commands/seed.ts';

function freshRepo() {
  const db = openDatabase(':memory:');
  migrate(db);
  return { db, repo: new SqliteRepository(db) };
}

describe('seed', () => {
  it('on an empty DB writes the default config + example shoe, idempotently', async () => {
    const { db, repo } = freshRepo();

    await seed(repo);
    await seed(repo); // re-run must not duplicate

    const cfg = await repo.getAthleteConfig();
    expect(cfg).toEqual(DEFAULT_CONFIG);

    const shoes = await repo.getShoes();
    expect(shoes).toHaveLength(1);
    expect(shoes[0]?.model).toBe(DEFAULT_SHOE.model);
    expect(shoes[0]?.priorCountedKm).toBe(DEFAULT_SHOE.priorCountedKm);

    db.close();
  });

  it('never overwrites an existing config or shoe', async () => {
    const { db, repo } = freshRepo();
    await repo.saveAthleteConfig({ ...DEFAULT_CONFIG, age: 44, maxHr: 177 });
    await repo.saveShoe({ model: 'My own shoe', priorCountedKm: 250, notes: null });

    await seed(repo);

    const cfg = await repo.getAthleteConfig();
    expect(cfg?.age).toBe(44);
    expect(cfg?.maxHr).toBe(177);
    const shoes = await repo.getShoes();
    expect(shoes).toHaveLength(1);
    expect(shoes[0]?.model).toBe('My own shoe');
    expect(shoes[0]?.priorCountedKm).toBe(250);

    db.close();
  });
});
