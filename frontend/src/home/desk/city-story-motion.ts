type Point = { x: number; y: number };
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export type ChaseDepth = 'near' | 'far';
const CHASE_VIEWS = { near: { scale: 1, x: 0, y: 0 }, far: { scale: .58, x: .22, y: .02 } } as const;
export function chaseScale(depth: ChaseDepth) { return CHASE_VIEWS[depth].scale; }
export function projectChasePoint(point: Point, depth: ChaseDepth): Point {
  const view = CHASE_VIEWS[depth];
  return { x: view.x + point.x * view.scale, y: view.y + point.y * view.scale };
}
export const CITY_LEDGES = [
  { x0: -.35, x1: .34, y: .56 }, { x0: .40, x1: .66, y: .56 }, { x0: .72, x1: 1.3, y: .56 },
  { x0: -.35, x1: .29, y: .79 }, { x0: .35, x1: .64, y: .79 }, { x0: .70, x1: 1.3, y: .79 },
] as const;
export function chaseRoofs(depth: ChaseDepth) {
  return CITY_LEDGES.map(roof => ({ x0: projectChasePoint({ x: roof.x0, y: roof.y }, depth).x, x1: projectChasePoint({ x: roof.x1, y: roof.y }, depth).x, y: projectChasePoint({ x: 0, y: roof.y }, depth).y }));
}
export function trainFlight(route: number, progress: number) {
  const t = clamp01(progress);
  const fade = Math.min(1, t / .06, (1 - t) / .12);
  if (route % 3 === 2) return { view: 'rear' as const, x: lerp(.57,.64,t), y: lerp(.79,.17,t), scale: .025 + Math.pow(1 - t,1.5), foreshorten: 1, angle: 0, alpha: fade };
  if (route % 3 === 1) return { view: 'side' as const, x: lerp(-.35,1.35,t), y: .64 - Math.sin(t * Math.PI) * .24, scale: .78 + Math.sin(t * Math.PI) * .17, foreshorten: .9, angle: -.14 * Math.cos(t * Math.PI), alpha: fade };
  return { view: 'side' as const, x: lerp(-.35,1.35,t), y: .47 + Math.sin(t * Math.PI * 2) * .006, scale: .9, foreshorten: 1, angle: 0, alpha: fade };
}
export function trainAt(seconds: number) {
  const time = Math.max(0, seconds), progress = (time % 45 - .5) / 18;
  return progress < 0 || progress > 1 ? null : trainFlight(Math.floor(time / 45) % 3, progress);
}
