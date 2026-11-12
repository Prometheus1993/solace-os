import { gridRegions, sharedSpriteBounds, spriteBounds, type SpriteRect } from './sprite-atlas.ts';
import { deskAsset } from './desk-assets.ts';

export type StorySprite = { image: HTMLImageElement; frames: SpriteRect[]; columns: number; anchors: number[] };
export type StoryArt = { train: StorySprite | null; trainRear: StorySprite | null; buildings: StorySprite | null; billboards: StorySprite | null; life: StorySprite | null; missing: boolean };
function loadSprite(name: string, columns: number, rows: number, sharedRows = true): Promise<StorySprite> {
  return new Promise((resolve, reject) => {
    const src = deskAsset(name);
    if (!src) { reject(new Error('City sprite unavailable')); return; }
    const image = new Image();
    image.onerror = () => reject(new Error('City sprite failed to load'));
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        // Billboard mounting hardware makes its columns intentionally uneven.
        const edges = [0,.20,.505,.735,1];
        const regions = name === 'desk-japanese-billboards-atlas' ? Array.from({ length: 8 }, (_, i) => {
          const column = i % 4, y = Math.floor(Math.floor(i / 4) * image.height / 2);
          const x = Math.floor(edges[column] * image.width), right = Math.floor(edges[column + 1] * image.width);
          return { x, y, width: right - x, height: Math.floor((Math.floor(i / 4) + 1) * image.height / 2) - y };
        }) : gridRegions(image.width, image.height, columns, rows);
        const bounds = regions.map(region => spriteBounds(pixels, image.width, region));
        const common = Array.from({ length: rows }, (_, row) => sharedSpriteBounds(bounds.slice(row * columns, (row + 1) * columns)));
        const anchors = common.map((rect, row) => (regions[row * columns].width / 2 - rect.x) / rect.width);
        const frames = regions.map((region, i) => {
          const b = sharedRows ? common[Math.floor(i / columns)] : bounds[i];
          return { x: region.x + b.x, y: region.y + b.y, width: Math.min(b.width, region.width - b.x), height: Math.min(b.height, region.height - b.y) };
        });
        resolve({ image, frames, columns, anchors });
      } catch (error) { reject(error); }
    };
    image.src = src;
  });
}
let pending: Promise<StoryArt> | undefined;
export function loadStoryArt(): Promise<StoryArt> {
  pending ??= Promise.allSettled([loadSprite('desk-flying-train', 1, 1), loadSprite('desk-flying-train-rear', 1, 1), loadSprite('desk-city-buildings-atlas', 4, 2, false), loadSprite('desk-japanese-billboards-atlas', 4, 2, false), loadSprite('desk-city-life-atlas', 6, 4)]).then(results => ({
    train: results[0].status === 'fulfilled' ? results[0].value : null,
    trainRear: results[1].status === 'fulfilled' ? results[1].value : null,
    buildings: results[2].status === 'fulfilled' ? results[2].value : null,
    billboards: results[3].status === 'fulfilled' ? results[3].value : null,
    life: results[4].status === 'fulfilled' ? results[4].value : null,
    missing: results.some(result => result.status === 'rejected'),
  }));
  return pending;
}
