import { describe, expect, it } from 'vitest';
import { adjustProp, decodeDeskLayout, DEFAULT_ADJUSTMENT, DESK_OBJECTS, dragAdjustment, encodeDeskLayout, resetProp, resizeAdjustment } from './desk-layout-state.ts';

describe('desk layout adjustments', () => {
  it('round trips independent prop adjustments without changing the default', () => {
    const layout = adjustProp(adjustProp({}, 'monitor', { x: 4.5, y: -3, scale: 1.25 }), 'radio', { x: -10, scale: .7 });
    expect(decodeDeskLayout(encodeDeskLayout(layout))).toEqual(layout);
    expect(layout.monitor).toEqual({ x: 4.5, y: -3, scale: 1.25 });
    expect(layout.radio).toEqual({ x: -10, y: 0, scale: .7 });
    expect(DEFAULT_ADJUSTMENT).toEqual({ x: 0, y: 0, scale: 1 });
    expect(decodeDeskLayout(null)).toEqual({});
  });
  it('resets one prop without removing other adjustments or mutating saved values', () => {
    const original = adjustProp(adjustProp({}, 'radio', { scale: .8 }), 'monitor', { x: 10 });
    const reset = resetProp(original, 'radio');
    expect(reset.radio).toBeUndefined();
    expect(reset.monitor).toEqual(original.monitor);
    expect(original.radio?.scale).toBe(.8);
    expect(resetProp({}, 'monitor')).toEqual({});
  });
  it('constrains extreme input and ignores nonfinite edits', () => {
    const layout = adjustProp({}, 'lamp', { x: 999, y: -999, scale: 10 });
    expect(layout.lamp).toEqual({ x: 100, y: -100, scale: 2 });
    expect(adjustProp(layout, 'lamp', { x: NaN, y: Infinity, scale: -1 }).lamp).toEqual({ x: 100, y: -100, scale: .35 });
  });
  it('rejects malformed or incompatible saved data', () => {
    for (const raw of ['{', 'null', '[]', '{}', '{"version":2,"props":{}}', '{"version":1,"props":[]}']) expect(() => decodeDeskLayout(raw)).toThrow();
  });
  it('ignores unknown props and invalid records, clamping known finite values', () => {
    expect(decodeDeskLayout(JSON.stringify({ version: 1, props: { unknown: { x: 5, y: 0, scale: 1 }, headphones: { x: 1, y: 2, scale: 1 }, radio: { x: '4', y: 0, scale: 1 }, monitor: { x: 500, y: 0, scale: 0 } } }))).toEqual({ monitor: { x: 100, y: 0, scale: .35 } });
    expect(new Set(DESK_OBJECTS.map(([id]) => id)).size).toBe(DESK_OBJECTS.length);
  });
  it('still loads a saved layout that holds the removed biomonitor puck, dropping only that prop', () => {
    const saved = JSON.stringify({ version: 1, props: { puck: { x: 5, y: 5, scale: 1 }, radio: { x: 7, y: 0, scale: 1 } } });
    expect(decodeDeskLayout(saved)).toEqual({ radio: { x: 7, y: 0, scale: 1 } });
  });
  it('uses stage proportions so moves remain stable across screen sizes', () => {
    const start = { x: 3, y: -2, scale: .8 };
    expect(dragAdjustment(start, 100, 50, 1000, 500)).toEqual({ x: 13, y: 8, scale: .8 });
    expect(dragAdjustment(start, 50, 25, 500, 250)).toEqual({ x: 13, y: 8, scale: .8 });
    expect(start).toEqual({ x: 3, y: -2, scale: .8 });
    expect(Number.isFinite(dragAdjustment(start, 5, 5, 0, 0).x)).toBe(true);
  });
  it('resizes proportionally about the base and clamps a crossed anchor', () => {
    const anchor = { x: 100, y: 200 }, start = { x: 150, y: 100 };
    expect(resizeAdjustment(1, start, start, anchor)).toBe(1);
    expect(resizeAdjustment(1, start, { x: 175, y: 50 }, anchor)).toBe(1.5);
    expect(resizeAdjustment(1, start, { x: 125, y: 150 }, anchor)).toBe(.5);
    expect(resizeAdjustment(1, start, { x: 50, y: 300 }, anchor)).toBe(.35);
    expect(resizeAdjustment(1, start, { x: 500, y: -500 }, anchor)).toBe(2);
  });
  it('persists inventory visibility without losing positions', () => {
    const original = adjustProp({}, 'radio', { x: 7, y: -8, scale: .75 });
    const chosen = adjustProp(original, 'radio', { hidden: true });
    expect(chosen.radio).toEqual({ x: 7, y: -8, scale: .75, hidden: true });
    expect(decodeDeskLayout(encodeDeskLayout(chosen))).toEqual(chosen);
    expect(adjustProp(chosen, 'radio', { x: 10 }).radio).toMatchObject({ hidden: true });
    expect(adjustProp(chosen, 'radio', { hidden: false }).radio).toMatchObject({ x: 7, scale: .75, hidden: false });
    expect(resetProp(chosen, 'radio')).toEqual({});
    expect(original.radio).toEqual({ x: 7, y: -8, scale: .75 });
  });
  it('loads old layouts and safely ignores unknown inventory choices', () => {
    expect(decodeDeskLayout('{"version":1,"props":{"lamp":{"x":3,"y":2,"scale":1}}}').lamp).toEqual({ x: 3, y: 2, scale: 1 });
    expect(decodeDeskLayout('{"version":1,"props":{"lamp":{"x":3,"y":2,"scale":1,"sprite":"unknown","hidden":"true"}}}').lamp).toEqual({ x: 3, y: 2, scale: 1 });
  });
  it('loads a saved layout that stores a removed desk style as the original look', () => {
    const saved = '{"version":1,"props":{"mug":{"x":4,"y":1,"scale":1.2,"sprite":"cozy","hidden":true},"lamp":{"x":0,"y":0,"scale":1,"sprite":"neon"}}}';
    const layout = decodeDeskLayout(saved);
    expect(layout.mug).toEqual({ x: 4, y: 1, scale: 1.2, hidden: true });
    expect(layout.lamp).toEqual({ x: 0, y: 0, scale: 1 });
    expect(encodeDeskLayout(layout)).not.toMatch(/cozy|neon|sprite/);
  });
  it('loads a layout saved before the window and the desk became fixed, keeping every prop adjustment', () => {
    const saved = '{"version":1,"props":{"surface":{"x":0,"y":2,"scale":1.3},"window":{"x":-2,"y":0,"scale":1.15,"hidden":true},"lamp":{"x":3,"y":2,"scale":1.1},"companion":{"x":-6,"y":0,"scale":1.2,"hidden":true}}}';
    expect(decodeDeskLayout(saved)).toEqual({ lamp: { x: 3, y: 2, scale: 1.1 }, companion: { x: -6, y: 0, scale: 1.2, hidden: true } });
    expect(DESK_OBJECTS.map(([id]) => id as string)).not.toContain('surface');
    expect(DESK_OBJECTS.map(([id]) => id as string)).not.toContain('window');
  });
  it('keeps existing arrangements when a floor companion is added to the editor', () => {
    const old = decodeDeskLayout('{"version":1,"props":{"monitor":{"x":4,"y":-2,"scale":0.8}}}');
    const next = adjustProp(old, 'companion', { x: -6, scale: 1.2, hidden: true });
    expect(next.monitor).toEqual(old.monitor);
    expect(decodeDeskLayout(encodeDeskLayout(next))).toEqual(next);
    expect(resetProp(next, 'companion').monitor).toEqual(old.monitor);
  });
});
