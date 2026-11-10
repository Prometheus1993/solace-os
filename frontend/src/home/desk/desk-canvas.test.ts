import { describe, expect, it } from 'vitest';
import { DESK_CANVAS, fitDeskCanvas, logicalSelectionBox } from './desk-canvas.ts';
import { dragAdjustment } from './desk-layout-state.ts';

describe('fixed desk canvas', () => {
  it.each([[1440, 700], [2560, 1250], [3440, 1200], [400, 550], [700, 260]])('fits %sx%s without cropping or distorting the scene', (width, height) => {
    const fit = fitDeskCanvas(width, height);
    expect(fit.width).toBeLessThanOrEqual(width + 1e-8);
    expect(fit.height).toBeLessThanOrEqual(height + 1e-8);
    expect(fit.width / fit.height).toBeCloseTo(DESK_CANVAS.width / DESK_CANVAS.height);
    expect(Math.min(width - fit.width, height - fit.height)).toBeCloseTo(0);
  });
  it('preserves object coordinates and proportions between laptop and large monitor', () => {
    const laptop = fitDeskCanvas(1440, 700), monitor = fitDeskCanvas(2560, 1250);
    const object = { x: .42, y: .67, width: .22 };
    for (const fit of [laptop, monitor]) {
      expect(object.x * fit.width / fit.scale).toBeCloseTo(object.x * DESK_CANVAS.width);
      expect(object.y * fit.height / fit.scale).toBeCloseTo(object.y * DESK_CANVAS.height);
      expect(object.width * fit.width / fit.scale).toBeCloseTo(object.width * DESK_CANVAS.width);
    }
  });
  it('converts offset, scaled selection rectangles back to logical coordinates', () => {
    expect(logicalSelectionBox({ left: 250, top: 100, width: 800, height: 500 }, { left: 450, top: 300, width: 160, height: 100 }, 1600, 1000)).toEqual({ left: 400, top: 400, width: 320, height: 200 });
    expect(logicalSelectionBox({ left: 0, top: 0, width: 3200, height: 2000 }, { left: 800, top: 800, width: 640, height: 400 }, 1600, 1000)).toEqual({ left: 400, top: 400, width: 320, height: 200 });
  });
  it('keeps drag distance aligned with the pointer after uniform scaling', () => {
    const fit = fitDeskCanvas(800, 500);
    const moved = dragAdjustment({ x: 0, y: 0, scale: 1 }, 80, 50, fit.width, fit.height);
    expect(moved.x / 100 * DESK_CANVAS.width * fit.scale).toBeCloseTo(80);
    expect(moved.y / 100 * DESK_CANVAS.height * fit.scale).toBeCloseTo(50);
  });
  it('waits safely for a measurable viewport', () => {
    for (const [width, height] of [[0, 500], [500, 0], [-1, 500], [Infinity, 500], [500, NaN]]) expect(fitDeskCanvas(width, height)).toEqual({ scale: 0, width: 0, height: 0 });
  });
});
