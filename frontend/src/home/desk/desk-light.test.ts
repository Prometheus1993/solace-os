import { describe, expect, it } from 'vitest';
import { catLight, catTint, falloff, isReceiver, lightLevels, poolVars, receiverVars, sourceEnvelope, tintKey, trainGlint } from './desk-light.ts';
import { adjustProp, type DeskLayout } from './desk-layout-state.ts';

const none: DeskLayout = {};
describe('source envelopes', () => {
  it('sit on the default lamp bulb and the monitor screen', () => {
    const lamp = sourceEnvelope('lamp', none), monitor = sourceEnvelope('monitor', none);
    expect(lamp.x).toBeCloseTo(171, -1); expect(lamp.y).toBeCloseTo(737, -1);
    expect(monitor.x).toBeCloseTo(1056, 0); expect(monitor.y).toBeCloseTo(769, -1);
  });
  it('move with the prop and grow with its scale', () => {
    const moved = sourceEnvelope('lamp', adjustProp(none, 'lamp', { x: 10, y: -5 }));
    const base = sourceEnvelope('lamp', none);
    expect(moved.x - base.x).toBeCloseTo(160, 5); expect(moved.y - base.y).toBeCloseTo(-50, 5);
    const bigger = sourceEnvelope('monitor', adjustProp(none, 'monitor', { scale: 1.5 }));
    expect(bigger.rx / sourceEnvelope('monitor', none).rx).toBeCloseTo(1.5, 5);
  });
  it('falls from 1 at the centre to 0 at and beyond the edge', () => {
    const e = { x: 100, y: 100, rx: 50, ry: 20 };
    expect(falloff(e, 100, 100)).toBe(1);
    expect(falloff(e, 150, 100)).toBe(0);
    expect(falloff(e, 500, 500)).toBe(0);
    expect(falloff(e, 125, 100)).toBeCloseTo(.5, 5);
    expect(falloff(e, 100, 110)).toBeCloseTo(.5, 5);
  });
});
describe('light levels', () => {
  it('follow the phase: lamp off until dusk, screen brightest at night', () => {
    expect(lightLevels('dawn', none, true).lamp).toBe(0);
    expect(lightLevels('day', none, true).lamp).toBe(0);
    expect(lightLevels('dusk', none, true).lamp).toBeGreaterThan(0);
    expect(lightLevels('night', none, true).lamp).toBe(1);
    expect(lightLevels('day', none, true).screen).toBeLessThan(lightLevels('night', none, true).screen);
  });
  it('are zero for a hidden lamp, a hidden monitor and a sleeping monitor', () => {
    expect(lightLevels('night', adjustProp(none, 'lamp', { hidden: true }), true)).toEqual({ lamp: 0, screen: .8 });
    expect(lightLevels('night', adjustProp(none, 'monitor', { hidden: true }), true)).toEqual({ lamp: 1, screen: 0 });
    expect(lightLevels('night', none, false)).toEqual({ lamp: 1, screen: 0 });
  });
});
describe('receivers', () => {
  it('are the four lit props only', () => {
    expect(['books', 'notebook', 'keyboard', 'mouse'].every(id => isReceiver(id as never))).toBe(true);
    expect(['plant', 'mug', 'radio', 'lamp', 'monitor', 'companion'].some(id => isReceiver(id as never))).toBe(false);
  });
  it('put the source in the same place of the receiver wherever the receiver is, and move with the source', () => {
    const a = receiverVars('keyboard', none);
    // moving the keyboard 5% right shifts the monitor's centre 5% of the scene to the left of it, in keyboard widths
    const b = receiverVars('keyboard', adjustProp(none, 'keyboard', { x: 5 }));
    expect(parseFloat(a['--lit-cool-x']) - parseFloat(b['--lit-cool-x'])).toBeCloseTo(80 / (.17 * 1600) * 100, 1);
    const c = receiverVars('keyboard', adjustProp(none, 'monitor', { x: 5 }));
    expect(parseFloat(c['--lit-cool-x']) - parseFloat(a['--lit-cool-x'])).toBeCloseTo(80 / (.17 * 1600) * 100, 1);
    expect(parseFloat(a['--lit-cool-x'])).toBeCloseTo(50 + (1056 - (.575 + .085) * 1600) / (.17 * 1600) * 100, 0);
  });
});
describe('tabletop pools', () => {
  it('sit under the source on the table, and never above the table edge', () => {
    const vars = poolVars(none);
    expect(parseFloat(vars['--pool-warm-x'])).toBeCloseTo(9, 0);
    expect(parseFloat(vars['--pool-cool-y'])).toBeGreaterThanOrEqual(88.1);
    expect(parseFloat(poolVars(adjustProp(none, 'lamp', { y: -50 }))['--pool-warm-y'])).toBeCloseTo(88.1, 5);
    expect(parseFloat(poolVars(adjustProp(none, 'lamp', { y: 50 }))['--pool-warm-y'])).toBeCloseTo(95, 5);
  });
});
describe('cat tint', () => {
  const night = catLight(none, lightLevels('night', none, true));
  it('is amber beside the lamp, cyan beside the monitor, nothing far from both', () => {
    const lamp = catTint(night, { x: 171 / 1600, y: .74 }), screen = catTint(night, { x: 1056 / 1600, y: .77 });
    expect(lamp.r).toBeGreaterThan(lamp.b); expect(lamp.a).toBeGreaterThan(.2);
    expect(screen.b).toBeGreaterThan(screen.r); expect(screen.a).toBeGreaterThan(.1);
    expect(catTint(night, { x: .5, y: .2 }).a).toBe(0);
  });
  it('blends along the route and follows a moved source', () => {
    const left = catTint(night, { x: .3, y: .8 }), right = catTint(night, { x: .55, y: .8 });
    expect(right.b - right.r).toBeGreaterThan(left.b - left.r);
    const moved = catLight(adjustProp(none, 'lamp', { x: 10 }), lightLevels('night', none, true));
    expect(catTint(moved, { x: .3, y: .8 }).a).toBeGreaterThan(left.a);
  });
  it('vanishes with its source: hidden lamp or sleeping monitor', () => {
    const noLamp = catLight(none, lightLevels('night', adjustProp(none, 'lamp', { hidden: true }), true));
    expect(catTint(noLamp, { x: 171 / 1600, y: .74 }).a).toBe(0);
    const asleep = catLight(none, lightLevels('night', none, false));
    expect(catTint(asleep, { x: 1056 / 1600, y: .77 }).a).toBe(0);
  });
  it('keys a tint by coarse steps', () => {
    expect(tintKey({ r: 0, g: 0, b: 0, a: 0 })).toBe('0');
    const t = catTint(night, { x: 171 / 1600, y: .74 });
    expect(tintKey(t)).toBe(tintKey({ ...t, a: t.a - .001 }));
  });
});
describe('train glint', () => {
  it('is off without a train, fades at both ends and is strongest mid-window', () => {
    expect(trainGlint(null).strength).toBe(0);
    expect(trainGlint({ x: -.35, alpha: 1 }).strength).toBe(0);
    expect(trainGlint({ x: 1.35, alpha: 1 }).strength).toBe(0);
    const mid = trainGlint({ x: .5, alpha: 1 });
    expect(mid.strength).toBeCloseTo(.16, 5);
    expect(mid.position).toBeCloseTo(50, 5);
    expect(trainGlint({ x: .5, alpha: .5 }).strength).toBeCloseTo(.08, 5);
    expect(trainGlint({ x: .8, alpha: 1 }).position).toBeGreaterThan(mid.position);
  });
});
