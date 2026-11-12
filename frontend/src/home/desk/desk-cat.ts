/** The desk cat: pure state machine, prop-anchored spots and sprite placement. Normalised scene coordinates (0..1). */
import { arcPoint, clamp01, lerp, lerpPoint, type Point } from './motion.ts';
import { DESK_CANVAS } from './desk-canvas.ts';
import { DEFAULT_ADJUSTMENT, type DeskLayout, type DeskObjectId, type PropAdjustment } from './desk-layout-state.ts';

/** `walking`, `crouch` and `landing` are in-between poses: only the transition sheets enter and leave them. */
export type CatPose = 'standing' | 'walking' | 'crouch' | 'landing' | 'seated' | 'loaf' | 'sleeping';
export type Facing = 1 | -1;
/** `turns`: the sheet rotates the cat to face the other way. `sheet`: replays another sequence's sheet. */
type Sequence = { fps: number; order: readonly number[]; loop: boolean; from: CatPose; to: CatPose; turns?: true; sheet?: string };
const FRAMES = [0, 1, 2, 3, 4, 5, 6, 7];
const FRAMES_12 = [...FRAMES, 8, 9, 10, 11];
/** Idle loops play forward then backward so the last frame never snaps back to the first. */
const PING_PONG = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
/** The jump sheets also hold a crouch (0-3) and a landing (6-7); their own longer sheets play those parts now. */
const AIRBORNE = [4, 5];
const sequence = (fps: number, from: CatPose, to: CatPose = from, loop = false, order: readonly number[] = FRAMES, extra: Pick<Sequence, 'turns' | 'sheet'> = {}): Sequence => ({ fps, order, loop, from, to, ...extra });
/** One sheet (`desk-cat-<id>-atlas-v1.png`, 4 columns, 8 or 12 frames) per sequence; `from`/`to` are the poses it connects. */
export const CAT_SEQUENCES = {
  'walk-start': sequence(10, 'standing', 'walking'),
  walk: sequence(10, 'walking', 'walking', true),
  'walk-stop': sequence(10, 'walking', 'standing'),
  'look-up': sequence(8, 'standing'),
  'jump-prepare': sequence(8, 'standing', 'crouch'),
  'jump-up': sequence(10, 'crouch', 'landing', false, AIRBORNE),
  'look-down': sequence(8, 'standing'),
  'edge-peek': sequence(8, 'standing'),
  'jump-down': sequence(10, 'standing', 'landing', false, AIRBORNE),
  'landing-recover': sequence(10, 'landing', 'standing'),
  'landing-to-walk': sequence(10, 'landing', 'walking'),
  reposition: sequence(8, 'standing'),
  // Both turn sheets rotate from facing right to facing left; facing left, the whole sheet is mirrored.
  'head-led-turn': sequence(8, 'standing', 'standing', false, FRAMES, { turns: true }),
  'turn-around': sequence(8, 'standing', 'standing', false, FRAMES_12, { turns: true }),
  'stand-idle': sequence(4, 'standing', 'standing', true, PING_PONG),
  sniff: sequence(8, 'standing', 'standing', true),
  balance: sequence(4, 'standing', 'standing', true, PING_PONG),
  stretch: sequence(7, 'standing'),
  'sit-down': sequence(7, 'standing', 'seated'),
  sit: sequence(4, 'seated', 'seated', true, PING_PONG),
  groom: sequence(7, 'seated', 'seated', true),
  yawn: sequence(8, 'seated'),
  'watch-city': sequence(4, 'seated', 'seated', true, PING_PONG),
  knead: sequence(4, 'seated', 'seated', true, PING_PONG),
  'stand-up': sequence(7, 'seated', 'standing'),
  'sit-to-loaf': sequence(8, 'seated', 'loaf'),
  loaf: sequence(4, 'loaf', 'loaf', true, PING_PONG),
  'loaf-to-sit': sequence(8, 'loaf', 'seated', false, [...FRAMES].reverse(), { sheet: 'sit-to-loaf' }),
  'lie-down': sequence(7, 'seated', 'sleeping'),
  'circle-before-sleep': sequence(8, 'standing', 'sleeping', false, FRAMES_12),
  sleep: sequence(4, 'sleeping', 'sleeping', true, PING_PONG),
  'wake-up': sequence(7, 'sleeping', 'seated'),
  'react-standing': sequence(7, 'standing'),
  'react-seated': sequence(7, 'seated'),
  'react-sleeping': sequence(4, 'sleeping', 'sleeping', false, PING_PONG),
};
export type CatSequenceId = keyof typeof CAT_SEQUENCES;
export const CAT_SEQUENCE_IDS = Object.keys(CAT_SEQUENCES) as CatSequenceId[];
/** The sheet a sequence is drawn from: its own, unless it replays another one's. */
export const catSheet = (id: CatSequenceId): string => CAT_SEQUENCES[id].sheet ?? id;
/** Every sheet file once, with its row count (4 frames per row). */
export const CAT_SHEETS = CAT_SEQUENCE_IDS.filter(id => catSheet(id) === id).map(id => ({ id, rows: Math.ceil((Math.max(...CAT_SEQUENCES[id].order) + 1) / 4) }));
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

/**
 * One sequence played for `duration` seconds while the cat stays put, walks or (with `jump`) flies from `from` to `to`.
 * `ease`: the cat speeds up from standstill (`in`) or slows down to one (`out`). A turn step keeps the facing it starts in.
 */
export type CatStep = { sequence: CatSequenceId; duration: number; from: Point; to: Point; facing: Facing; jump?: true; ease?: 'in' | 'out' };
export type Random = () => number;
const WALK_SPEED = .1, JUMP_RUN = .08, JUMP_SPEED = 1, JUMP_LIFT = .05;
/** Ground covered while speeding up to, or slowing down from, walking speed. */
const STRIDE = WALK_SPEED * playTime('walk-start') / 2;
const between = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
/** Whole plays only, so the next sequence starts from the pose this one ends in. */
const play = (id: CatSequenceId, at: Point, facing: Facing, times = 1): CatStep => ({ sequence: id, duration: playTime(id) * times, from: at, to: at, facing });
/** Which way the cat looks once a step is over. */
export const facingAfter = (step: CatStep): Facing => CAT_SEQUENCES[step.sequence].turns ? (-step.facing as Facing) : step.facing;

/**
 * Sit and follow some habits (groom, knead on the cushion only, watch the city mostly from the windowsill, yawn),
 * then nap one of three ways: lie down, tuck into a loaf, or get up and circle before sleeping.
 * Starts seated, ends standing.
 */
export function restSteps(spots: CatSpots, spot: CatSpot, facing: Facing, random: Random): CatStep[] {
  const steps: CatStep[] = [];
  const add = (id: CatSequenceId, times = 1) => steps.push(play(id, spot.point, facing, times));
  add('sit', between(random, 1, 3));
  if (random() < .5) { add('groom', between(random, 2, 4)); add('sit', between(random, 1, 2)); }
  // Home is the cushion's place even when the cushion itself is hidden: no cushion, no kneading.
  if (spot.id === 'cushion' && spots.spots.some(item => item.id === 'cushion') && random() < .5) { add('knead', between(random, 2, 3)); add('sit'); }
  if (random() < (spot.id === 'windowsill' ? .8 : .15)) { add('watch-city', between(random, 2, 4)); add('sit'); }
  if (random() < .4) add('yawn');
  const nap = random();
  if (nap < .4) { add('lie-down'); add('sleep', between(random, 4, 10)); add('wake-up'); }
  else if (nap < .7) { add('sit-to-loaf'); add('loaf', between(random, 3, 8)); add('loaf-to-sit'); }
  else { add('stand-up'); add('circle-before-sleep'); add('sleep', between(random, 4, 10)); add('wake-up'); }
  add('sit'); add('stand-up');
  if (random() < .4) add('stretch');
  return steps;
}
/**
 * Walk along the current spot's stretch towards the target, jump across when the heights differ, walk on to the
 * target and sit down. Starts standing, ends seated on `to`. Every walk speeds up and slows down, every change of
 * direction is a whole turn, and a jump is looked at first.
 */
export function travelSteps(from: CatSpot, to: CatSpot, facing: Facing, random: Random): CatStep[] {
  const steps: CatStep[] = [];
  let at = from.point;
  const face = (direction: Facing) => {
    if (direction === facing) return;
    steps.push(play('reposition', at, facing), play(random() < .5 ? 'head-led-turn' : 'turn-around', at, facing));
    facing = direction;
  };
  const move = (id: CatSequenceId, x: number, duration: number, ease?: 'in' | 'out') => {
    const end = { x, y: at.y };
    steps.push({ sequence: id, duration, from: at, to: end, facing, ease });
    at = end;
  };
  /** `landed`: the cat comes out of a jump, so it walks on from the landing, or recovers when it has to stop or turn. */
  const walkTo = (x: number, landed = false) => {
    const distance = Math.abs(x - at.x), direction: Facing = x < at.x ? -1 : 1;
    if (landed && (distance < 1e-9 || direction !== facing)) { steps.push(play('landing-recover', at, facing)); landed = false; }
    if (distance < 1e-9) return;
    face(direction);
    // Too short for a whole stride at walking speed: the start and the stop share the distance.
    const cycle = playTime('walk'), cycles = Math.round((distance - 2 * STRIDE) / WALK_SPEED / cycle), edge = cycles > 0 ? STRIDE : distance / 2;
    move(landed ? 'landing-to-walk' : 'walk-start', at.x + direction * edge, playTime('walk-start'), 'in');
    if (cycles > 0) move('walk', x - direction * edge, cycles * cycle);
    move('walk-stop', x, playTime('walk-stop'), 'out');
  };
  if (random() < .5) steps.push(play('stand-idle', at, facing));
  if (to.point.y !== at.y) {
    const side = to.point.x < at.x ? -1 : 1;
    walkTo(Math.max(from.x0, Math.min(from.x1, to.point.x - side * JUMP_RUN)));
    const landing = { x: Math.max(to.x0, Math.min(to.x1, at.x + side * JUMP_RUN)), y: to.point.y }, up = landing.y < at.y;
    if (landing.x !== at.x) face(landing.x < at.x ? -1 : 1);
    if (up) steps.push(play('look-up', at, facing), play('jump-prepare', at, facing));
    else steps.push(play(random() < .5 ? 'look-down' : 'edge-peek', at, facing));
    const distance = Math.hypot((landing.x - at.x) * DESK_CANVAS.width / DESK_CANVAS.height, landing.y - at.y);
    steps.push({ sequence: up ? 'jump-up' : 'jump-down', duration: Math.max(.3, Math.min(.7, distance / JUMP_SPEED)), from: at, to: landing, facing, jump: true });
    at = landing;
    if (up) steps.push(play('landing-recover', at, facing));
    walkTo(to.point.x, !up);
  } else walkTo(to.point.x);
  if (random() < .3) steps.push(play('sniff', to.point, facing, between(random, 1, 2)));
  // Balancing needs a narrow perch: only the top of the monitor.
  if (to.id === 'monitor' && random() < .6) steps.push(play('balance', to.point, facing, between(random, 1, 2)));
  steps.push(play('sit-down', to.point, facing));
  return steps;
}

/** `steps[0]` is playing, `elapsed` seconds in. A reaction plays on top and pauses it; `petted` = one is waiting for the step to end. */
export type CatState = { spot: CatSpotId; steps: CatStep[]; elapsed: number; reaction: { sequence: CatSequenceId; elapsed: number } | null; petted: boolean };
/** Seated on `previous` when that spot still exists and there is somewhere else to go; otherwise at home. */
export function startCat(spots: CatSpots, random: Random, previous?: CatSpotId): CatState {
  const spot = (spots.spots.length >= 2 && spots.spots.find(item => item.id === previous)) || spots.home;
  return { spot: spot.id, steps: restSteps(spots, spot, -1, random), elapsed: 0, reaction: null, petted: false };
}
/** With fewer than two spots there is nowhere to walk to: the cat goes (or stays) home. */
function nextVisit(current: CatSpotId, spots: CatSpots, facing: Facing, random: Random) {
  const from = spots.spots.find(item => item.id === current) ?? spots.home;
  const others = spots.spots.filter(item => item.id !== current);
  const to = spots.spots.length < 2 ? spots.home : others[Math.floor(random() * others.length)];
  const travel = travelSteps(from, to, facing, random);
  return { spot: to.id, steps: [...travel, ...restSteps(spots, to, travel[travel.length - 1].facing, random)] };
}
/** A walk is paused for a standing reaction. The crouch, the landing and the loaf have none: the cat reacts once it is out of them. */
const REACTIONS: Partial<Record<CatPose, CatSequenceId>> = { standing: 'react-standing', walking: 'react-standing', seated: 'react-seated', sleeping: 'react-sleeping' };
export function advanceCat(state: CatState, seconds: number, spots: CatSpots, random: Random): CatState {
  if (state.reaction) {
    const elapsed = state.reaction.elapsed + seconds;
    return { ...state, reaction: elapsed < playTime(state.reaction.sequence) ? { ...state.reaction, elapsed } : null };
  }
  let { spot, steps } = state, elapsed = state.elapsed + seconds;
  while (elapsed >= steps[0].duration) {
    const done = steps[0];
    elapsed -= done.duration; steps = steps.slice(1);
    if (!steps.length) ({ spot, steps } = nextVisit(spot, spots, facingAfter(done), random));
    const reaction = state.petted && REACTIONS[CAT_SEQUENCES[done.sequence].to];
    if (reaction) return { spot, steps, elapsed: 0, reaction: { sequence: reaction, elapsed: 0 }, petted: false };
  }
  return { ...state, spot, steps, elapsed };
}
/**
 * A click. In a looping sequence the cat reacts at once in its current pose (asleep it reacts without waking);
 * in a one-off move it reacts as soon as a move ends in a pose it can react in. A loaf ends at once: the cat
 * untucks and reacts seated.
 */
export function petCat(state: CatState): CatState {
  if (state.reaction) return state;
  const [step, ...rest] = state.steps, current = CAT_SEQUENCES[step.sequence], reaction = REACTIONS[current.from];
  if (!current.loop) return { ...state, petted: true };
  return reaction ? { ...state, reaction: { sequence: reaction, elapsed: 0 } } : { ...state, steps: [{ ...step, duration: state.elapsed }, ...rest], petted: true };
}
/** Development preview: runs the cat ahead until `move` is about to play, so it shows with the moves around it. */
export function skipToMove(state: CatState, move: CatSequenceId, spots: CatSpots, random: Random): CatState {
  for (let i = 0; i < 400000 && state.steps[0].sequence !== move; i++) {
    if (state.steps[1]?.sequence === move) return { ...state, elapsed: Math.max(state.elapsed, state.steps[0].duration - 2) };
    state = advanceCat(state, .05, spots, random);
  }
  return state;
}

function frameAt(id: CatSequenceId, elapsed: number) {
  const { fps, order, loop } = CAT_SEQUENCES[id], index = Math.floor(elapsed * fps);
  return order[loop ? index % order.length : Math.min(index, order.length - 1)];
}
const progress = (step: CatStep, elapsed: number) => clamp01(elapsed / step.duration);
/** A jump stretches its airborne frames over the whole flight. */
function stepFrame(step: CatStep, elapsed: number) {
  const { order } = CAT_SEQUENCES[step.sequence];
  return step.jump ? order[Math.min(order.length - 1, Math.floor(progress(step, elapsed) * order.length))] : frameAt(step.sequence, elapsed);
}
function stepPoint(step: CatStep, elapsed: number): Point {
  const t = progress(step, elapsed);
  if (step.jump) return arcPoint(step.from, step.to, t, JUMP_LIFT);
  return lerpPoint(step.from, step.to, step.ease === 'in' ? t * t : step.ease === 'out' ? t * (2 - t) : t);
}
/** What to draw now: sequence, frame, where the paws are, and which way the sheet is drawn (sheets face right). */
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
