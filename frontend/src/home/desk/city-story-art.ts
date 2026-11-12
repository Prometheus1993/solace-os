import { spriteBounds, type SpriteRect } from './sprite-atlas.ts';
import { deskAsset } from './desk-assets.ts';

export type StorySprite = { image: HTMLImageElement; frames: SpriteRect[] };
export type StoryArt = { train: StorySprite | null; trainRear: StorySprite | null; missing: boolean };
function loadSprite(name: string): Promise<StorySprite> {
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
        resolve({ image, frames: [spriteBounds(pixels, image.width, { x: 0, y: 0, width: image.width, height: image.height })] });
      } catch (error) { reject(error); }
    };
    image.src = src;
  });
}
let pending: Promise<StoryArt> | undefined;
export function loadStoryArt(): Promise<StoryArt> {
  pending ??= Promise.allSettled([loadSprite('desk-flying-train'), loadSprite('desk-flying-train-rear')]).then(results => ({
    train: results[0].status === 'fulfilled' ? results[0].value : null,
    trainRear: results[1].status === 'fulfilled' ? results[1].value : null,
    missing: results.some(result => result.status === 'rejected'),
  }));
  return pending;
}
