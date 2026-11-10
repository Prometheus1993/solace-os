import {
  computeLeanness,
  computeStamina,
  computeStrength,
  detectLevelUps,
  resolveGoals,
  type Clock,
  type NewStat,
  type Repository,
  type StatResult,
} from '@solace/core';
import { scoredStrengthSets } from './queries.ts';

export interface RecomputeResult {
  stamina: StatResult;
  strength: StatResult;
  leanness: StatResult;
  written: number;
}

/** Recompute the three stat tracks and append changed/level-up rows. Shared by the CLI and the server. */
export async function recomputeStats(repo: Repository, clock: Clock): Promise<RecomputeResult> {
  const asOf = clock.today();
  const [config, runs, weights, scored, prev] = await Promise.all([
    repo.getAthleteConfig(),
    repo.getRuns(),
    repo.getWeightPoints(),
    scoredStrengthSets(repo),
    repo.getStatHistory(),
  ]);

  const stamina = computeStamina(runs);
  const strength = computeStrength(scored, asOf, weights);
  const leanness = computeLeanness(weights, resolveGoals(config?.goals));

  const next: NewStat[] = [
    { stat: 'STAMINA', value: stamina.value, level: stamina.level, confidence: stamina.confidence, inputs: { note: stamina.note } },
    { stat: 'STRENGTH', value: strength.value, level: strength.level, confidence: strength.confidence, inputs: { note: strength.note } },
    { stat: 'LEANNESS', value: leanness.value, level: leanness.level, confidence: leanness.confidence, inputs: { note: leanness.note } },
  ];

  const rows = detectLevelUps(prev, next, asOf);
  for (const r of rows) await repo.appendStatHistory(r);

  return { stamina, strength, leanness, written: rows.length };
}
