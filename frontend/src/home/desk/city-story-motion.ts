import type { DayPhase } from '@solace/core';
import { clamp01, fadeInOut, lerp } from './motion.ts';

export function trainFlight(route: number, progress: number) {
  const t = clamp01(progress);
  const fade = fadeInOut(t, .06, .12);
  if (route % 3 === 2) return { view: 'rear' as const, x: lerp(.57,.64,t), y: lerp(.79,.17,t), scale: .025 + Math.pow(1 - t,1.5), foreshorten: 1, angle: 0, alpha: fade };
  if (route % 3 === 1) return { view: 'side' as const, x: lerp(-.35,1.35,t), y: .64 - Math.sin(t * Math.PI) * .24, scale: .78 + Math.sin(t * Math.PI) * .17, foreshorten: .9, angle: -.14 * Math.cos(t * Math.PI), alpha: fade };
  return { view: 'side' as const, x: lerp(-.35,1.35,t), y: .47 + Math.sin(t * Math.PI * 2) * .006, scale: .9, foreshorten: 1, angle: 0, alpha: fade };
}
/** One booked pass: which route the train flies and at which scene-clock second it departs. */
export type TrainSchedule = { route: number; departs: number };
export const TRAIN_FLIGHT_SECONDS = 18;
/** Quiet time between two passes: 3 to 6 minutes. */
export const trainGap = (random: () => number) => 180 + random() * 180;
/** The scene opens partway through a gap, so the first train is at most one gap away. */
export function startTrain(gap: number, random: () => number): TrainSchedule { return { route: 0, departs: random() * gap }; }
/** Once a pass is over, books the next one `gap()` seconds from now on the next route. */
export function nextTrain(schedule: TrainSchedule, seconds: number, gap: () => number): TrainSchedule {
  return seconds <= schedule.departs + TRAIN_FLIGHT_SECONDS ? schedule : { route: schedule.route + 1, departs: seconds + gap() };
}
export function trainAt(schedule: TrainSchedule, seconds: number) {
  const progress = (seconds - schedule.departs) / TRAIN_FLIGHT_SECONDS;
  return progress < 0 || progress > 1 ? null : trainFlight(schedule.route, progress);
}
/** How many hovercar lanes carry traffic: busy by day and dusk, sparse at night. */
export function carLaneCount(phase: DayPhase): number {
  return { dawn: 4, day: 6, dusk: 6, night: 2 }[phase];
}
