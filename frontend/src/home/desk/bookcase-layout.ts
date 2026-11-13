import { CANVAS, SHELVES } from './bookcase-parts.ts';

export type Box = { x: number; y: number; w: number; h: number };

/** Cover size in art pixels (2:3). Eight across a 2282 px shelf leave a 70 px gap. */
export const COVER = { w: 224, h: 336 } as const;
/** A cover stands this far below the lip's top edge, so the front layer hides its bottom. */
const LIP_OVERLAP = 6;

/** The art-pixel box of slot `slot` (left to right) on shelf `shelf` (top to bottom, 0-based). */
export function coverBox(shelf: number, slot: number): Box {
  const { coverArea, lipTopY, capacity } = SHELVES[shelf]!;
  const gap = (coverArea.w - capacity * COVER.w) / (capacity - 1);
  return { x: coverArea.x + slot * (COVER.w + gap), y: lipTopY + LIP_OVERLAP - COVER.h, ...COVER };
}

/** An art-pixel box as percentages of the canvas, so everything scales with the art. */
export const boxPercent = (box: Box): Box => ({
  x: box.x / CANVAS.w * 100, y: box.y / CANVAS.h * 100, w: box.w / CANVAS.w * 100, h: box.h / CANVAS.h * 100,
});
