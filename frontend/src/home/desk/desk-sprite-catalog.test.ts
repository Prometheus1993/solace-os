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
    expect(deskSpriteSpec('puck', 3)).toMatchObject({ columns: 2, rows: 2, frame: 3 });
  });
  it('draws the empty cushion where the floor companion was', () => {
    expect(deskSpriteSpec('companion')).toEqual({ asset: 'desk-cat-cushion' });
  });
});
