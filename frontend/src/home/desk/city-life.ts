import type { DayPhase } from '@solace/core';
import { cycleAt } from './motion.ts';

/** Small people in the city. `row` is the figure's row in the city-life atlas; `x`/`y` is where its feet or seat rest. */
export type CityFigure = { id: string; row: number; x: number; y: number; size: number; rest: number };
export const FIGURE_FRAMES = 6;
const FIGURE_FPS = 3;
// `y` is a roof line from CITY_LEDGES; `size` is the height as a share of the scene width; `rest` = seconds held on the first frame between loops.
export const CITY_FIGURES: readonly CityFigure[] = [
  { id: 'porch-drink', row: 0, x: .74, y: .79, size: .05, rest: 4 },
  { id: 'rooftop-smoker', row: 1, x: .5, y: .56, size: .06, rest: 3 },
  { id: 'balcony-lean', row: 2, x: .47, y: .79, size: .05, rest: 5 },
  { id: 'ledge-leg-swing', row: 3, x: .31, y: .56, size: .05, rest: 0 },
];
const FIGURE_SCHEDULE: Record<DayPhase, readonly string[]> = {
  dawn: ['porch-drink'],
  day: ['porch-drink', 'balcony-lean'],
  dusk: ['balcony-lean', 'rooftop-smoker', 'ledge-leg-swing'],
  night: ['rooftop-smoker', 'ledge-leg-swing'],
};
/** Who is outside at this time of day: never everyone at once. */
export function figuresAt(phase: DayPhase): CityFigure[] {
  return CITY_FIGURES.filter(figure => FIGURE_SCHEDULE[phase].includes(figure.id));
}
/** Atlas column for a figure: it plays its loop once, rests on the first frame, and repeats. Rows are offset so they do not move in step. */
export function figureFrame(figure: CityFigure, seconds: number): number {
  const loop = FIGURE_FRAMES / FIGURE_FPS;
  const play = cycleAt(seconds + figure.row * 1.7, loop + figure.rest, 0, loop);
  return play ? Math.min(FIGURE_FRAMES - 1, Math.floor(play.progress * FIGURE_FRAMES)) : 0;
}
/** How many hovercar lanes carry traffic: busy by day and dusk, sparse at night. */
export function carLaneCount(phase: DayPhase): number {
  return { dawn: 4, day: 6, dusk: 6, night: 2 }[phase];
}
