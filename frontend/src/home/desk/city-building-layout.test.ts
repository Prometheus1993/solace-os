import { describe, expect, it } from 'vitest';
import { CITY_BUILDINGS } from './city-building-layout.ts';

describe('dense city placement', () => {
  it('provides smaller buildings at three different depths', () => {
    const far = CITY_BUILDINGS.filter(item => item.layer === 'far'), mid = CITY_BUILDINGS.filter(item => item.layer === 'mid'), front = CITY_BUILDINGS.filter(item => item.layer === 'front');
    const averageWidth = (layer: typeof CITY_BUILDINGS) => layer.reduce((sum, item) => sum + item.width, 0) / layer.length;
    expect(front.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(mid.length);
    expect(mid.length).toBeGreaterThan(front.length);
    expect(averageWidth(far)).toBeLessThan(averageWidth(mid));
    expect(averageWidth(mid)).toBeLessThan(averageWidth(front));
    for (const building of CITY_BUILDINGS) {
      expect(building.width).toBeGreaterThan(0);
      expect(building.width).toBeLessThan(building.layer === 'front' ? .12 : .075);
      expect(building.frame).toBeGreaterThanOrEqual(0);
      expect(building.frame).toBeLessThan(8);
      if (building.ad !== undefined) expect(building.ad >= 0 && building.ad < 8).toBe(true);
    }
  });
  it('anchors the foreground below the opening and leaves gaps between interior silhouettes', () => {
    const front = CITY_BUILDINGS.filter(item => item.layer === 'front');
    expect(front.every(item => item.base >= 1)).toBe(true);
    expect(front.some(item => item.x - item.width / 2 <= 0)).toBe(true);
    expect(front.some(item => item.x + item.width / 2 >= 1)).toBe(true);
    const interior = front.filter(item => item.x > .3 && item.x < .7).sort((a,b) => a.x - b.x);
    expect(interior.length).toBeGreaterThan(0);
    expect(interior.reduce((sum,item) => sum + item.width,0)).toBeLessThan(.15);
    for (let i = 1; i < interior.length; i++) expect(interior[i].x - interior[i].width / 2 - interior[i-1].x - interior[i-1].width / 2).toBeGreaterThan(.1);
  });
});
