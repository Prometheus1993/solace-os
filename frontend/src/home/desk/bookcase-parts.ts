// Numbers from the bookcase art's parts.json (canvas 2800x1800, pixels, origin top-left, layers pixel-aligned). Nothing else about the art lives here.
export const CANVAS = { w: 2800, h: 1800 } as const;

/** Per shelf: where covers may stand (`coverArea`), the top of the front lip that hides their bottoms, and the shelf top surface. */
export const SHELVES = [
  { coverArea: { x: 260, y: 394, w: 2282, h: 366 }, lipTopY: 751, shelfTopSurfaceY: 760, capacity: 8 },
  { coverArea: { x: 260, y: 805, w: 2282, h: 367 }, lipTopY: 1163, shelfTopSurfaceY: 1172, capacity: 8 },
  { coverArea: { x: 260, y: 1217, w: 2282, h: 393 }, lipTopY: 1601, shelfTopSurfaceY: 1610, capacity: 8 },
] as const;
export const LIP_HEIGHT = 30;

/** The dark plate for the code-drawn title, channel buttons and search. */
export const HEADER = { x: 277, y: 156, w: 2238, h: 123 } as const;
export const ARROWS = { left: { x: 93, y: 923, w: 72, h: 72 }, right: { x: 2626, y: 923, w: 72, h: 72 } } as const;
