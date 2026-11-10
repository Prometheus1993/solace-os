export type SpriteRect = { x: number; y: number; width: number; height: number };

export function gridRegions(width: number, height: number, columns: number, rows: number, topInsets: Partial<Record<number, number>> = {}): SpriteRect[] {
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const x = Math.floor(column * width / columns), y = Math.floor(row * height / rows);
    const cellHeight = Math.floor((row + 1) * height / rows) - y;
    const inset = Math.max(0, Math.min(cellHeight - 1, Math.floor(topInsets[index] ?? 0)));
    return { x, y: y + inset, width: Math.floor((column + 1) * width / columns) - x, height: cellHeight - inset };
  });
}

/** Alpha bounds are confined to the source region: adjacent atlas cells never bleed. */
export function spriteBounds(pixels: Uint8ClampedArray, imageWidth: number, region: SpriteRect): SpriteRect {
  let left = region.width, top = region.height, right = -1, bottom = -1;
  for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
    if (pixels[((region.y + y) * imageWidth + region.x + x) * 4 + 3] < 48) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error('Empty sprite cell');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** State frames share one crop/scale so a glow change does not resize the prop. */
export function sharedSpriteBounds(bounds: SpriteRect[]): SpriteRect {
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y));
  return { x, y, width: Math.max(...bounds.map(b => b.x + b.width)) - x, height: Math.max(...bounds.map(b => b.y + b.height)) - y };
}

export function puckFrame(syncing: boolean, highlighted: boolean, phase: number): number {
  return syncing ? 2 + Math.abs(phase % 2) : highlighted ? 1 : 0;
}
