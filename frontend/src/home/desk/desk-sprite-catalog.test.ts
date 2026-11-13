import { describe, expect, it } from 'vitest';
import { DESK_OBJECTS } from './desk-layout-state.ts';
import { deskSpriteSpec } from './desk-sprite-catalog.ts';

describe('desk sprite inventory', () => {
  it('provides a valid atlas cell for every object', () => {
    for (const [id] of DESK_OBJECTS) {
      const spec = deskSpriteSpec(id);
      expect(spec.asset).toBeTruthy();
      expect(Number.isInteger(spec.frame ?? 0)).toBe(true);
      expect(spec.frame ?? 0).toBeGreaterThanOrEqual(0);
      expect(spec.frame ?? 0).toBeLessThan((spec.columns ?? 1) * (spec.rows ?? 1));
    }
  });
  it('retains original uneven keyboard/mouse sampling and original state atlases', () => {
    expect(deskSpriteSpec('keyboard')).toMatchObject({ split: .63, independent: true, frame: 0 });
    expect(deskSpriteSpec('mouse')).toMatchObject({ split: .63, independent: true, frame: 1 });
    expect(deskSpriteSpec('monitor', 0)).toEqual({ asset: 'desk-monitor-atlas', columns: 2, frame: 0 });
    expect(deskSpriteSpec('lamp')).toEqual({ asset: 'desk-lamp-atlas', columns: 2, frame: 0 });
    expect(deskSpriteSpec('lamp', 1)).toEqual({ asset: 'desk-lamp-atlas', columns: 2, frame: 1 });
  });
  it('draws both speakers from the 4-frame play atlas, whole cells, frame 0 idle', () => {
    for (const id of ['speaker-0', 'speaker-1'] as const) {
      expect(deskSpriteSpec(id)).toEqual({ asset: 'desk-speaker-play-atlas', columns: 4, rows: 1, whole: true, frame: 0 });
      expect(deskSpriteSpec(id, 3).frame).toBe(3);
    }
  });
  it('draws the empty cushion where the floor companion was', () => {
    expect(deskSpriteSpec('companion')).toEqual({ asset: 'desk-cat-cushion' });
  });
});
