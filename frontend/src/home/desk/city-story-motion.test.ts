import { describe, expect, it } from 'vitest';
import { activeShots, actorPosition, chaseAt, chaseRoofs, chaseScale, CHASE_DURATION, CHASE_INTERVAL, CHASE_PATTERNS, CHASE_START, CITY_LEDGES, davidRouteProgress, firingPose, projectChasePoint, sandevistanIntensity, shotAim, shotCues, trainAt, trainFlight } from './city-story-motion.ts';

describe('background city choreography', () => {
  it('rotates three chase patterns every50seconds with quiet gaps', () => {
    expect(CHASE_INTERVAL).toBeGreaterThanOrEqual(40);
    expect(CHASE_INTERVAL).toBeLessThanOrEqual(60);
    expect(CHASE_DURATION).toBeLessThan(CHASE_INTERVAL / 3);
    expect(chaseAt(0)).toBeNull();
    for (let cycle = 0; cycle < 7; cycle++) {
      expect(chaseAt(cycle * CHASE_INTERVAL + CHASE_START + 1)?.pattern).toBe(cycle % 3);
      expect(chaseAt(cycle * CHASE_INTERVAL + CHASE_START + CHASE_DURATION + 1)).toBeNull();
    }
  });
  it('gives both actors separate paths and changes the lead/direction', () => {
    for (let route = 0; route < 3; route++) for (const progress of [.2,.5,.8]) {
      const d = actorPosition(route, 'david', progress), s = actorPosition(route, 'smasher', progress);
      expect(Math.hypot(d.x - s.x, d.y - s.y)).toBeGreaterThan(.05);
    }
    expect(actorPosition(0,'david',.5).x).toBeGreaterThan(actorPosition(0,'smasher',.5).x);
    expect(actorPosition(1,'smasher',.05).x).toBeLessThan(actorPosition(1,'david',.05).x);
    expect(actorPosition(1,'david',.16).x).toBeLessThan(actorPosition(1,'smasher',.16).x);
    expect(actorPosition(1,'david',.5).facing).toBe(-1);
    expect(actorPosition(2,'david',.3).facing).toBe(-1);
    expect(actorPosition(2,'david',.85).facing).toBe(1);
  });
  it('moves continuously through route corners without teleporting', () => {
    for (let route = 0; route < 3; route++) for (const actor of ['david','smasher'] as const) {
      let previous = actorPosition(route, actor, 0);
      for (let step = 1; step <= 1000; step++) {
        const position = actorPosition(route, actor, step / 1000);
        expect(Math.hypot(position.x - previous.x, position.y - previous.y)).toBeLessThan(.04);
        previous = position;
      }
    }
  });
  it('has brief exchanges from both characters, with no firing during quiet pursuit', () => {
    for (let route = 0; route < CHASE_PATTERNS.length; route++) {
      const cues = shotCues(route);
      for (const actor of ['david','smasher']) {
        expect(cues.filter(cue => cue.from === actor).length).toBeGreaterThanOrEqual(2);
        expect(cues.filter(cue => cue.from === actor).length).toBeLessThanOrEqual(4);
      }
      for (const progress of [0,.1,.5,.95,1]) expect(activeShots(route, progress)).toEqual([]);
      for (const cue of cues) {
        const shots = activeShots(route, cue.at + .01);
        expect(shots.some(shot => shot.from === cue.from)).toBe(true);
        expect(firingPose(route, cue.from, cue.at + .01)?.frame).toBeLessThan(4);
        expect([1,-1]).toContain(shotAim(route, cue).facing);
      }
    }
  });
  it('projects each bullet from its firing position toward the opposing route', () => {
    for (let route = 0; route < 3; route++) for (const cue of shotCues(route)) {
      const shot = activeShots(route, cue.at + .1 / CHASE_DURATION).find(item => item.at === cue.at && item.from === cue.from)!;
      expect(shot).toBeDefined();
      expect(shot.flight).toBeCloseTo(.1 / .35);
      expect(shot.point.x).toBeCloseTo(shot.origin.x + (shot.target.x - shot.origin.x) * shot.flight);
      expect(shot.point.y).toBeCloseTo(shot.origin.y + (shot.target.y - shot.origin.y) * shot.flight);
      expect(shot.age).toBeCloseTo(.1);
    }
  });
  it('alternates level, banking and receding flights instead of following rails', () => {
    expect(trainFlight(0,.5).angle).toBe(0);
    expect(trainFlight(1,.2).angle).not.toBe(0);
    expect(trainFlight(1,.5).y).toBeLessThan(trainFlight(1,0).y);
    const near = trainFlight(2,.1), far = trainFlight(2,.9);
    expect(far.scale).toBeLessThan(near.scale / 5);
    expect(far.y).toBeLessThan(near.y);
    expect(far.view).toBe('rear');
    expect(near.view).toBe('rear');
    expect(far.foreshorten).toBe(1);
    expect(far.angle).toBe(0);
    expect(trainFlight(0,.5).view).toBe('side');
    expect(trainFlight(1,.5).view).toBe('side');
    expect(trainFlight(2,1).alpha).toBe(0);
    expect(trainAt(30)).toBeNull();
    expect(trainAt(45 + 5)).toEqual(trainFlight(1,4.5 / 18));
  });
  it('keeps every running sample on a visible roof and marks only gaps as airborne', () => {
    for (let route = 0; route < CHASE_PATTERNS.length; route++) for (const actor of ['david','smasher'] as const) {
      let running = 0, airborne = 0;
      for (let sample = 0; sample <= 1000; sample++) {
        const p = actorPosition(route, actor, sample / 1000);
        if (p.airborne) { airborne++; continue; }
        running++;
        expect(CITY_LEDGES.some(roof => p.x >= roof.x0 - 1e-8 && p.x <= roof.x1 + 1e-8 && Math.abs(p.y - roof.y) < 1e-8)).toBe(true);
      }
      expect(running).toBeGreaterThan(700);
      expect(airborne).toBeGreaterThan(10);
    }
  });
  it('starts each exchange while the shooter is grounded', () => {
    for (let route = 0; route < CHASE_PATTERNS.length; route++) for (const cue of shotCues(route)) expect(actorPosition(route, cue.from, cue.at).airborne).toBe(false);
  });
  it('accelerates David during two short bursts and returns to normal route speed', () => {
    const fast = davidRouteProgress(.13) - davidRouteProgress(.12);
    const normal = davidRouteProgress(.31) - davidRouteProgress(.30);
    expect(fast).toBeGreaterThan(normal * 3);
    expect(normal).toBeCloseTo(.01);
    expect(sandevistanIntensity(.125)).toBeCloseTo(1);
    expect(sandevistanIntensity(.495)).toBeCloseTo(1);
    expect(sandevistanIntensity(.3)).toBe(0);
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const progress = davidRouteProgress(i / 1000);
      expect(progress).toBeGreaterThanOrEqual(previous);
      expect(progress).toBeLessThanOrEqual(1);
      previous = progress;
    }
  });
  it('alternates distant and close encounters without changing the route rotation', () => {
    for (let cycle = 0; cycle < 6; cycle++) {
      const state = chaseAt(cycle * CHASE_INTERVAL + CHASE_START + 1)!;
      expect(state.depth).toBe(cycle % 2 === 0 ? 'far' : 'near');
      expect(state.pattern).toBe(cycle % 3);
    }
    expect(chaseScale('far')).toBeLessThan(chaseScale('near'));
  });
  it('projects feet onto the same rendered roofs at both encounter depths', () => {
    for (const depth of ['near','far'] as const) for (let route = 0; route < 3; route++) for (const actor of ['david','smasher'] as const) for (let step = 0; step <= 100; step++) {
      const position = actorPosition(route, actor, step / 100);
      if (position.airborne) continue;
      const foot = projectChasePoint(position, depth);
      expect(chaseRoofs(depth).some(roof => foot.x >= roof.x0 - 1e-8 && foot.x <= roof.x1 + 1e-8 && Math.abs(foot.y - roof.y) < 1e-8)).toBe(true);
    }
  });
});
