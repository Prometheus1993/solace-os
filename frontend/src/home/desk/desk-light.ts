/**
 * Zone lighting (#17): the lamp is a warm source, the awake monitor a cool one. Their reach hangs on the props' ACTUAL
 * boxes (default box + the saved/dragged layout), so moving, scaling or hiding one in EDIT LAYOUT carries its light along.
 * Pure: scene fractions in (0..1, like `desk-cat.ts`), CSS custom properties and plain numbers out.
 */
import type { DayPhase } from '@solace/core';
import { adjustedBox } from './desk-cat.ts';
import { DESK_CANVAS } from './desk-canvas.ts';
import { DEFAULT_ADJUSTMENT, type DeskLayout, type DeskObjectId } from './desk-layout-state.ts';
import { clamp01, type Point } from './motion.ts';

type Box = { left: number; top: number; width: number; height: number };
export type SourceId = 'lamp' | 'monitor';
export type ReceiverId = 'books' | 'notebook' | 'keyboard' | 'mouse';
/** An ellipse of reach in logical canvas pixels. */
export type Envelope = { x: number; y: number; rx: number; ry: number };

/** Each prop's default box in `desktop-sprites.css` (left/bottom/width in %, height in scene widths), as scene fractions. */
const heightOf = (widths: number) => widths * DESK_CANVAS.width / DESK_CANVAS.height;
const boxOf = (left: number, bottom: number, width: number, widths: number): Box => ({ left, top: 1 - bottom - heightOf(widths), width, height: heightOf(widths) });
const BOXES: Record<SourceId | ReceiverId, Box> = {
  lamp: boxOf(.045, .085, .09, .1379),
  monitor: boxOf(.54, .103, .24, .1104),
  books: boxOf(.14, .1, .09, .062),
  notebook: boxOf(.155, .065, .06, .0386),
  keyboard: boxOf(.575, .065, .17, .0491),
  mouse: boxOf(.755, .07, .032, .0334),
};
/** Where the light comes from inside the source box (`u`/`v`) and how far it reaches, in source widths and heights. */
const SOURCES: Record<SourceId, { u: number; v: number; reachX: number; reachY: number }> = {
  lamp: { u: .69, v: .19, reachX: 2.7, reachY: 1.5 },
  monitor: { u: .5, v: .28, reachX: 1.1, reachY: 1.9 },
};
const RECEIVERS: readonly ReceiverId[] = ['books', 'notebook', 'keyboard', 'mouse'];
/** Props that get a silhouette-clipped light overlay; every other prop only follows the global day/night grading. */
export const isReceiver = (id: DeskObjectId): id is ReceiverId => (RECEIVERS as readonly string[]).includes(id);
/** The tabletop's top edge (logical px) and the lowest a pool of light settles. */
const TABLETOP = { top: .881, bottom: .95 } as const;

export const WARM = [255, 176, 92] as const;
export const COOL = [110, 232, 236] as const;

const boxOfProp = (id: SourceId | ReceiverId, layout: DeskLayout) => adjustedBox(BOXES[id], layout[id] ?? DEFAULT_ADJUSTMENT);
const px = (box: Box) => ({ left: box.left * DESK_CANVAS.width, top: box.top * DESK_CANVAS.height, width: box.width * DESK_CANVAS.width, height: box.height * DESK_CANVAS.height });

/** The reach of a source at its current position and size (hidden or not: emission is `lightLevels`' job). */
export function sourceEnvelope(id: SourceId, layout: DeskLayout): Envelope {
  const box = px(boxOfProp(id, layout)), source = SOURCES[id];
  return { x: box.left + box.width * source.u, y: box.top + box.height * source.v, rx: box.width * source.reachX, ry: box.height * source.reachY };
}
/** 1 at the source's centre, smoothly down to 0 at the edge of its reach and beyond. */
export function falloff(envelope: Envelope, x: number, y: number): number {
  const d = clamp01(Math.hypot((x - envelope.x) / envelope.rx, (y - envelope.y) / envelope.ry));
  return 1 - d * d * (3 - 2 * d);
}

/** How strongly each source glows in a phase: the lamp burns from dusk, the screen is brightest at night. */
const LEVELS: Record<DayPhase, { lamp: number; screen: number }> = {
  dawn: { lamp: 0, screen: .3 },
  day: { lamp: 0, screen: .15 },
  dusk: { lamp: .8, screen: .55 },
  night: { lamp: 1, screen: .8 },
};
/** A hidden lamp, a hidden monitor and an asleep monitor emit nothing. */
export function lightLevels(phase: DayPhase, layout: DeskLayout, awake: boolean) {
  return {
    lamp: layout.lamp?.hidden ? 0 : LEVELS[phase].lamp,
    screen: layout.monitor?.hidden || !awake ? 0 : LEVELS[phase].screen,
  };
}

const percent = (value: number) => `${Math.round(value * 100) / 100}%`;
/** The warm and cool ellipses as percentages of one receiver's own box, so they follow it however it is moved or scaled. */
export function receiverVars(id: ReceiverId, layout: DeskLayout): Record<string, string> {
  const box = px(boxOfProp(id, layout)), vars: Record<string, string> = {};
  for (const [name, source] of [['warm', 'lamp'], ['cool', 'monitor']] as const) {
    const envelope = sourceEnvelope(source, layout);
    vars[`--lit-${name}-x`] = percent((envelope.x - box.left) / box.width * 100);
    vars[`--lit-${name}-y`] = percent((envelope.y - box.top) / box.height * 100);
    vars[`--lit-${name}-rx`] = percent(envelope.rx / box.width * 100);
    vars[`--lit-${name}-ry`] = percent(envelope.ry / box.height * 100);
  }
  return vars;
}
/** The pools on the tabletop, as percentages of the scene: under the source, flattened, never above the table's edge. */
export function poolVars(layout: DeskLayout): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, source] of [['warm', 'lamp'], ['cool', 'monitor']] as const) {
    const box = boxOfProp(source, layout), envelope = sourceEnvelope(source, layout);
    vars[`--pool-${name}-x`] = percent((box.left + box.width / 2) * 100);
    vars[`--pool-${name}-y`] = percent(Math.min(TABLETOP.bottom, Math.max(TABLETOP.top, box.top + box.height)) * 100);
    vars[`--pool-${name}-rx`] = percent(envelope.rx * .85 / DESK_CANVAS.width * 100);
    vars[`--pool-${name}-ry`] = percent(4);
  }
  return vars;
}

export type CatLight = { warm: Envelope; cool: Envelope; warmLevel: number; coolLevel: number };
export function catLight(layout: DeskLayout, levels: { lamp: number; screen: number }): CatLight {
  return { warm: sourceEnvelope('lamp', layout), cool: sourceEnvelope('monitor', layout), warmLevel: levels.lamp, coolLevel: levels.screen };
}
export type Tint = { r: number; g: number; b: number; a: number };
const MAX_TINT = .3;
/** Amber and cyan blend by how far each source reaches the cat's paws (scene fractions); `a` = 0 when neither does. */
export function catTint(light: CatLight, paws: Point): Tint {
  const x = paws.x * DESK_CANVAS.width, y = paws.y * DESK_CANVAS.height;
  const warm = falloff(light.warm, x, y) * light.warmLevel, cool = falloff(light.cool, x, y) * light.coolLevel, total = warm + cool;
  if (total <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = cool / total, channel = (i: 0 | 1 | 2) => Math.round(WARM[i] + (COOL[i] - WARM[i]) * mix);
  return { r: channel(0), g: channel(1), b: channel(2), a: Math.min(MAX_TINT, total * MAX_TINT) };
}
/** The tint in coarse steps, so a walking cat redraws only when its colour visibly changes. */
export const tintKey = (tint: Tint) => tint.a === 0 ? '0' : `${Math.round(tint.a * 40)}/${Math.round(tint.r / 12)}/${Math.round(tint.b / 12)}`;

/** The train's glow on glass and tabletop: a soft band (22% wide in `desk-sky.css`) whose background-position (%) follows the train; strongest mid-window, gone at both ends. */
const GLINT = { width: .22, strength: .16 } as const;
export function trainGlint(flight: { x: number; alpha: number } | null): { position: number; strength: number } {
  if (!flight) return { position: 0, strength: 0 };
  const edge = clamp01(Math.min(flight.x + .15, 1.15 - flight.x) / .15);
  return { position: (flight.x - GLINT.width / 2) / (1 - GLINT.width) * 100, strength: GLINT.strength * clamp01(flight.alpha) * edge };
}
