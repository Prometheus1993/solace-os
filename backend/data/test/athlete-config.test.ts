import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@solace/core';
import { migrate, openDatabase, SqliteRepository } from '../src/index.ts';

function setup() {
  const db = openDatabase(':memory:');
  migrate(db);
  return { db, repo: new SqliteRepository(db) };
}

describe('saveAthleteConfig', () => {
  it('inserts the first config on an empty DB', async () => {
    const { repo } = setup();
    expect(await repo.getAthleteConfig()).toBeNull();
    await repo.saveAthleteConfig({ ...DEFAULT_CONFIG, age: 31 });
    expect((await repo.getAthleteConfig())?.age).toBe(31);
  });

  it('updates the live fields on a second save', async () => {
    const { repo } = setup();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);

    await repo.saveAthleteConfig({ ...DEFAULT_CONFIG, age: 40, maxHr: 190, heightCm: 181, heightConfirmed: true });

    const cfg = await repo.getAthleteConfig();
    expect(cfg?.age).toBe(40);
    expect(cfg?.maxHr).toBe(190);
    expect(cfg?.heightCm).toBe(181);
    expect(cfg?.heightConfirmed).toBe(true);
  });
});
