import { describe, expect, it } from 'vitest';
import { chaseRoofs, chaseScale, CITY_LEDGES, projectChasePoint, trainAt, trainFlight } from './city-story-motion.ts';

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
    expect(trainAt(30)).toBeNull();
    expect(trainAt(45 + 5)).toEqual(trainFlight(1,4.5 / 18));
  });
  it('projects roofs onto the same rendered positions at both depths', () => {
    expect(chaseScale('far')).toBeLessThan(chaseScale('near'));
    for (const depth of ['near','far'] as const) {
      const roofs = chaseRoofs(depth);
      expect(roofs).toHaveLength(CITY_LEDGES.length);
      CITY_LEDGES.forEach((ledge, i) => {
        const left = projectChasePoint({ x: ledge.x0, y: ledge.y }, depth);
        expect(roofs[i].x0).toBeCloseTo(left.x);
        expect(roofs[i].y).toBeCloseTo(left.y);
      });
    }
  });
});
