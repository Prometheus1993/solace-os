import { describe, expect, it } from 'vitest';
import { DESK_OBJECTS } from './desk-layout-state.ts';
import { DESK_STYLES, deskSpriteSpec } from './desk-sprite-catalog.ts';

describe('desk sprite inventory', () => {
  it('provides a valid atlas cell for every object in every style', () => {
    for (const style of DESK_STYLES) for (const [id] of DESK_OBJECTS) {
      const spec = deskSpriteSpec(id, style.id);
      expect(spec.asset).toBeTruthy();
      expect(Number.isInteger(spec.frame ?? 0)).toBe(true);
      expect(spec.frame ?? 0).toBeGreaterThanOrEqual(0);
      expect(spec.frame ?? 0).toBeLessThan((spec.columns ?? 1) * (spec.rows ?? 1));
    }
  });
  it.each(['cozy', 'neon'] as const)('preserves awake/sleep, open/closed and sync states in %s', style => {
    expect(deskSpriteSpec('monitor', style, 0).frame).toBe(17);
    expect(deskSpriteSpec('monitor', style, 1).frame).toBe(16);
    expect(deskSpriteSpec('books', style, 0).frame).toBe(14);
    expect(deskSpriteSpec('books', style, 1).frame).toBe(15);
    expect([0, 1, 2, 3].map(state => deskSpriteSpec('puck', style, state).frame)).toEqual([20, 21, 20, 21]);
    expect(deskSpriteSpec('speaker-0', style)).toEqual(deskSpriteSpec('speaker-1', style));
  });
  it('retains original uneven keyboard/mouse sampling and original state atlases', () => {
    expect(deskSpriteSpec('keyboard')).toMatchObject({ split: .63, independent: true, frame: 0 });
    expect(deskSpriteSpec('mouse')).toMatchObject({ split: .63, independent: true, frame: 1 });
    expect(deskSpriteSpec('monitor', 'original', 0)).toEqual({ asset: 'desk-monitor-atlas', columns: 2, frame: 0 });
    expect(deskSpriteSpec('puck', 'original', 3)).toMatchObject({ columns: 2, rows: 2, frame: 3 });
  });
  it('keeps structural artwork valid across all style presets', () => {
    for (const style of DESK_STYLES) {
      expect(deskSpriteSpec('surface', style.id)).toEqual({ asset: 'desk-surface' });
      expect(deskSpriteSpec('window', style.id)).toEqual({ asset: 'desk-window-frame' });
    }
  });
  it('keeps the floor pet idle and petted states in the selected theme', () => {
    DESK_STYLES.forEach((style, index) => {
      expect(deskSpriteSpec('companion', style.id, 0)).toEqual({ asset: 'desk-floor-companion-spaced-atlas', columns: 3, rows: 2, frame: index });
      expect(deskSpriteSpec('companion', style.id, 1).frame).toBe(index + 3);
    });
  });
});
