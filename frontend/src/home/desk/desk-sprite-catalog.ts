import type { DeskObjectId } from './desk-layout-state.ts';

type DeskSpriteSpec = { asset: string; columns?: number; rows?: number; frame?: number; independent?: boolean; split?: number };
const ACCESSORY_FRAMES: Partial<Record<DeskObjectId, number>> = {
  radio: 0, 'speaker-0': 1, 'speaker-1': 1, headphones: 2, notebook: 3, plant: 4,
  mug: 5, 'figure-one': 6, 'figure-two': 7, shelf: 8, hologram: 9, charm: 10, 'hanging-plant': 11, pipes: 12,
};
/** State semantics match the original sheets: monitor0 asleep/1 awake, book0 closed/1 open, puck0..3. */
export function deskSpriteSpec(id: DeskObjectId, state = id === 'monitor' ? 1 : 0): DeskSpriteSpec {
  if (id === 'companion') return { asset: 'desk-cat-cushion' };
  if (id === 'surface') return { asset: 'desk-surface' };
  if (id === 'window') return { asset: 'desk-window-frame' };
  if (id === 'lamp') return { asset: 'desk-lamp' };
  if (id === 'monitor' || id === 'books') return { asset: `desk-${id}-atlas`, columns: 2, frame: state };
  if (id === 'puck') return { asset: 'desk-puck-atlas', columns: 2, rows: 2, frame: state };
  if (id === 'keyboard' || id === 'mouse') return { asset: 'desk-keyboard-mouse-atlas', columns: 2, independent: true, split: .63, frame: id === 'keyboard' ? 0 : 1 };
  return { asset: 'desk-accessories-atlas', columns: 4, rows: 4, independent: true, frame: ACCESSORY_FRAMES[id]! };
}
