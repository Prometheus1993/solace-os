import { describe, expect, it } from 'vitest';
import {
  adjustedBox, advanceCat, canChain, CAT_SEQUENCE_IDS, CAT_SEQUENCES, CAT_SHEETS, catBox, catGround, catSheet, catSpots, catView, facingAfter, petCat, restSteps, skipToMove,
  startCat, travelSteps, type CatSequenceId, type CatSpotId, type CatSpots, type CatState, type CatStep,
} from './desk-cat.ts';
import { adjustProp } from './desk-layout-state.ts';

/** Small seeded generator: the same seed always gives the same cat. */
function seeded(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
const spot = (spots: CatSpots, id: CatSpotId) => spots.spots.find(item => item.id === id)!;
/** Runs the cat for `seconds` and reports every step and sequence it started, where it rested and every point it was at. */
function run(spots: CatSpots, seconds: number, seed = 7, state = startCat(spots, seeded(seed))) {
  const random = seeded(seed + 1), started: CatStep[] = [state.steps[0]], visited = new Set<CatSpotId>([state.spot]);
  const points = [catView(state).point];
  for (let time = 0; time < seconds; time += .05) {
    const before = state.steps[0];
    state = advanceCat(state, .05, spots, random);
    if (state.steps[0] !== before) started.push(state.steps[0]);
    visited.add(state.spot); points.push(catView(state).point);
  }
  return { state, started, played: started.map(step => step.sequence), visited, points };
}
/** Random numbers in the given order, then `rest` for ever. */
const scripted = (values: number[], rest = .99) => { let index = 0; return () => values[index++] ?? rest; };
const names = (steps: CatStep[]) => steps.map(step => step.sequence);
const until = (state: CatState, spots: CatSpots, sequence: CatSequenceId) => {
  const random = seeded(3);
  for (let i = 0; state.steps[0].sequence !== sequence; i++) {
    if (i > 100000) throw new Error(`never reached ${sequence}`);
    state = advanceCat(state, .05, spots, random);
  }
  return state;
};

describe('cat sequences', () => {
  it('chains only sequences whose poses connect', () => {
    expect(canChain('sit-down', 'sit')).toBe(true);
    expect(canChain('sit', 'lie-down')).toBe(true);
    expect(canChain('lie-down', 'sleep')).toBe(true);
    expect(canChain('sleep', 'wake-up')).toBe(true);
    expect(canChain('wake-up', 'stand-up')).toBe(true);
    expect(canChain('stand-up', 'walk-start')).toBe(true);
    expect(canChain('stand-up', 'walk')).toBe(false);
    expect(canChain('sleep', 'walk')).toBe(false);
    expect(canChain('walk', 'groom')).toBe(false);
    expect(canChain('sit', 'sleep')).toBe(false);
  });
  it('connects the new moves only through the poses they share', () => {
    const chains: CatSequenceId[][] = [
      ['stand-idle', 'walk-start', 'walk', 'walk-stop', 'sit-down', 'sit'],
      ['look-up', 'jump-prepare', 'jump-up', 'landing-recover', 'stand-idle'],
      ['look-down', 'jump-down', 'landing-to-walk', 'walk', 'walk-stop'],
      ['edge-peek', 'jump-down', 'landing-recover', 'reposition', 'head-led-turn', 'walk-start'],
      ['reposition', 'turn-around', 'walk-start', 'walk-stop', 'sniff', 'balance', 'sit-down'],
      ['sit', 'yawn', 'watch-city', 'sit-to-loaf', 'loaf', 'loaf-to-sit', 'knead', 'sit'],
      ['stand-up', 'circle-before-sleep', 'sleep', 'wake-up', 'sit'],
    ];
    for (const chain of chains) for (let i = 1; i < chain.length; i++) expect(canChain(chain[i - 1], chain[i]), `${chain[i - 1]} -> ${chain[i]}`).toBe(true);
    const broken: [CatSequenceId, CatSequenceId][] = [
      ['stand-idle', 'walk'], ['walk', 'sit-down'], ['walk', 'stand-idle'], ['walk-start', 'walk-start'], ['look-up', 'jump-up'], ['jump-prepare', 'jump-down'],
      ['jump-up', 'walk'], ['jump-down', 'sit-down'], ['landing-to-walk', 'sit-down'], ['sit', 'loaf'], ['loaf', 'sit'], ['loaf', 'stand-up'], ['sit-to-loaf', 'sit'],
      ['loaf-to-sit', 'loaf'], ['sit', 'circle-before-sleep'], ['circle-before-sleep', 'sit'], ['sit', 'balance'], ['stand-idle', 'knead'], ['sleep', 'loaf-to-sit'],
    ];
    for (const [previous, next] of broken) expect(canChain(previous, next), `${previous} -> ${next}`).toBe(false);
  });
  it('plays the idle loops forward and back, the rest straight through', () => {
    const pingPong = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
    for (const id of ['stand-idle', 'sit', 'sleep', 'react-sleeping', 'knead', 'watch-city', 'balance', 'loaf'] as const) expect(CAT_SEQUENCES[id].order).toEqual(pingPong);
    expect(CAT_SEQUENCES.walk.order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(CAT_SEQUENCE_IDS).toHaveLength(35);
  });
  it('leaves the loaf by playing the sit-to-loaf sheet backward', () => {
    expect(catSheet('loaf-to-sit')).toBe('sit-to-loaf');
    expect(CAT_SEQUENCES['sit-to-loaf'].order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(CAT_SEQUENCES['loaf-to-sit'].order).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(CAT_SEQUENCES['loaf-to-sit'].fps).toBe(CAT_SEQUENCES['sit-to-loaf'].fps);
    const at = { x: .5, y: .5 }, step: CatStep = { sequence: 'loaf-to-sit', duration: 1, from: at, to: at, facing: 1 };
    const frame = (elapsed: number) => catView({ spot: 'cushion', steps: [step], elapsed, reaction: null, petted: false }).frame;
    expect([0, .13, .5, .99].map(frame)).toEqual([7, 6, 3, 0]);
  });
  it('has one sheet per sequence except the reversed one, with three rows for the 12-frame moves', () => {
    expect(CAT_SHEETS).toHaveLength(34);
    expect(CAT_SHEETS.map(sheet => sheet.id)).not.toContain('loaf-to-sit');
    expect(CAT_SHEETS.filter(sheet => sheet.rows === 3).map(sheet => sheet.id)).toEqual(['turn-around', 'circle-before-sleep']);
    expect(CAT_SHEETS.every(sheet => sheet.rows === 2 || sheet.rows === 3)).toBe(true);
    for (const id of CAT_SEQUENCE_IDS) expect(CAT_SHEETS.some(sheet => sheet.id === catSheet(id))).toBe(true);
  });
});

describe('cat spots', () => {
  it('has a cushion, windowsill and monitor-top spot on the default desk', () => {
    const { home, spots } = catSpots({});
    expect(spots.map(item => item.id)).toEqual(['cushion', 'windowsill', 'monitor']);
    expect(home).toBe(spots[0]);
    expect(spot({ home, spots }, 'monitor').point.x).toBeCloseTo(.512);
    expect(spot({ home, spots }, 'monitor').point.y).toBeCloseTo(.43576);
  });
  it('moves a spot with its prop', () => {
    const before = catSpots({}), after = catSpots(adjustProp({}, 'monitor', { x: 10, y: -5 }));
    expect(spot(after, 'monitor').point.x).toBeCloseTo(spot(before, 'monitor').point.x + .1);
    expect(spot(after, 'monitor').point.y).toBeCloseTo(spot(before, 'monitor').point.y - .05);
    expect(spot(after, 'monitor').x0).toBeCloseTo(spot(before, 'monitor').x0 + .1);
    expect(spot(after, 'windowsill')).toEqual(spot(before, 'windowsill'));
  });
  it('scales a prop around its bottom centre, like the editor does', () => {
    expect(adjustedBox({ left: .4, top: .4, width: .2, height: .2 }, { x: 0, y: 0, scale: 2 })).toEqual({ left: .3, top: expect.closeTo(.2), width: .4, height: .4 });
  });
  it('drops the spot of a hidden prop but keeps home', () => {
    const { home, spots } = catSpots(adjustProp({}, 'window', { hidden: true }));
    expect(spots.map(item => item.id)).toEqual(['cushion', 'monitor']);
    const noCushion = catSpots(adjustProp({}, 'companion', { hidden: true }));
    expect(noCushion.spots.map(item => item.id)).toEqual(['windowsill', 'monitor']);
    expect(noCushion.home).toEqual(home);
  });
});

describe('cat routes and facing', () => {
  const spots = catSpots({}), random = () => .9;
  it('turns round, walks left along the floor and jumps up onto the monitor', () => {
    const steps = travelSteps(spot(spots, 'cushion'), spot(spots, 'monitor'), 1, random);
    expect(names(steps)).toEqual(['reposition', 'turn-around', 'walk-start', 'walk', 'walk-stop', 'look-up', 'jump-prepare', 'jump-up', 'landing-recover', 'sit-down']);
    expect(steps.map(step => step.facing)).toEqual([1, 1, -1, -1, -1, -1, -1, -1, -1, -1]);
    expect(steps[2].from).toEqual(spot(spots, 'cushion').point);
    expect(steps[4].to.y).toBe(steps[2].from.y);
    expect(steps[7].from).toEqual(steps[4].to);
    expect(steps[7].to.x).toBeCloseTo(spot(spots, 'monitor').point.x);
    expect(steps[7].to.y).toBe(spot(spots, 'monitor').point.y);
    expect(steps[9].from).toEqual(spot(spots, 'monitor').point);
  });
  it('looks down before a jump to a lower spot and walks on out of the landing', () => {
    const down = travelSteps(spot(spots, 'monitor'), spot(spots, 'cushion'), 1, random);
    expect(names(down)).toEqual(['walk-start', 'walk', 'walk-stop', 'edge-peek', 'jump-down', 'landing-to-walk', 'walk-stop', 'sit-down']);
    expect(down.every(step => step.facing === 1)).toBe(true);
    expect(down[4].to.x - down[4].from.x).toBeCloseTo(.08);
    expect(down[6].to).toEqual(spot(spots, 'cushion').point);
    expect(names(travelSteps(spot(spots, 'monitor'), spot(spots, 'cushion'), 1, () => .1))).toContain('look-down');
    const up = travelSteps(spot(spots, 'windowsill'), spot(spots, 'monitor'), 1, random);
    expect(names(up)).toEqual(['walk-start', 'walk', 'walk-stop', 'look-up', 'jump-prepare', 'jump-up', 'landing-recover', 'walk-start', 'walk-stop', 'sit-down']);
    expect(up[2].to.x).toBeCloseTo(spot(spots, 'windowsill').x1);
    expect(up[5].to.x - up[5].from.x).toBeCloseTo(.08);
  });
  it('recovers from a landing when it has nowhere left to walk', () => {
    const sill = spot(spots, 'windowsill'), below = { ...spot(spots, 'cushion'), point: { x: sill.point.x + .08, y: .9 } };
    expect(names(travelSteps(sill, below, 1, random))).toEqual(['edge-peek', 'jump-down', 'landing-recover', 'sit-down']);
  });
  it('turns right to left with the sheet as drawn and left to right with the whole sheet mirrored', () => {
    for (const [pick, turn] of [[.1, 'head-led-turn'], [.9, 'turn-around']] as const) {
      const toLeft = travelSteps(spot(spots, 'cushion'), spot(spots, 'monitor'), 1, scripted([.9, pick]));
      expect(names(toLeft).slice(0, 3)).toEqual(['reposition', turn, 'walk-start']);
      expect(toLeft.slice(0, 3).map(step => step.facing)).toEqual([1, 1, -1]);
      const toRight = travelSteps(spot(spots, 'monitor'), spot(spots, 'cushion'), -1, scripted([.9, pick]));
      expect(names(toRight).slice(0, 3)).toEqual(['reposition', turn, 'walk-start']);
      expect(toRight.slice(0, 3).map(step => step.facing)).toEqual([-1, -1, 1]);
      // One facing for the whole turn step: the mirror never flips halfway through playback.
      const turning: CatState = { spot: 'monitor', steps: toRight.slice(1), elapsed: 0, reaction: null, petted: false };
      for (let elapsed = 0; elapsed < toRight[1].duration; elapsed += .05) expect(catView({ ...turning, elapsed }).facing).toBe(-1);
      expect(facingAfter(toRight[1])).toBe(1);
      expect(facingAfter(toLeft[1])).toBe(-1);
      expect(facingAfter(toLeft[0])).toBe(1);
    }
    expect(names(travelSteps(spot(spots, 'cushion'), spot(spots, 'monitor'), -1, random))).not.toContain('reposition');
  });
  it('sometimes idles first, speeds up, walks whole strides and slows down', () => {
    const steps = travelSteps(spot(spots, 'cushion'), spot(spots, 'monitor'), -1, scripted([.1]));
    expect(names(steps).slice(0, 4)).toEqual(['stand-idle', 'walk-start', 'walk', 'walk-stop']);
    const [, start, walk, stop] = steps;
    expect(walk.duration / .8).toBeCloseTo(Math.round(walk.duration / .8));
    expect([start.ease, walk.ease, stop.ease]).toEqual(['in', undefined, 'out']);
    expect(start.from.x - start.to.x).toBeCloseTo(.04);
    expect(stop.from.x - stop.to.x).toBeCloseTo(.04);
    const at = (step: CatStep, elapsed: number) => catView({ spot: 'monitor', steps: [step], elapsed, reaction: null, petted: false }).point.x;
    expect(start.from.x - at(start, .4)).toBeCloseTo(.01);
    expect(at(stop, .4) - stop.to.x).toBeCloseTo(.01);
    expect(at(walk, walk.duration / 2)).toBeCloseTo((walk.from.x + walk.to.x) / 2);
  });
  it('shares a short distance between the start and the stop instead of walking a stride on the spot', () => {
    const sill = spot(spots, 'windowsill'), near = { ...sill, point: { x: sill.point.x + .05, y: sill.point.y } };
    const steps = travelSteps(sill, near, 1, random);
    expect(names(steps)).toEqual(['walk-start', 'walk-stop', 'sit-down']);
    expect(steps[0].to.x).toBeCloseTo(sill.point.x + .025);
    expect(steps[1].to.x).toBe(near.point.x);
  });
  it('plays only the airborne frames of a jump, stretched over the flight, and lands at the height of the target', () => {
    const jump = travelSteps(spot(spots, 'windowsill'), spot(spots, 'monitor'), 1, random)[5];
    const at = (elapsed: number) => catView({ spot: 'monitor', steps: [jump], elapsed, reaction: null, petted: false });
    expect(jump.sequence).toBe('jump-up');
    expect(jump.duration).toBeGreaterThanOrEqual(.3);
    expect(jump.duration).toBeLessThanOrEqual(.7);
    expect(at(0).point).toEqual(jump.from);
    expect(at(.01).frame).toBe(4);
    const middle = at(jump.duration / 2 + .01);
    expect(middle.point.y).toBeLessThan(Math.min(jump.from.y, jump.to.y) + .08);
    expect(middle.frame).toBe(5);
    expect(jump.to.y).toBe(spot(spots, 'monitor').point.y);
    expect(at(jump.duration - .001).point.x).toBeCloseTo(jump.to.x);
    expect(at(jump.duration - .001).point.y).toBeCloseTo(jump.to.y);
    expect(at(jump.duration - .001).frame).toBe(5);
  });
  it('balances only on the monitor and may sniff on arrival anywhere', () => {
    const eager = () => .1;
    expect(names(travelSteps(spot(spots, 'cushion'), spot(spots, 'monitor'), 1, eager)).slice(-3)).toEqual(['sniff', 'balance', 'sit-down']);
    for (const [from, to] of [['monitor', 'cushion'], ['monitor', 'windowsill'], ['cushion', 'windowsill'], ['windowsill', 'cushion']] as const) {
      const steps = names(travelSteps(spot(spots, from), spot(spots, to), 1, eager));
      expect(steps).not.toContain('balance');
      expect(steps.slice(-2)).toEqual(['sniff', 'sit-down']);
    }
  });
  it('mirrors the sprite box around the paws when facing left', () => {
    const crop = { x: 50, y: 152, width: 412, height: 313 };
    const right = catBox(crop, 1, 1), left = catBox(crop, -1, 1);
    expect(right.dx).toBeCloseTo(-206 * .115 / 512);
    expect(left.dx).toBeCloseTo(-(right.dx + right.width));
    expect(right.dy + right.height).toBeCloseTo(.115 / 512 + 3 / 1600);
    expect(catBox(crop, 1, 2).width).toBeCloseTo(right.width * 2);
  });
  it('draws every frame of every sequence at the walk scale with its ground row on the walk baseline', () => {
    const walk = catBox({ x: 0, y: 0, width: 512, height: 512 }, 1, 1, catGround('walk', 0));
    const baseline = walk.dy + 463 * .115 / 512;
    for (const id of CAT_SEQUENCE_IDS) for (const frame of CAT_SEQUENCES[id].order) {
      const ground = catGround(id, frame);
      expect(ground, `${id} ${frame}`).toBeGreaterThan(400);
      const box = catBox({ x: 0, y: 0, width: 512, height: 512 }, 1, 1, ground);
      expect(box.width).toBeCloseTo(.115);
      expect(box.height).toBeCloseTo(.115);
      expect(box.dy + ground * .115 / 512, `${id} ${frame}`).toBeCloseTo(baseline);
    }
  });
  it('lowers the sleeping cat to its paws, not its tail tip', () => {
    expect(catBox({ x: 0, y: 0, width: 512, height: 512 }, 1, 1, catGround('sleep', 0)).dy).toBeGreaterThan(catBox({ x: 0, y: 0, width: 512, height: 512 }, 1, 1, catGround('walk', 0)).dy);
  });
});

describe('cat state machine', () => {
  const spots = catSpots({});
  it('starts seated on the cushion', () => {
    const state = startCat(spots, seeded(1));
    expect(state.spot).toBe('cushion');
    expect(catView(state)).toEqual({ sequence: 'sit', frame: 0, point: spots.home.point, facing: -1 });
  });
  it('rests seated to standing, napping one of three ways', () => {
    const rest = (random: () => number, id: CatSpotId = 'cushion', layout = spots) => names(restSteps(layout, spot(spots, id), 1, random));
    for (const random of [() => .1, () => .5, () => .9]) {
      const steps = rest(random);
      expect(CAT_SEQUENCES[steps[0]].from).toBe('seated');
      expect(CAT_SEQUENCES[steps[steps.length - 1]].to).toBe('standing');
      for (let i = 1; i < steps.length; i++) expect(canChain(steps[i - 1], steps[i]), `${steps[i - 1]} -> ${steps[i]}`).toBe(true);
    }
    expect(rest(() => .1)).toEqual(['sit', 'groom', 'sit', 'knead', 'sit', 'watch-city', 'sit', 'yawn', 'lie-down', 'sleep', 'wake-up', 'sit', 'stand-up', 'stretch']);
    expect(rest(() => .5, 'monitor')).toEqual(['sit', 'sit-to-loaf', 'loaf', 'loaf-to-sit', 'sit', 'stand-up']);
    expect(rest(() => .9)).toEqual(['sit', 'stand-up', 'circle-before-sleep', 'sleep', 'wake-up', 'sit', 'stand-up']);
  });
  it('kneads only on a cushion that is there', () => {
    const eager = () => .1, noCushion = catSpots(adjustProp({}, 'companion', { hidden: true }));
    expect(names(restSteps(spots, spot(spots, 'cushion'), 1, eager))).toContain('knead');
    expect(names(restSteps(spots, spot(spots, 'windowsill'), 1, eager))).not.toContain('knead');
    expect(names(restSteps(spots, spot(spots, 'monitor'), 1, eager))).not.toContain('knead');
    expect(names(restSteps(noCushion, noCushion.home, 1, eager))).not.toContain('knead');
  });
  it('watches the city mostly from the windowsill', () => {
    const maybe = () => .5;
    expect(names(restSteps(spots, spot(spots, 'windowsill'), 1, maybe))).toContain('watch-city');
    expect(names(restSteps(spots, spot(spots, 'cushion'), 1, maybe))).not.toContain('watch-city');
    expect(names(restSteps(spots, spot(spots, 'monitor'), 1, maybe))).not.toContain('watch-city');
  });
  it('visits every spot, plays every move and never plays a sequence its pose does not allow', () => {
    const { started, played, visited } = run(spots, 6 * 3600);
    for (let i = 1; i < played.length; i++) expect(canChain(played[i - 1], played[i]), `${played[i - 1]} -> ${played[i]}`).toBe(true);
    expect([...visited].sort()).toEqual(['cushion', 'monitor', 'windowsill']);
    expect([...new Set(played)].sort()).toEqual(CAT_SEQUENCE_IDS.filter(id => !id.startsWith('react-')).sort());
    // The cat only ever faces the other way after a whole turn.
    for (let i = 1; i < started.length; i++) expect(started[i].facing, `${played[i - 1]} -> ${played[i]}`).toBe(facingAfter(started[i - 1]));
  });
  it('keeps each spot\'s own moves on that spot', () => {
    const { started } = run(spots, 6 * 3600, 11);
    const where = (id: CatSequenceId) => started.filter(step => step.sequence === id).map(step => step.from);
    expect(where('knead').length).toBeGreaterThan(0);
    expect(where('balance').length).toBeGreaterThan(0);
    for (const point of where('knead')) expect(point).toEqual(spot(spots, 'cushion').point);
    for (const point of where('balance')) expect(point).toEqual(spot(spots, 'monitor').point);
    const noCushion = run(catSpots(adjustProp({}, 'companion', { hidden: true })), 6 * 3600, 11);
    expect(noCushion.played).not.toContain('knead');
    expect(run(catSpots(adjustProp({}, 'monitor', { hidden: true })), 6 * 3600, 11).played).not.toContain('balance');
  });
  it('is the same cat for the same random numbers', () => {
    expect(run(spots, 600, 42).state).toEqual(run(spots, 600, 42).state);
    expect(run(spots, 600, 42).played).not.toEqual(run(spots, 600, 43).played);
  });
  it('never targets a hidden prop', () => {
    const { visited } = run(catSpots(adjustProp({}, 'window', { hidden: true })), 3600);
    expect([...visited].sort()).toEqual(['cushion', 'monitor']);
    const noCushion = run(catSpots(adjustProp({}, 'companion', { hidden: true })), 3600);
    expect([...noCushion.visited].sort()).toEqual(['cushion', 'monitor', 'windowsill']);
    expect(noCushion.state.spot).not.toBe('cushion');
  });
  it('stays on the cushion when fewer than two spots remain', () => {
    const lonely = catSpots(adjustProp(adjustProp({}, 'window', { hidden: true }), 'monitor', { hidden: true }));
    const { visited, points, played } = run(lonely, 1800);
    expect([...visited]).toEqual(['cushion']);
    expect(points.every(point => point.x === lonely.home.point.x && point.y === lonely.home.point.y)).toBe(true);
    expect(played).not.toContain('walk');
    const onlyMonitor = catSpots(adjustProp(adjustProp({}, 'window', { hidden: true }), 'companion', { hidden: true }));
    expect(startCat(onlyMonitor, seeded(1), 'monitor').spot).toBe('cushion');
    expect([...run(onlyMonitor, 1800).visited]).toEqual(['cushion']);
  });
  it('settles again on the spot it was on when the layout changes, or at home when that spot is gone', () => {
    expect(startCat(spots, seeded(1), 'monitor').spot).toBe('monitor');
    expect(catView(startCat(spots, seeded(1), 'monitor')).point).toEqual(spot(spots, 'monitor').point);
    expect(startCat(catSpots(adjustProp({}, 'monitor', { hidden: true })), seeded(1), 'monitor').spot).toBe('cushion');
  });
});

describe('petting the cat', () => {
  const spots = catSpots({});
  const finish = (state: CatState) => { while (state.reaction) state = advanceCat(state, .05, spots, seeded(5)); return state; };
  it('reacts seated while sitting and carries on afterwards', () => {
    const sitting = advanceCat(startCat(spots, seeded(1)), 1, spots, seeded(2)), petted = petCat(sitting);
    expect(catView(petted)).toMatchObject({ sequence: 'react-seated', frame: 0, point: spots.home.point });
    expect(petCat(petted)).toBe(petted);
    expect(finish(petted)).toEqual(sitting);
  });
  it('reacts in its sleep without waking up', () => {
    const asleep = advanceCat(until(startCat(spots, seeded(1)), spots, 'sleep'), 1, spots, seeded(2)), petted = petCat(asleep);
    expect(catView(petted).sequence).toBe('react-sleeping');
    const after = finish(petted);
    expect(after.steps[0].sequence).toBe('sleep');
    expect(after).toEqual(asleep);
  });
  it('reacts standing in the middle of a walk without leaving its route', () => {
    const walking = advanceCat(until(startCat(spots, seeded(1)), spots, 'walk'), .4, spots, seeded(2)), petted = petCat(walking);
    expect(walking.steps[0].sequence).toBe('walk');
    expect(catView(petted)).toMatchObject({ sequence: 'react-standing', point: catView(walking).point, facing: catView(walking).facing });
    expect(finish(petted)).toEqual(walking);
  });
  it('waits for a one-off move to end and then reacts in the pose it ends in', () => {
    const lying = petCat(until(startCat(spots, seeded(1)), spots, 'lie-down'));
    expect(catView(lying).sequence).toBe('lie-down');
    const reacting = until(lying, spots, 'sleep');
    expect(catView(reacting).sequence).toBe('react-sleeping');
    expect(finish(reacting)).toMatchObject({ petted: false, reaction: null, elapsed: 0 });
  });
  it('waits through the crouch, the jump and the landing before it reacts', () => {
    const crouching = petCat(until(startCat(spots, seeded(1)), spots, 'jump-prepare'));
    let state = crouching;
    const seen = new Set<CatSequenceId>();
    while (!state.reaction) { seen.add(catView(state).sequence); state = advanceCat(state, .05, spots, seeded(5)); }
    expect([...seen]).toEqual(['jump-prepare', 'jump-up', 'landing-recover']);
    expect(catView(state).sequence).toBe('react-standing');
  });
  it('untucks from a loaf at once and then reacts seated', () => {
    const loafing = advanceCat(until(startCat(spots, seeded(1)), spots, 'loaf'), 1, spots, seeded(2)), petted = petCat(loafing);
    expect(petted).toMatchObject({ reaction: null, petted: true });
    expect(catView(petted).sequence).toBe('loaf');
    const leaving = advanceCat(petted, .05, spots, seeded(2));
    expect(catView(leaving)).toMatchObject({ sequence: 'loaf-to-sit', frame: 7 });
    expect(leaving.reaction).toBeNull();
    expect(catView(until(leaving, spots, 'sit')).sequence).toBe('react-seated');
    expect(finish(until(leaving, spots, 'sit'))).toMatchObject({ petted: false, reaction: null });
  });
});

describe('cat move preview', () => {
  const spots = catSpots({});
  it('runs ahead until the asked move is next, at most two seconds away', () => {
    for (const move of ['turn-around', 'knead', 'balance', 'loaf-to-sit', 'circle-before-sleep', 'landing-to-walk'] as const) {
      const state = skipToMove(startCat(spots, seeded(1)), move, spots, seeded(2));
      expect(state.steps[1].sequence, move).toBe(move);
      expect(state.steps[0].duration - state.elapsed).toBeLessThanOrEqual(2);
      expect(canChain(state.steps[0].sequence, move)).toBe(true);
    }
    expect(skipToMove(startCat(spots, seeded(1)), 'sit', spots, seeded(2))).toEqual(startCat(spots, seeded(1)));
  });
});
