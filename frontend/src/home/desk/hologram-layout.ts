import type { StatKey } from './hologram-state.ts';

// The showcase stage ("world") in art pixels. The hologram art is a 1000x1600 canvas; the numbers
// come from the art's parts.json (anchors, feet baseline), nothing else about the art is stored here.
// The world is wider than the figure so the callout labels sit in its margins.
export const WORLD = { w: 1760, h: 1700 } as const;
export const FIGURE = { x: 380, y: 50, w: 1000, h: 1600 } as const;
const FEET_BASELINE_Y = 1560;
const FEET_CENTER_X = 519;

export type Box = { x: number; y: number; w: number; h: number };

/** A soft floor ellipse under the feet, so the figure does not float. */
export const FLOOR: Box = { x: FIGURE.x + FEET_CENTER_X - 380, y: FIGURE.y + FEET_BASELINE_Y - 55, w: 760, h: 110 };

/** Where a callout line ends on the figure (parts.json anchors; the silhouette point is a pixel on its outline), in figure pixels. */
const ANCHORS: Record<StatKey, { x: number; y: number }> = {
  stamina: { x: 540, y: 941 },
  strength: { x: 739, y: 645 },
  leanness: { x: 260, y: 400 },
};

/** The callouts: the label's world position and the world position its line points at. */
export const CALLOUTS: ReadonlyArray<{ stat: StatKey; side: 'left' | 'right'; label: { x: number; y: number }; target: { x: number; y: number } }> = [
  { stat: 'leanness', side: 'left', label: { x: 340, y: 450 }, target: { x: FIGURE.x + ANCHORS.leanness.x, y: FIGURE.y + ANCHORS.leanness.y } },
  { stat: 'strength', side: 'right', label: { x: 1420, y: 570 }, target: { x: FIGURE.x + ANCHORS.strength.x, y: FIGURE.y + ANCHORS.strength.y } },
  { stat: 'stamina', side: 'right', label: { x: 1420, y: 1200 }, target: { x: FIGURE.x + ANCHORS.stamina.x, y: FIGURE.y + ANCHORS.stamina.y } },
];

/** A world box as percentages of the stage, for `left/top/width/height`. */
export const boxPercent = (box: Box): { x: number; y: number; w: number; h: number } => ({
  x: box.x / WORLD.w * 100, y: box.y / WORLD.h * 100, w: box.w / WORLD.w * 100, h: box.h / WORLD.h * 100,
});
