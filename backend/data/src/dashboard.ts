import { buildDashboard, type Clock, type DashboardDTO, type Repository } from '@solace/core';
import { scoredStrengthSets } from './queries.ts';

/**
 * The single read-only query the UI calls: assemble the whole dashboard
 * DTO from the repository. This is the UI contract — the React app in frontend/
 * imports DashboardDTO and renders it, with no other coupling. Returns
 * null when the DB hasn't been seeded.
 */
export async function assembleDashboard(repo: Repository, clock: Clock): Promise<DashboardDTO | null> {
  const config = await repo.getAthleteConfig();
  if (!config) return null;

  const asOf = clock.today();
  const [runs, recoveryDays, weightPoints, scored, shoes, statHistory, series, volumes, copies, purchases, purchaseItems, exams, schoolTasks] = await Promise.all([
    repo.getRuns(),
    repo.getRecoveryDays(),
    repo.getWeightPoints(),
    scoredStrengthSets(repo),
    repo.getShoes(),
    repo.getStatHistory(),
    repo.listSeries(),
    repo.listVolumes(),
    repo.listCopies(),
    repo.listPurchases(),
    repo.listPurchaseItems(),
    repo.listExams(),
    repo.listSchoolTasks(),
  ]);
  const shoe = shoes[0] ? { id: shoes[0].id, model: shoes[0].model, priorCountedKm: shoes[0].priorCountedKm } : null;

  return buildDashboard({
    asOf,
    config,
    runs,
    recoveryDays,
    weightPoints,
    scoredStrengthSets: scored,
    shoe,
    statHistory,
    series,
    volumes,
    copies,
    purchases,
    purchaseItems,
    exams,
    schoolTasks,
  });
}
