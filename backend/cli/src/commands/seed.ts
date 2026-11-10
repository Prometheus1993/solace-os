import { DEFAULT_CONFIG, DEFAULT_SHOE, type Repository } from '@solace/core';

/**
 * Seed neutral example values on a fresh install: an athlete_config and one example
 * shoe. Each is written only when none exists, so seed NEVER overwrites a config or
 * adds a second shoe. Idempotent.
 */
export async function seed(repo: Repository): Promise<void> {
  if (await repo.getAthleteConfig()) {
    console.log('athlete_config exists, left unchanged.');
  } else {
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    console.log(`Seeded example athlete_config (maxHr=${DEFAULT_CONFIG.maxHr}); edit it to your own values.`);
  }

  if ((await repo.getShoes()).length > 0) {
    console.log('A shoe exists, left unchanged.');
  } else {
    const shoe = await repo.saveShoe({
      model: DEFAULT_SHOE.model,
      priorCountedKm: DEFAULT_SHOE.priorCountedKm,
      notes: DEFAULT_SHOE.notes,
    });
    console.log(`Seeded example shoe #${shoe.id}: ${shoe.model} @ ${shoe.priorCountedKm} km.`);
  }
}
