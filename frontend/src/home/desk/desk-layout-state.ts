import { isDeskStyle, supportsDeskStyle, type DeskStyle } from './desk-sprite-catalog.ts';

export const DESK_LAYOUT_KEY = 'solace.desk.layout.v1';
export const DESK_OBJECTS = [
  ['surface', 'Desk surface'], ['window', 'City window'],
  ['lamp', 'Lamp'], ['books', 'Books'], ['monitor', 'Monitor'], ['keyboard', 'Keyboard'],
  ['mouse', 'Mouse'], ['puck', 'Biomonitor'], ['radio', 'Radio'],
  ['speaker-0', 'Left speaker'], ['speaker-1', 'Right speaker'],
  ['headphones', 'Headphones'], ['notebook', 'Notebook'], ['plant', 'Desk plant'], ['mug', 'Mug'],
  ['hologram', 'Avatar projector'], ['shelf', 'Shelf'], ['figure-one', 'Wayfarer figure'],
  ['figure-two', 'Robot figure'], ['hanging-plant', 'Hanging plant'], ['charm', 'Window charm'], ['pipes', 'Window pipes'],
  ['companion', 'Floor companion'],
] as const;
export type DeskObjectId = typeof DESK_OBJECTS[number][0];
export type PropAdjustment = { x: number; y: number; scale: number; sprite?: DeskStyle; hidden?: boolean };
export type DeskLayout = Partial<Record<DeskObjectId, PropAdjustment>>;
export const DEFAULT_ADJUSTMENT: PropAdjustment = { x: 0, y: 0, scale: 1 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function isDeskObject(value: string): value is DeskObjectId {
  return DESK_OBJECTS.some(([id]) => id === value);
}
export function adjustProp(layout: DeskLayout, id: DeskObjectId, change: Partial<PropAdjustment>): DeskLayout {
  const previous = layout[id] ?? DEFAULT_ADJUSTMENT;
  const finite = (value: number | undefined, fallback: number) => value !== undefined && Number.isFinite(value) ? value : fallback;
  const next: PropAdjustment = {
    ...previous,
    x: clamp(finite(change.x, previous.x), -100, 100),
    y: clamp(finite(change.y, previous.y), -100, 100),
    scale: clamp(finite(change.scale, previous.scale), .35, 2),
  };
  if (isDeskStyle(change.sprite)) next.sprite = change.sprite;
  if (typeof change.hidden === 'boolean') next.hidden = change.hidden;
  return { ...layout, [id]: next };
}
export function applyDeskStyle(layout: DeskLayout, sprite: DeskStyle): DeskLayout {
  return DESK_OBJECTS.reduce((next, [id]) => supportsDeskStyle(id) ? adjustProp(next, id, { sprite }) : next, layout);
}
export function resetProp(layout: DeskLayout, id: DeskObjectId): DeskLayout {
  const next = { ...layout }; delete next[id]; return next;
}
export function decodeDeskLayout(raw: string | null): DeskLayout {
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('props' in value) || !value.props || typeof value.props !== 'object' || Array.isArray(value.props)) throw new Error('Unrecognized layout');
  let layout: DeskLayout = {};
  for (const [id] of DESK_OBJECTS) {
    const item: unknown = (value.props as Record<string, unknown>)[id];
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y) && typeof p.scale === 'number' && Number.isFinite(p.scale)) layout = adjustProp(layout, id, { x: p.x, y: p.y, scale: p.scale, sprite: isDeskStyle(p.sprite) ? p.sprite : undefined, hidden: typeof p.hidden === 'boolean' ? p.hidden : undefined });
  }
  return layout;
}
export function encodeDeskLayout(layout: DeskLayout) { return JSON.stringify({ version: 1, props: layout }); }
export function dragAdjustment(start: PropAdjustment, dx: number, dy: number, width: number, height: number): PropAdjustment {
  return { ...start, x: start.x + dx / Math.max(width, 1) * 100, y: start.y + dy / Math.max(height, 1) * 100 };
}
export function resizeAdjustment(scale: number, start: { x: number; y: number }, current: { x: number; y: number }, anchor: { x: number; y: number }) {
  const dx = start.x - anchor.x, dy = start.y - anchor.y;
  // Project onto the initial handle direction, preserving the bottom-centre anchor.
  const ratio = ((current.x - anchor.x) * dx + (current.y - anchor.y) * dy) / Math.max(1, dx * dx + dy * dy);
  return clamp(scale * ratio, .35, 2);
}

