// One logical composition shared by laptop, external monitor and small screens.
export const DESK_CANVAS = { width: 1600, height: 1000 } as const;
export function fitDeskCanvas(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { scale: 0, width: 0, height: 0 };
  const scale = Math.min(width / DESK_CANVAS.width, height / DESK_CANVAS.height);
  return { scale, width: DESK_CANVAS.width * scale, height: DESK_CANVAS.height * scale };
}

type Rect = { left: number; top: number; width: number; height: number };
/** Browser rectangles are scaled screen pixels; selection handles use logical canvas pixels. */
export function logicalSelectionBox(parent: Rect, object: Rect, logicalWidth: number, logicalHeight: number): Rect {
  const x = logicalWidth / Math.max(parent.width, 1), y = logicalHeight / Math.max(parent.height, 1);
  return { left: (object.left - parent.left) * x, top: (object.top - parent.top) * y, width: object.width * x, height: object.height * y };
}
