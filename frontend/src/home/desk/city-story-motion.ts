export type Actor = 'david' | 'smasher';
type Point = { x: number; y: number };
type ActorPosition = Point & { facing: 1 | -1; airborne: boolean };
type Knot = readonly [time: number, x: number, y: number, jumpToNext?: boolean];
type Route = readonly Knot[];
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const CHASE_INTERVAL = 50;
export const CHASE_DURATION = 12;
export const CHASE_START = 3;
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
const BURSTS = [{ start: .10, end: .15, gain: .12 }, { start: .47, end: .52, gain: .13 }] as const;
export function davidRouteProgress(progress: number) {
  const t = clamp01(progress);
  return clamp01(BURSTS.reduce((value, burst) => {
    const phase = clamp01((t - burst.start) / (burst.end - burst.start));
    return value + burst.gain * phase * phase * (3 - 2 * phase);
  }, t));
}
export function sandevistanIntensity(progress: number) {
  return Math.max(0, ...BURSTS.map(burst => progress > burst.start && progress < burst.end ? Math.sin((progress - burst.start) / (burst.end - burst.start) * Math.PI) : 0));
}

export const CHASE_PATTERNS: readonly { david: Route; smasher: Route; exchanges: readonly number[] }[] = [
  {
    david: [[0,-.12,.56],[.16,.33,.56,true],[.24,.41,.56],[.50,.65,.56,true],[.58,.73,.56],[1,1.15,.56]],
    smasher: [[0,-.28,.79],[.20,.28,.79,true],[.28,.36,.79],[.54,.63,.79,true],[.62,.71,.79],[1,1.04,.79]],
    exchanges: [.32,.62],
  },
  {
    david: [[0,1.18,.79],[.18,.71,.79,true],[.26,.63,.79],[.52,.36,.79,true],[.60,.28,.79],[1,-.12,.79]],
    smasher: [[0,1.04,.56],[.14,.73,.56,true],[.22,.65,.56],[.42,.41,.56,true],[.50,.33,.56],[1,-.25,.56]],
    exchanges: [.30,.62],
  },
  {
    david: [[0,-.12,.56],[.16,.33,.56,true],[.24,.41,.56],[.38,.62,.56],[.50,.42,.56,true],[.58,.36,.79],[.84,.63,.79,true],[.92,.71,.79],[1,1.15,.79]],
    smasher: [[0,1.12,.79],[.16,.71,.79,true],[.24,.64,.56],[.46,.41,.56,true],[.54,.33,.56],[1,-.25,.56]],
    exchanges: [.28,.70],
  },
];

export function actorPosition(pattern: number, actor: Actor, progress: number): ActorPosition {
  const route = CHASE_PATTERNS[pattern % CHASE_PATTERNS.length][actor];
  const t = actor === 'david' ? davidRouteProgress(progress) : clamp01(progress);
  const index = Math.max(1, route.findIndex(knot => knot[0] >= t));
  const a = route[index - 1], b = route[index];
  const local = clamp01((t - a[0]) / (b[0] - a[0]));
  const airborne = !!a[3] && local > 0 && local < 1;
  const jumpHeight = (actor === 'david' ? .09 : .06) + Math.max(0, a[2] - b[2]) * .35;
  const lift = a[3] ? 4 * local * (1 - local) * jumpHeight : 0;
  return { x: lerp(a[1], b[1], local), y: lerp(a[2], b[2], local) - lift, facing: b[1] >= a[1] ? 1 : -1, airborne };
}

type ShotCue = { at: number; from: Actor };
export function shotCues(pattern: number): ShotCue[] {
  return CHASE_PATTERNS[pattern % CHASE_PATTERNS.length].exchanges.flatMap(at => [
    { at, from: 'david' }, { at: at + .025, from: 'smasher' },
    { at: at + .05, from: 'david' }, { at: at + .075, from: 'smasher' },
  ] as ShotCue[]).filter(cue => {
    const position = actorPosition(pattern, cue.from, cue.at);
    return !position.airborne && position.x >= -.05 && position.x <= 1.05;
  });
}
export function shotAim(pattern: number, cue: ShotCue) {
  const from = actorPosition(pattern, cue.from, cue.at);
  const other: Actor = cue.from === 'david' ? 'smasher' : 'david';
  const to = actorPosition(pattern, other, cue.at + .02);
  const facing: 1 | -1 = to.x >= from.x ? 1 : -1;
  const origin = { x: from.x + facing * .018, y: from.y - (cue.from === 'david' ? .09 : .12) };
  const target = { x: to.x, y: to.y - (other === 'david' ? .07 : .09) };
  return { origin, target, facing };
}
export function activeShots(pattern: number, progress: number) {
  return shotCues(pattern).flatMap(cue => {
    const age = (progress - cue.at) * CHASE_DURATION;
    if (age < 0 || age > .35) return [];
    const aim = shotAim(pattern, cue), flight = age / .35;
    return [{ ...cue, ...aim, age, flight,
      point: { x: lerp(aim.origin.x, aim.target.x, flight), y: lerp(aim.origin.y, aim.target.y, flight) },
      tail: { x: lerp(aim.origin.x, aim.target.x, Math.max(0, flight - .1)), y: lerp(aim.origin.y, aim.target.y, Math.max(0, flight - .1)) },
    }];
  });
}
export function firingPose(pattern: number, actor: Actor, progress: number) {
  const cue = shotCues(pattern).filter(item => item.from === actor && progress >= item.at && (progress - item.at) * CHASE_DURATION < .26).at(-1);
  return cue ? { facing: shotAim(pattern, cue).facing, frame: Math.min(3, Math.floor((progress - cue.at) * CHASE_DURATION * 14)) } : null;
}
export function chaseAt(seconds: number) {
  const time = Math.max(0, seconds), progress = (time % CHASE_INTERVAL - CHASE_START) / CHASE_DURATION;
  if (progress < 0 || progress > 1) return null;
  const cycle = Math.floor(time / CHASE_INTERVAL);
  return { pattern: cycle % CHASE_PATTERNS.length, progress, depth: (cycle % 2 === 0 ? 'far' : 'near') as ChaseDepth };
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
