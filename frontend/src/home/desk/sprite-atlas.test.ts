import { describe, expect, it } from 'vitest';
import { gridRegions, puckFrame, sharedSpriteBounds, spriteBounds } from './sprite-atlas.ts';

describe('desk sprite sampling', () => {
  it('partitions odd-sized sheets without gaps or overlap', () => {
    expect(gridRegions(7, 5, 2, 2)).toEqual([
      { x: 0, y: 0, width: 3, height: 2 }, { x: 3, y: 0, width: 4, height: 2 },
      { x: 0, y: 2, width: 3, height: 3 }, { x: 3, y: 2, width: 4, height: 3 },
    ]);
  });
  it('does not pick up a neighbouring sprite and rejects empty cells', () => {
    const pixels = new Uint8ClampedArray(8 * 4 * 4);
    pixels[(1 * 8 + 1) * 4 + 3] = 255;
    pixels[(2 * 8 + 2) * 4 + 3] = 255;
    pixels[(0 * 8 + 7) * 4 + 3] = 255;
    expect(spriteBounds(pixels, 8, { x: 0, y: 0, width: 4, height: 4 })).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(() => spriteBounds(pixels, 8, { x: 4, y: 1, width: 4, height: 3 })).toThrow('Empty sprite cell');
  });
  it('excludes an authored top gutter without changing other atlas cells', () => {
    const regular = gridRegions(1024, 1536, 4, 6);
    const trimmed = gridRegions(1024, 1536, 4, 6, { 15: 24 });
    expect(trimmed[15]).toEqual({ x: 768, y: 792, width: 256, height: 232 });
    expect(trimmed.filter((_, i) => i !== 15)).toEqual(regular.filter((_, i) => i !== 15));
    expect(gridRegions(8, 8, 2, 2, { 0: 999 })[0]).toEqual({ x: 0, y: 3, width: 4, height: 1 });
  });
  it('keeps the same crop across differently lit state frames', () => {
    expect(sharedSpriteBounds([{ x: 3, y: 4, width: 8, height: 6 }, { x: 1, y: 2, width: 12, height: 8 }])).toEqual({ x: 1, y: 2, width: 12, height: 8 });
  });
  it('shows sync frames only for an actual sync and keeps reduced-motion phase stable', () => {
    expect(puckFrame(false, false, 99)).toBe(0);
    expect(puckFrame(false, true, 99)).toBe(1);
    expect(puckFrame(true, false, 0)).toBe(2);
    expect(puckFrame(true, true, 1)).toBe(3);
    expect(puckFrame(true, false, 2)).toBe(2);
  });
});
