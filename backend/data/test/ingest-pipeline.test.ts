import { DEFAULT_SHOE } from '@solace/core';
import { describe, expect, it } from 'vitest';
import { ingestRunFromFit, migrate, openDatabase, SqliteRepository } from '../src/index.ts';
import { makeSyntheticFit } from './fixtures/make-fit.ts';

describe('ingestRunFromFit', () => {
  it('persists run + samples, assigns the shoe, and dedupes re-imports', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    await repo.saveShoe({ model: DEFAULT_SHOE.model, priorCountedKm: DEFAULT_SHOE.priorCountedKm, notes: null });

    const bytes = makeSyntheticFit({ n: 120, avgHr: 164, speedMps: 2.7, lat: 50.85, lon: 4.35 });

    const first = await ingestRunFromFit(repo, bytes);
    expect(first.imported).toBe(true);
    expect(first.run.shoeId).not.toBeNull();
    expect(first.run.avgHrBpm).toBe(164);
    expect(await repo.getRuns()).toHaveLength(1);

    // Re-importing the SAME bytes must not create a second run (dedupe by hash).
    const second = await ingestRunFromFit(repo, bytes);
    expect(second.imported).toBe(false);
    expect(second.reason).toMatch(/duplicate/);
    expect(await repo.getRuns()).toHaveLength(1);

    db.close();
  });
});
