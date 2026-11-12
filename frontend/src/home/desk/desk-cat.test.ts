import { describe, expect, it } from 'vitest';
import {
  adjustedBox, advanceCat, canChain, CAT_SEQUENCE_IDS, CAT_SEQUENCES, catBox, catSpots, catView, petCat, restSteps, startCat, travelSteps,
  type CatSequenceId, type CatSpotId, type CatSpots, type CatState,
} from './desk-cat.ts';
import { adjustProp } from './desk-layout-state.ts';

/** Small seeded generator: the same seed always gives the same cat. */
function seeded(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
const spot = (spots: CatSpots, id: CatSpotId) => spots.spots.find(item => item.id === id)!;
/** Runs the cat for `seconds` and reports every sequence start, where it rested and every point it was at. */
function run(spots: CatSpots, seconds: number, seed = 7, state = startCat(spots, seeded(seed))) {
  const random = seeded(seed + 1), played: CatSequenceId[] = [state.steps[0].sequence], visited = new Set<CatSpotId>([state.spot]);
  const points = [catView(state).point];
  for (let time = 0; time < seconds; time += .05) {
    const before = state.steps[0];
    state = advanceCat(state, .05, spots, random);
    if (state.steps[0] !== before) played.push(state.steps[0].sequence);
    visited.add(state.spot); points.push(catView(state).point);
  }
  return { state, played, visited, points };
}
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
    expect(canChain('stand-up', 'walk')).toBe(true);
    expect(canChain('sleep', 'walk')).toBe(false);
    expect(canChain('walk', 'groom')).toBe(false);
    expect(canChain('sit', 'sleep')).toBe(false);
  });
  it('plays the idle loops forward and back, the rest straight through', () => {
    const pingPong = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
    for (const id of ['stand-idle', 'sit', 'sleep', 'react-sleeping'] as const) expect(CAT_SEQUENCES[id].order).toEqual(pingPong);
    expect(CAT_SEQUENCES.walk.order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(CAT_SEQUENCE_IDS).toHaveLength(15);
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
  it('walks left along the floor facing left, then jumps up onto the monitor', () => {
    const steps = travelSteps(spot(spots, 'cushion'), spot(spots, 'monitor'), 1, random);
    expect(steps.map(step => step.sequence)).toEqual(['walk', 'jump-up', 'sit-down']);
    expect(steps.every(step => step.facing === -1)).toBe(true);
    expect(steps[0].from).toEqual(spot(spots, 'cushion').point);
    expect(steps[0].to.y).toBe(steps[0].from.y);
    expect(steps[1].from).toEqual(steps[0].to);
    expect(steps[1].to.x).toBeCloseTo(spot(spots, 'monitor').point.x);
    expect(steps[1].to.y).toBe(spot(spots, 'monitor').point.y);
    expect(steps[2].from).toEqual(spot(spots, 'monitor').point);
  });
  it('faces right when the target is to the right, and jumps down to a lower spot', () => {
    const up = travelSteps(spot(spots, 'windowsill'), spot(spots, 'monitor'), -1, random);
    expect(up.map(step => [step.sequence, step.facing])).toEqual([['walk', 1], ['jump-up', 1], ['walk', 1], ['sit-down', 1]]);
    expect(up[0].to.x).toBeCloseTo(spot(spots, 'windowsill').x1);
    expect(up[1].to.x - up[1].from.x).toBeCloseTo(.08);
    const down = travelSteps(spot(spots, 'monitor'), spot(spots, 'cushion'), -1, random);
    expect(down.map(step => [step.sequence, step.facing])).toEqual([['walk', 1], ['jump-down', 1], ['walk', 1], ['sit-down', 1]]);
    expect(down[1].to.x - down[1].from.x).toBeCloseTo(.08);
    expect(down[2].to).toEqual(spot(spots, 'cushion').point);
    const back = travelSteps(spot(spots, 'monitor'), spot(spots, 'windowsill'), 1, random);
    expect(back.map(step => [step.sequence, step.facing])).toEqual([['walk', -1], ['jump-down', -1], ['walk', -1], ['sit-down', -1]]);
  });
  it('sometimes idles first and always walks whole strides', () => {
    const steps = travelSteps(spot(spots, 'cushion'), spot(spots, 'monitor'), 1, () => .1);
    expect(steps[0].sequence).toBe('stand-idle');
    expect(steps[1].duration / .8).toBeCloseTo(Math.round(steps[1].duration / .8));
  });
  it('moves only while airborne in a jump and lands at the height of the target', () => {
    const jump = travelSteps(spot(spots, 'windowsill'), spot(spots, 'monitor'), 1, random)[1];
    const at = (elapsed: number) => catView({ spot: 'monitor', steps: [jump], elapsed, reaction: null, petted: false });
    expect(at(.2).point).toEqual(jump.from);
    expect(at(.2).frame).toBe(2);
    const middle = at(.4 + jump.air! / 2);
    expect(middle.point.y).toBeLessThan(Math.min(jump.from.y, jump.to.y) + .08);
    expect(middle.frame).toBe(5);
    expect(jump.to.y).toBe(spot(spots, 'monitor').point.y);
    expect(at(jump.duration - .01).point.x).toBeCloseTo(jump.to.x);
    expect(at(jump.duration - .01).point.y).toBeCloseTo(jump.to.y);
    expect(at(jump.duration - .01).frame).toBe(7);
  });
  it('mirrors the sprite box around the paws when facing left', () => {
    const crop = { x: 50, y: 152, width: 412, height: 313 };
    const right = catBox(crop, 1, 1), left = catBox(crop, -1, 1);
    expect(right.dx).toBeCloseTo(-206 * .115 / 512);
    expect(left.dx).toBeCloseTo(-(right.dx + right.width));
    expect(right.dy + right.height).toBeCloseTo(.115 / 512);
    expect(catBox(crop, 1, 2).width).toBeCloseTo(right.width * 2);
  });
});

describe('cat state machine', () => {
  const spots = catSpots({});
  it('starts seated on the cushion', () => {
    const state = startCat(spots, seeded(1));
    expect(state.spot).toBe('cushion');
    expect(catView(state)).toEqual({ sequence: 'sit', frame: 0, point: spots.home.point, facing: -1 });
  });
  it('rests seated to standing and travels standing to seated', () => {
    for (const random of [() => .1, () => .9]) {
      const rest = restSteps(spots.home.point, 1, random).map(step => step.sequence);
      expect(CAT_SEQUENCES[rest[0]].from).toBe('seated');
      expect(CAT_SEQUENCES[rest[rest.length - 1]].to).toBe('standing');
      expect(rest).toEqual(expect.arrayContaining(['sit', 'lie-down', 'sleep', 'wake-up', 'stand-up']));
    }
    expect(restSteps(spots.home.point, 1, () => .1).map(step => step.sequence)).toEqual(expect.arrayContaining(['groom', 'stretch']));
  });
  it('visits every spot and never plays a sequence its pose does not allow', () => {
    const { played, visited } = run(spots, 3600);
    for (let i = 1; i < played.length; i++) expect(canChain(played[i - 1], played[i]), `${played[i - 1]} -> ${played[i]}`).toBe(true);
    expect([...visited].sort()).toEqual(['cushion', 'monitor', 'windowsill']);
    expect(played).toEqual(expect.arrayContaining(['walk', 'jump-up', 'jump-down', 'sit-down', 'sit', 'groom', 'lie-down', 'sleep', 'wake-up', 'stand-up', 'stretch', 'stand-idle']));
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
});
