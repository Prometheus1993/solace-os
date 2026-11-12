import { describe, expect, it } from 'vitest';
import { cityRoofs, cityScale, CITY_LEDGES, nextTrain, projectCityPoint, startTrain, trainAt, trainFlight, trainGap, TRAIN_FLIGHT_SECONDS } from './city-story-motion.ts';

describe('background city choreography', () => {
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
  });
  it('waits a random 3 to 6 minutes between train passes', () => {
    expect(trainGap(() => 0)).toBe(180);
    expect(trainGap(() => .5)).toBe(270);
    expect(trainGap(() => .999999)).toBeLessThan(360);
    for (let i = 0; i < 200; i++) {
      const gap = trainGap(Math.random);
      expect(gap).toBeGreaterThanOrEqual(180);
      expect(gap).toBeLessThan(360);
    }
  });
  it('books one pass at a time and moves to the next route after each', () => {
    const first = startTrain(200, () => .25);
    expect(first).toEqual({ route: 0, departs: 50 });
    expect(trainAt(first, 49)).toBeNull();
    expect(trainAt(first, 50 + 4.5)).toEqual(trainFlight(0, 4.5 / TRAIN_FLIGHT_SECONDS));
    expect(nextTrain(first, 50 + TRAIN_FLIGHT_SECONDS, () => 300)).toBe(first);
    const second = nextTrain(first, 68.5, () => trainGap(() => 0));
    expect(second).toEqual({ route: 1, departs: 68.5 + 180 });
    expect(trainAt(second, 68.5)).toBeNull();
    expect(trainAt(second, 200)).toBeNull();
    expect(trainAt(second, 248.5 + 9)).toEqual(trainFlight(1, .5));
    expect(nextTrain(second, 100, () => 0)).toBe(second);
  });
  it('projects roofs onto the same rendered positions at both depths', () => {
    expect(cityScale('far')).toBeLessThan(cityScale('near'));
    for (const depth of ['near','far'] as const) {
      const roofs = cityRoofs(depth);
      expect(roofs).toHaveLength(CITY_LEDGES.length);
      CITY_LEDGES.forEach((ledge, i) => {
        const left = projectCityPoint({ x: ledge.x0, y: ledge.y }, depth);
        expect(roofs[i].x0).toBeCloseTo(left.x);
        expect(roofs[i].y).toBeCloseTo(left.y);
      });
    }
  });
});
