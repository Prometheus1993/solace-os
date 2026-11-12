import { useEffect, useRef, useState } from 'react';
import { gridRegions, sharedSpriteBounds, spriteBounds, type SpriteRect } from './sprite-atlas.ts';

export type Sheet = { image: HTMLImageElement; frames: SpriteRect[] };
const sheets = new Map<string, Promise<Sheet>>();

/** Without `independent`, every cell of the sheet shares one crop: the union of all its frames. `whole`: no crop at all, each frame is its full grid cell. */
export function loadSheet(
  src: string,
  columns: number,
  rows: number,
  independent: boolean,
  split?: number,
  whole?: boolean
): Promise<Sheet> {
  const key = `${src}/${columns}/${rows}/${independent}/${split}/${whole}`;
  const cached = sheets.get(key);
  if (cached) return cached;
  const promise = new Promise<Sheet>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Sprite image unavailable'));
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Sprite canvas unavailable');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        // Keyboard/mouse is an intentionally measured uneven atlas, not a regular grid.
        const divide = Math.floor(image.width * (split ?? .5));
        const regions = split == null ? gridRegions(image.width, image.height, columns, rows) : [
          { x: 0, y: 0, width: divide, height: image.height },
          { x: divide, y: 0, width: image.width - divide, height: image.height },
        ];
        if (whole) { resolve({ image, frames: regions }); return; }
        const bounds = regions.map(region => spriteBounds(pixels, image.width, region));
        const common = independent ? null : sharedSpriteBounds(bounds);
        const frames = regions.map((region, index) => {
          const b = common ?? bounds[index];
          return { x: region.x + b.x, y: region.y + b.y, width: Math.min(b.width, region.width - b.x), height: Math.min(b.height, region.height - b.y) };
        });
        resolve({ image, frames });
      } catch (error) { reject(error); }
    };
    image.src = src;
  });
  sheets.set(key, promise);
  return promise;
}

/** Runtime atlas sampling only: source PNGs remain unchanged. No per-frame pixel scan. */
export function DeskSprite({ src, columns = 1, rows = 1, frame = 0, independent = false, split, whole = false, lit = false, name, onError }: {
  src: string | undefined;
  columns?: number;
  rows?: number;
  frame?: number;
  independent?: boolean;
  split?: number;
  whole?: boolean;
  /** Adds a silhouette-clipped light overlay (`desk-sky.css`) whose mask is the sprite's own current frame. */
  lit?: boolean;
  name: string;
  onError?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), light = useRef<HTMLSpanElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [failed, setFailed] = useState(false);
  const errorHandler = useRef(onError); errorHandler.current = onError;
  useEffect(() => {
    let cancelled = false;
    setSheet(null); setFailed(false);
    if (!src) { setFailed(true); errorHandler.current?.(); return; }
    void loadSheet(src, columns, rows, independent, split, whole).then(value => { if (!cancelled) setSheet(value); }).catch(() => {
      if (!cancelled) { setFailed(true); errorHandler.current?.(); }
    });
    return () => { cancelled = true; };
  }, [src, columns, rows, independent, split, whole]);
  useEffect(() => {
    const element = canvas.current, rect = sheet?.frames[frame];
    if (!element || !sheet || !rect) return;
    element.width = rect.width; element.height = rect.height;
    const context = element.getContext('2d'); if (!context) { setFailed(true); errorHandler.current?.(); return; }
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, rect.width, rect.height);
    context.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    if (lit) light.current?.style.setProperty('--lit-mask', `url(${element.toDataURL()})`);
  }, [sheet, frame, lit]);
  return <>
    <span className="desk-sprite" data-sprite={name} data-frame={frame} data-ready={!!sheet && !failed} aria-hidden="true">
      <canvas ref={canvas} />{failed && <span className="desk-sprite-missing">{name}</span>}
    </span>
    {lit && <span ref={light} className="desk-lit" aria-hidden="true"><i className="desk-lit-warm" /><i className="desk-lit-cool" /></span>}
  </>;
}
