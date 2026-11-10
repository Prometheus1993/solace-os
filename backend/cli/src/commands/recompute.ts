import type { Clock, Repository } from '@solace/core';
import { recomputeStats } from '@solace/data';

/** Recompute the three stat tracks (shared service) and report what changed. */
export async function recompute(repo: Repository, clock: Clock): Promise<void> {
  const { stamina, strength, leanness, written } = await recomputeStats(repo, clock);
  console.log(`Recompute @ ${clock.today()}:`);
  console.log(`  STAMINA  ${stamina.value} (lvl ${stamina.level}, ${stamina.confidence})`);
  console.log(`  STRENGTH ${strength.value} (lvl ${strength.level}, ${strength.confidence})`);
  console.log(`  LEANNESS ${leanness.value} (lvl ${leanness.level}, ${leanness.confidence})`);
  console.log(written ? `  wrote ${written} stat_history row(s)` : '  no changes since last recompute');
}
