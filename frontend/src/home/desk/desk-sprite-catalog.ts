import type { DeskObjectId } from './desk-layout-state.ts';

export const DESK_STYLES = [
  { id: 'original', name: 'Original', description: 'Worn copper and cyan' },
  { id: 'cozy', name: 'Warm study', description: 'Walnut, cream and amber' },
  { id: 'neon', name: 'Neon nights', description: 'Indigo, cyan and magenta' },
] as const;
export type DeskStyle = typeof DESK_STYLES[number]['id'];
export function isDeskStyle(value: unknown): value is DeskStyle { return DESK_STYLES.some(style => style.id === value); }
export function supportsDeskStyle(id: DeskObjectId) { return id !== 'surface' && id !== 'window'; }

type DeskSpriteSpec = { asset: string; columns?: number; rows?: number; frame?: number; independent?: boolean; split?: number; topInsets?: Partial<Record<number, number>> };
// Ignore a hanging-leaf tip in the open-book cell's top gutter; source artwork stays intact.
const COZY_TOP_INSETS = { 15: 24 };
const ACCESSORY_FRAMES: Partial<Record<DeskObjectId, number>> = {
  radio: 0, 'speaker-0': 1, 'speaker-1': 1, headphones: 2, notebook: 3, plant: 4,
  mug: 5, 'figure-one': 6, 'figure-two': 7, shelf: 8, hologram: 9, charm: 10, 'hanging-plant': 11, pipes: 12,
};
/** State semantics match the original sheets: monitor0 asleep/1 awake, book0 closed/1 open, puck0..3. */
export function deskSpriteSpec(id: DeskObjectId, style: DeskStyle = 'original', state = id === 'monitor' ? 1 : 0): DeskSpriteSpec {
  if (id === 'companion') return { asset: 'desk-floor-companion-spaced-atlas', columns: 3, rows: 2, frame: DESK_STYLES.findIndex(item => item.id === style) + (state === 1 ? 3 : 0) };
  if (id === 'surface') return { asset: 'desk-surface' };
  if (id === 'window') return { asset: 'desk-window-frame' };
  if (style !== 'original') {
    const frame = id === 'lamp' ? 13 : id === 'books' ? 14 + (state === 1 ? 1 : 0)
      : id === 'monitor' ? state === 0 ? 17 : 16 : id === 'keyboard' ? 18 : id === 'mouse' ? 19
      : id === 'puck' ? 20 + Math.abs(state % 2) : ACCESSORY_FRAMES[id]!;
    return { asset: `desk-${style}-inventory`, columns: 4, rows: 6, frame, independent: true, ...(style === 'cozy' ? { topInsets: COZY_TOP_INSETS } : {}) };
  }
  if (id === 'lamp') return { asset: 'desk-lamp' };
  if (id === 'monitor' || id === 'books') return { asset: `desk-${id}-atlas`, columns: 2, frame: state };
  if (id === 'puck') return { asset: 'desk-puck-atlas', columns: 2, rows: 2, frame: state };
  if (id === 'keyboard' || id === 'mouse') return { asset: 'desk-keyboard-mouse-atlas', columns: 2, independent: true, split: .63, frame: id === 'keyboard' ? 0 : 1 };
  return { asset: 'desk-accessories-atlas', columns: 4, rows: 4, independent: true, frame: ACCESSORY_FRAMES[id]! };
}
