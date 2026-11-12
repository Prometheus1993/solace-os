/** The desk cat: pure state machine, prop-anchored spots and sprite placement. Normalised scene coordinates (0..1). */
import { arcPoint, clamp01, lerp, lerpPoint, type Point } from './motion.ts';
import { DESK_CANVAS } from './desk-canvas.ts';
import { DEFAULT_ADJUSTMENT, type DeskLayout, type DeskObjectId, type PropAdjustment } from './desk-layout-state.ts';

export type CatPose = 'standing' | 'seated' | 'sleeping';
export type Facing = 1 | -1;
type Sequence = { fps: number; order: readonly number[]; loop: boolean; from: CatPose; to: CatPose };
const FRAMES = [0, 1, 2, 3, 4, 5, 6, 7];
/** Idle loops play forward then backward so the last frame never snaps back to the first. */
const PING_PONG = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
const sequence = (fps: number, from: CatPose, to: CatPose = from, loop = false, order: readonly number[] = FRAMES): Sequence => ({ fps, order, loop, from, to });
/** One 4x2 sheet (`desk-cat-<id>-atlas-v1.png`, 8 frames) per sequence; `from`/`to` are the poses it connects. */
export const CAT_SEQUENCES = {
  walk: sequence(10, 'standing', 'standing', true),
  'jump-up': sequence(10, 'standing'),
  'jump-down': sequence(10, 'standing'),
  'stand-idle': sequence(4, 'standing', 'standing', true, PING_PONG),
  stretch: sequence(7, 'standing'),
  'sit-down': sequence(7, 'standing', 'seated'),
  sit: sequence(4, 'seated', 'seated', true, PING_PONG),
  groom: sequence(7, 'seated', 'seated', true),
  'stand-up': sequence(7, 'seated', 'standing'),
  'lie-down': sequence(7, 'seated', 'sleeping'),
  sleep: sequence(4, 'sleeping', 'sleeping', true, PING_PONG),
  'wake-up': sequence(7, 'sleeping', 'seated'),
  'react-standing': sequence(7, 'standing'),
  'react-seated': sequence(7, 'seated'),
  'react-sleeping': sequence(4, 'sleeping', 'sleeping', false, PING_PONG),
};
export type CatSequenceId = keyof typeof CAT_SEQUENCES;
export const CAT_SEQUENCE_IDS = Object.keys(CAT_SEQUENCES) as CatSequenceId[];
/** A sequence may only follow one that ends in the pose it starts from. */
export const canChain = (previous: CatSequenceId, next: CatSequenceId) => CAT_SEQUENCES[previous].to === CAT_SEQUENCES[next].from;
const playTime = (id: CatSequenceId) => CAT_SEQUENCES[id].order.length / CAT_SEQUENCES[id].fps;

export type CatSpotId = 'cushion' | 'windowsill' | 'monitor';
/** A place the cat rests, plus the stretch (`x0..x1`, at the same height) it can walk along there. */
export type CatSpot = { id: CatSpotId; point: Point; x0: number; x1: number };
export type CatSpots = { home: CatSpot; spots: CatSpot[] };
type Box = { left: number; top: number; width: number; height: number };
const FLOOR = [.05, .95] as const;
/**
 * Each spot hangs on a prop: `box` mirrors that prop's default box in `desktop-sprites.css`, `u`/`v` is the
 * resting point inside it and `span` the walkable part of its width (none = the floor).
 * The lower window edge sits behind the desk, so the windowsill spot is where the desk's back rail meets the glass.
 */
const ANCHORS: { id: CatSpotId; prop: DeskObjectId; box: Box; u: number; v: number; span?: readonly [number, number] }[] = [
  { id: 'cushion', prop: 'companion', box: { left: .863, top: .8906, width: .094, height: .0544 }, u: .5, v: .45 },
  { id: 'windowsill', prop: 'window', box: { left: .01, top: .08, width: .98, height: .64 }, u: .2, v: .79, span: [.05, .38] },
  { id: 'monitor', prop: 'monitor', box: { left: .41, top: .43576, width: .34, height: .25024 }, u: .3, v: 0, span: [.1, .9] },
];
/** The layout editor moves a prop by `x`/`y` percent of the scene and scales it around its bottom centre. */
export function adjustedBox(box: Box, { x, y, scale }: PropAdjustment): Box {
  const width = box.width * scale, height = box.height * scale;
  return { left: box.left + box.width / 2 + x / 100 - width / 2, top: box.top + box.height + y / 100 - height, width, height };
}
/** Spots follow their props; a hidden prop has no spot. `home` (the cushion's place) always exists. */
export function catSpots(layout: DeskLayout): CatSpots {
  const all = ANCHORS.map(anchor => {
    const box = adjustedBox(anchor.box, layout[anchor.prop] ?? DEFAULT_ADJUSTMENT);
    const [x0, x1] = anchor.span ? anchor.span.map(u => lerp(box.left, box.left + box.width, u)) : FLOOR;
    return { id: anchor.id, point: { x: lerp(box.left, box.left + box.width, anchor.u), y: lerp(box.top, box.top + box.height, anchor.v) }, x0, x1 };
  });
  return { home: all[0], spots: all.filter((_, index) => !layout[ANCHORS[index].prop]?.hidden) };
}

/** One sequence played for `duration` seconds while the cat stays put, walks or (with `air`) jumps from `from` to `to`. */
export type CatStep = { sequence: CatSequenceId; duration: number; from: Point; to: Point; facing: Facing; air?: number };
export type Random = () => number;
const WALK_SPEED = .1, JUMP_RUN = .08, JUMP_SPEED = 1, JUMP_LIFT = .05;
/** Jump sheet: frames 0-3 crouch and push off, 4-5 are airborne, 6-7 land. Only the airborne part moves the cat. */
const JUMP_CROUCH = 4 / CAT_SEQUENCES['jump-up'].fps, JUMP_LAND = 2 / CAT_SEQUENCES['jump-up'].fps;
const between = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
/** Whole plays only, so the next sequence starts from the pose this one ends in. */
const play = (id: CatSequenceId, at: Point, facing: Facing, times = 1): CatStep => ({ sequence: id, duration: playTime(id) * times, from: at, to: at, facing });

/** Sit, sometimes groom, sleep, wake up and get back on its feet. Starts seated, ends standing. */
export function restSteps(at: Point, facing: Facing, random: Random): CatStep[] {
  const steps = [play('sit', at, facing, between(random, 1, 3))];
  if (random() < .5) steps.push(play('groom', at, facing, between(random, 2, 4)), play('sit', at, facing, between(random, 1, 2)));
  steps.push(play('lie-down', at, facing), play('sleep', at, facing, between(random, 4, 10)), play('wake-up', at, facing), play('sit', at, facing), play('stand-up', at, facing));
  if (random() < .4) steps.push(play('stretch', at, facing));
  return steps;
}
/**
 * Walk along the current spot's stretch towards the target, jump across when the heights differ, walk on to the
 * target and sit down. Starts standing, ends seated on `to`. Walking left faces left.
 */
export function travelSteps(from: CatSpot, to: CatSpot, facing: Facing, random: Random): CatStep[] {
  const steps: CatStep[] = [];
  let at = from.point;
  const walkTo = (x: number) => {
    if (Math.abs(x - at.x) < 1e-9) return;
    facing = x < at.x ? -1 : 1;
    const end = { x, y: at.y }, cycle = playTime('walk');
    steps.push({ sequence: 'walk', duration: Math.max(1, Math.round(Math.abs(x - at.x) / WALK_SPEED / cycle)) * cycle, from: at, to: end, facing });
    at = end;
  };
  if (random() < .5) steps.push(play('stand-idle', at, facing));
  if (to.point.y !== at.y) {
    const side = to.point.x < at.x ? -1 : 1;
    walkTo(Math.max(from.x0, Math.min(from.x1, to.point.x - side * JUMP_RUN)));
    const landing = { x: Math.max(to.x0, Math.min(to.x1, at.x + side * JUMP_RUN)), y: to.point.y };
    if (landing.x !== at.x) facing = landing.x < at.x ? -1 : 1;
    const distance = Math.hypot((landing.x - at.x) * DESK_CANVAS.width / DESK_CANVAS.height, landing.y - at.y);
    const air = Math.max(.3, Math.min(.7, distance / JUMP_SPEED));
    steps.push({ sequence: landing.y < at.y ? 'jump-up' : 'jump-down', duration: JUMP_CROUCH + air + JUMP_LAND, from: at, to: landing, facing, air });
    at = landing;
  }
  walkTo(to.point.x);
  steps.push(play('sit-down', to.point, facing));
  return steps;
}

/** `steps[0]` is playing, `elapsed` seconds in. A reaction plays on top and pauses it; `petted` = one is waiting for the step to end. */
export type CatState = { spot: CatSpotId; steps: CatStep[]; elapsed: number; reaction: { sequence: CatSequenceId; elapsed: number } | null; petted: boolean };
/** Seated on `previous` when that spot still exists and there is somewhere else to go; otherwise at home. */
export function startCat(spots: CatSpots, random: Random, previous?: CatSpotId): CatState {
  const spot = (spots.spots.length >= 2 && spots.spots.find(item => item.id === previous)) || spots.home;
  return { spot: spot.id, steps: restSteps(spot.point, -1, random), elapsed: 0, reaction: null, petted: false };
}
/** With fewer than two spots there is nowhere to walk to: the cat goes (or stays) home. */
function nextVisit(current: CatSpotId, spots: CatSpots, facing: Facing, random: Random) {
  const from = spots.spots.find(item => item.id === current) ?? spots.home;
  const others = spots.spots.filter(item => item.id !== current);
  const to = spots.spots.length < 2 ? spots.home : others[Math.floor(random() * others.length)];
  const travel = travelSteps(from, to, facing, random);
  return { spot: to.id, steps: [...travel, ...restSteps(to.point, travel[travel.length - 1].facing, random)] };
}
const REACTIONS = { standing: 'react-standing', seated: 'react-seated', sleeping: 'react-sleeping' } as const;
export function advanceCat(state: CatState, seconds: number, spots: CatSpots, random: Random): CatState {
  if (state.reaction) {
    const elapsed = state.reaction.elapsed + seconds;
    return { ...state, reaction: elapsed < playTime(state.reaction.sequence) ? { ...state.reaction, elapsed } : null };
  }
  let { spot, steps } = state, elapsed = state.elapsed + seconds;
  while (elapsed >= steps[0].duration) {
    const done = steps[0];
    elapsed -= done.duration; steps = steps.slice(1);
    if (!steps.length) ({ spot, steps } = nextVisit(spot, spots, done.facing, random));
    if (state.petted) return { spot, steps, elapsed: 0, reaction: { sequence: REACTIONS[CAT_SEQUENCES[done.sequence].to], elapsed: 0 }, petted: false };
  }
  return { ...state, spot, steps, elapsed };
}
/**
 * A click. In a looping sequence the cat reacts at once in its current pose (asleep it reacts without waking);
 * in a one-off move it reacts as soon as that move ends, in the pose the move ends in.
 */
export function petCat(state: CatState): CatState {
  if (state.reaction) return state;
  const current = CAT_SEQUENCES[state.steps[0].sequence];
  return current.loop ? { ...state, reaction: { sequence: REACTIONS[current.from], elapsed: 0 } } : { ...state, petted: true };
}

function frameAt(id: CatSequenceId, elapsed: number) {
  const { fps, order, loop } = CAT_SEQUENCES[id], index = Math.floor(elapsed * fps);
  return order[loop ? index % order.length : Math.min(index, order.length - 1)];
}
function stepFrame(step: CatStep, elapsed: number) {
  if (step.air === undefined) return frameAt(step.sequence, elapsed);
  const fps = CAT_SEQUENCES[step.sequence].fps, landing = elapsed - JUMP_CROUCH - step.air;
  if (elapsed < JUMP_CROUCH) return Math.floor(elapsed * fps);
  return landing < 0 ? (landing < -step.air / 2 ? 4 : 5) : Math.min(7, 6 + Math.floor(landing * fps));
}
function stepPoint(step: CatStep, elapsed: number): Point {
  if (step.air === undefined) return lerpPoint(step.from, step.to, clamp01(elapsed / step.duration));
  return arcPoint(step.from, step.to, clamp01((elapsed - JUMP_CROUCH) / step.air), JUMP_LIFT);
}
/** What to draw now: sheet, frame, where the paws are, and which way the cat looks (sheets face right). */
export function catView(state: CatState): { sequence: CatSequenceId; frame: number; point: Point; facing: Facing } {
  const step = state.steps[0], point = stepPoint(step, state.elapsed);
  if (state.reaction) return { sequence: state.reaction.sequence, frame: frameAt(state.reaction.sequence, state.reaction.elapsed), point, facing: step.facing };
  return { sequence: step.sequence, frame: stepFrame(step, state.elapsed), point, facing: step.facing };
}

/** Every sheet cell is 512 px with the paws at (256, 464). One cell is `CAT_CELL` scene widths wide. */
const CAT_CELL = .115, CELL_PIXELS = 512, PAWS = { x: 256, y: 464 };
/**
 * Where a sequence's crop (in cell pixels) goes relative to the paws, in scene widths.
 * Facing left mirrors the crop around the paws, so a flipped cat stays on its spot.
 */
export function catBox(crop: { x: number; y: number; width: number; height: number }, facing: Facing, scale: number) {
  const unit = CAT_CELL * scale / CELL_PIXELS;
  const left = facing === 1 ? crop.x - PAWS.x : PAWS.x - crop.x - crop.width;
  return { dx: left * unit, dy: (crop.y - PAWS.y) * unit, width: crop.width * unit, height: crop.height * unit };
}
