/**
 * Goal-oriented quests (docs/FORMULAS.md). Instead of "return to your old peak
 * lifts", quests now track progress toward the athlete's targets: leaner
 * (goal weight @ goal body-fat %), faster (a pace goal) and more volume (a weekly-km goal).
 * The targets are the athlete's editable goals (goals.ts), passed in. Quests are context/motivation only — never a stat
 * input. `detectLevelUps` (the stat_history writer) is unchanged.
 */
import type { Confidence, Run, StatHistoryEntry, StatHistoryInput, StatName, WeightPoint } from '../domain/index.ts';
import {
  PACE_LADDER_FLOOR,
  ladderStep,
  paceLadder,
  targetFatMassKg,
  weeklyKmLadder,
  type GoalValues,
} from './goals.ts';
import { anchoredWeightPoints, bestPaceMinPerKmOf, fatMassKg, weeklyKmOf } from './stats.ts';
import { clampPct, round1 } from '../domain/math.ts';

export interface QuestProgress {
  key: 'leanness' | 'pace' | 'volume';
  label: string;
  current: number | null;
  target: number;
  unit: string;
  /** 0–100 progress toward the target (direction-aware). */
  pct: number;
  done: boolean;
  detail: string;
}

const fmtPace = (minPerKm: number): string => `${Math.floor(minPerKm)}:${String(Math.round((minPerKm % 1) * 60)).padStart(2, '0')}`;

export function goalQuests(runs: ReadonlyArray<Run>, weightPoints: ReadonlyArray<WeightPoint>, goals: GoalValues): QuestProgress[] {
  const quests: QuestProgress[] = [];
  const targetFat = targetFatMassKg(goals);

  // 1. Leanness → goal weight @ goal body-fat % (on fat mass; fall back to weight when no bf%). Anchored the same way
  // as the LEANNESS stat (anchoredWeightPoints in stats.ts) so the quest's "how far have you come"
  // baseline never disagrees with the stat's.
  const sortedW = anchoredWeightPoints(weightPoints);
  const firstW = sortedW[0];
  const lastW = sortedW[sortedW.length - 1];
  if (lastW) {
    const curFat = fatMassKg(lastW);
    if (curFat != null) {
      const startFat = sortedW.map(fatMassKg).find((f): f is number => f != null) ?? curFat;
      const denom = Math.abs(startFat - targetFat) || 1;
      quests.push({
        key: 'leanness',
        label: `To ${goals.weightKg}kg @ ${goals.bodyFatPct}%`,
        current: curFat,
        target: round1(targetFat),
        unit: 'kg fat',
        pct: clampPct(((startFat - curFat) / denom) * 100),
        done: curFat <= targetFat,
        detail: `${curFat} kg fat → ${round1(targetFat)} kg`,
      });
    } else {
      const startW = firstW?.weightKg ?? lastW.weightKg;
      const denom = Math.abs(startW - goals.weightKg) || 1;
      quests.push({
        key: 'leanness',
        label: `To ${goals.weightKg}kg`,
        current: round1(lastW.weightKg),
        target: goals.weightKg,
        unit: 'kg',
        pct: clampPct(((startW - lastW.weightKg) / denom) * 100),
        done: lastW.weightKg <= goals.weightKg,
        detail: `${round1(lastW.weightKg)} kg → ${goals.weightKg} kg (log body-fat% for the ${goals.bodyFatPct}% goal)`,
      });
    }
  }

  // 2. Pace ladder (best single run in the window). Lower is better; target = next unreached rung,
  // bar measured from the previous rung (or PACE_LADDER_FLOOR). `done` only at the END goal.
  const pace = bestPaceMinPerKmOf(runs);
  if (pace != null) {
    const { next, prev } = ladderStep(paceLadder(goals.paceMinPerKm), pace, true);
    // Goal easier than the floor: keep the bar's start above the target so the fraction stays sane.
    const from = prev ?? Math.max(PACE_LADDER_FLOOR, next + 0.5);
    quests.push({
      key: 'pace',
      label: `Sub-${fmtPace(next)}/km`,
      current: pace,
      target: next,
      unit: 'min/km',
      pct: clampPct(((from - pace) / (from - next || 1)) * 100),
      done: pace <= goals.paceMinPerKm,
      detail: `best pace ${fmtPace(pace)}/km · end goal sub-${fmtPace(goals.paceMinPerKm)}/km`,
    });
  }

  // 3. Weekly volume ladder (28-day rolling avg). `done` only at the END goal.
  const wk = weeklyKmOf(runs);
  const { next: nextKm, prev: prevKm } = ladderStep(weeklyKmLadder(goals.weeklyKm), wk, false);
  const fromKm = prevKm ?? 0;
  quests.push({
    key: 'volume',
    label: `≥ ${nextKm} km/wk`,
    current: wk,
    target: nextKm,
    unit: 'km/wk',
    pct: clampPct(((wk - fromKm) / (nextKm - fromKm || 1)) * 100),
    done: wk >= goals.weeklyKm,
    detail: `now ${wk} km/wk (28-day avg) · end goal ${goals.weeklyKm} km/wk`,
  });

  return quests;
}

export interface NewStat {
  stat: StatName;
  value: number;
  level: number;
  confidence: Confidence;
  inputs: unknown;
}

/**
 * Compare freshly computed stats to the last recorded value per track and emit a
 * stat_history row only when something changed (append-only; level-up moments).
 */
export function detectLevelUps(prev: ReadonlyArray<StatHistoryEntry>, next: ReadonlyArray<NewStat>, date: string): StatHistoryInput[] {
  const lastByStat = new Map<StatName, StatHistoryEntry>();
  for (const e of prev) {
    const cur = lastByStat.get(e.stat);
    if (!cur || e.date > cur.date || (e.date === cur.date && e.id > cur.id)) lastByStat.set(e.stat, e);
  }

  const rows: StatHistoryInput[] = [];
  for (const n of next) {
    const last = lastByStat.get(n.stat);
    if (last && last.value === n.value && last.level === n.level) continue; // unchanged
    const trigger = !last
      ? 'first'
      : n.level > last.level
        ? 'level_up'
        : n.level < last.level
          ? 'level_down'
          : 'changed';
    rows.push({
      stat: n.stat,
      date,
      value: n.value,
      level: n.level,
      confidence: n.confidence,
      trigger,
      inputsJson: JSON.stringify(n.inputs),
    });
  }
  return rows;
}
