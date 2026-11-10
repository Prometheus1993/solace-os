import type { StoryArt, StorySprite } from './city-story-art.ts';
import { CITY_BUILDINGS, type CityBuilding } from './city-building-layout.ts';
import { chaseRoofs, chaseScale, type ChaseDepth } from './city-story-motion.ts';

function spriteRect(art: StorySprite, index: number) { return art.frames[index % art.frames.length]; }
function sign(context: CanvasRenderingContext2D, art: StorySprite, frame: number, x: number, y: number, width: number, time: number) {
  const rect = spriteRect(art, frame), height = width * rect.height / rect.width;
  context.save(); context.globalAlpha *= .83 + Math.sin(time * .6 + frame) * .09;
  context.drawImage(art.image, rect.x, rect.y, rect.width, rect.height, x, y, width, height);
  context.restore();
}
export function drawBuildingLayer(context: CanvasRenderingContext2D, art: StoryArt, layer: CityBuilding['layer'], width: number, height: number, time: number) {
  if (!art.buildings) return;
  const sheet = art.buildings;
  context.save(); context.globalAlpha = layer === 'far' ? .43 : layer === 'mid' ? .72 : .98;
  for (const building of CITY_BUILDINGS.filter(item => item.layer === layer)) {
    const rect = spriteRect(sheet, building.frame), w = building.width * width, h = w * rect.height / rect.width;
    const x = building.x * width - w / 2, y = building.base * height - h;
    context.drawImage(sheet.image, rect.x, rect.y, rect.width, rect.height, x, y, w, h);
    if (building.ad !== undefined && art.billboards) sign(context, art.billboards, building.ad, x + w * .6, y + h * .2, w * .52, time);
  }
  context.restore();
}
/** Flat walkable caps line up exactly with the route model; façades continue below them. */
export function drawCityRoofs(context: CanvasRenderingContext2D, art: StoryArt, width: number, height: number, time: number, depth: ChaseDepth) {
  context.save();
  const scale = chaseScale(depth);
  for (const [index, ledge] of chaseRoofs(depth).entries()) {
    const start = Math.max(0, ledge.x0), end = Math.min(1, ledge.x1), roof = ledge.y * height;
    if (art.buildings) {
      const count = Math.ceil((end - start) / (.105 * scale)), tileWidth = (end - start) * width / count;
      for (let i = 0; i < count; i++) {
        const rect = spriteRect(art.buildings, 5 + (i + index) % 3), tileHeight = tileWidth * rect.height / rect.width;
        const x = start * width + i * tileWidth;
        context.globalAlpha = depth === 'far' ? .58 : ledge.y < .7 ? .78 : .94;
        context.drawImage(art.buildings.image, rect.x, rect.y, rect.width, rect.height, x, roof + 4 * scale, tileWidth + 1, tileHeight);
        if ((i + index) % 3 === 1 && art.billboards) sign(context, art.billboards, (index * 3 + i) % 8, x + tileWidth * .55, roof + tileHeight * .3, tileWidth * .48, time);
      }
    }
    context.globalAlpha = depth === 'far' ? .72 : 1;
    context.fillStyle = '#192334'; context.fillRect(start * width, roof, (end - start) * width, 6 * scale);
    context.fillStyle = '#6b859b'; context.fillRect(start * width, roof, (end - start) * width, 1);
    context.fillStyle = '#354454'; context.fillRect(start * width, roof + 6 * scale, (end - start) * width, 2 * scale);
  }
  context.restore();
}
