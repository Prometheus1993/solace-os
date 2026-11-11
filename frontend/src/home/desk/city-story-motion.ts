import { clamp01, cycleAt, fadeInOut, lerp, projectPoint, type Point } from './motion.ts';

export type CityDepth = 'near' | 'far';
const CITY_VIEWS = { near: { scale: 1, x: 0, y: 0 }, far: { scale: .58, x: .22, y: .02 } } as const;
export function cityScale(depth: CityDepth) { return CITY_VIEWS[depth].scale; }
export function projectCityPoint(point: Point, depth: CityDepth): Point { return projectPoint(point, CITY_VIEWS[depth]); }
export const CITY_LEDGES = [
  { x0: -.35, x1: .34, y: .56 }, { x0: .40, x1: .66, y: .56 }, { x0: .72, x1: 1.3, y: .56 },
  { x0: -.35, x1: .29, y: .79 }, { x0: .35, x1: .64, y: .79 }, { x0: .70, x1: 1.3, y: .79 },
] as const;
export function cityRoofs(depth: CityDepth) {
  return CITY_LEDGES.map(roof => ({ x0: projectCityPoint({ x: roof.x0, y: roof.y }, depth).x, x1: projectCityPoint({ x: roof.x1, y: roof.y }, depth).x, y: projectCityPoint({ x: 0, y: roof.y }, depth).y }));
}
export function trainFlight(route: number, progress: number) {
  const t = clamp01(progress);
  const fade = fadeInOut(t, .06, .12);
  if (route % 3 === 2) return { view: 'rear' as const, x: lerp(.57,.64,t), y: lerp(.79,.17,t), scale: .025 + Math.pow(1 - t,1.5), foreshorten: 1, angle: 0, alpha: fade };
  if (route % 3 === 1) return { view: 'side' as const, x: lerp(-.35,1.35,t), y: .64 - Math.sin(t * Math.PI) * .24, scale: .78 + Math.sin(t * Math.PI) * .17, foreshorten: .9, angle: -.14 * Math.cos(t * Math.PI), alpha: fade };
  return { view: 'side' as const, x: lerp(-.35,1.35,t), y: .47 + Math.sin(t * Math.PI * 2) * .006, scale: .9, foreshorten: 1, angle: 0, alpha: fade };
}
export function trainAt(seconds: number) {
  const flight = cycleAt(seconds, 45, .5, 18);
  return flight && trainFlight(flight.cycle % 3, flight.progress);
}
