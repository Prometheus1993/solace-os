import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type MouseEvent,
  type FocusEvent
} from 'react';
import {
  adjustProp,
  decodeDeskLayout,
  DEFAULT_ADJUSTMENT,
  DESK_LAYOUT_KEY,
  DESK_OBJECTS,
  dragAdjustment,
  encodeDeskLayout,
  isDeskObject,
  resetProp,
  resizeAdjustment,
  type DeskLayout,
  type DeskObjectId,
  type PropAdjustment
} from './desk-layout-state.ts';
import { writeStored } from './desk-browser.ts';
import { logicalSelectionBox } from './desk-canvas.ts';

type Gesture = {
  pointer: number;
  id: DeskObjectId;
  startX: number;
  startY: number;
  start: PropAdjustment;
  width: number;
  height: number;
  resize: boolean;
  anchor: { x: number; y: number }
};
export function useDeskLayout() {
  const [initial] = useState(() => {
    try { return { layout: decodeDeskLayout(localStorage.getItem(DESK_LAYOUT_KEY)), message: '' }; }
    catch { return { layout: {} as DeskLayout, message: 'Saved layout could not be read. Showing the default arrangement.' }; }
  });
  const [saved, setSaved] = useState<DeskLayout>(initial.layout);
  const [draft, setDraft] = useState<DeskLayout>(initial.layout);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<DeskObjectId>('monitor');
  const [message, setMessage] = useState(initial.message);
  const scene = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const values = editing ? draft : saved;
  const update = (id: DeskObjectId, change: Partial<PropAdjustment>) => setDraft(previous => adjustProp(previous, id, change));
  const begin = () => { setDraft(saved); setEditing(true); setMessage(''); };
  const cancel = () => { gesture.current = null; setDraft(saved); setEditing(false); setMessage('Layout changes cancelled.'); };
  const save = () => {
    setSaved(draft); gesture.current = null; setEditing(false);
    setMessage(writeStored(DESK_LAYOUT_KEY, encodeDeskLayout(draft))
      ? 'Layout saved on this device.'
      : 'Layout applied for this visit. Browser storage could not save it.');
  };
  const prop = (id: DeskObjectId) => {
    const value = values[id] ?? DEFAULT_ADJUSTMENT;
    return { 'data-layout-id': id, 'data-layout-selected': editing && selected === id, 'data-inventory-hidden': !!value.hidden,
      hidden: !!value.hidden && (!editing || selected !== id),
      style: { '--layout-x': `${value.x}cqw`, '--layout-y': `${value.y}cqh`, '--layout-scale': value.scale } as CSSProperties };
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editing || !event.isPrimary || event.button !== 0 || gesture.current) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layout-id]') : null;
    const id = target?.dataset.layoutId;
    if (!id || !isDeskObject(id)) return;
    const element = scene.current?.querySelector<HTMLElement>(`.desk-prop[data-layout-id="${id}"]`);
    const rect = element?.getBoundingClientRect(), parent = scene.current?.getBoundingClientRect();
    if (!rect || !parent) return;
    event.preventDefault(); event.stopPropagation(); setSelected(id);
    gesture.current = {
      pointer: event.pointerId,
      id,
      startX: event.clientX,
      startY: event.clientY,
      start: { ...(draft[id] ?? DEFAULT_ADJUSTMENT) },
      width: parent.width,
      height: parent.height,
      resize: target?.dataset.layoutResize === 'true',
      anchor: { x: rect.left + rect.width / 2, y: rect.bottom }
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!editing || !current || current.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    if (current.resize) update(
      current.id,
      { scale: resizeAdjustment(current.start.scale, { x: current.startX, y: current.startY }, { x: event.clientX, y: event.clientY }, current.anchor) }
    );
    else update(current.id, dragAdjustment(current.start, event.clientX - current.startX, event.clientY - current.startY, current.width, current.height));
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    event.preventDefault(); gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const pointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.pointer !== event.pointerId) return;
    update(current.id, current.start); pointerUp(event);
  };
  const suppressClick = (event: MouseEvent<HTMLDivElement>) => { if (editing) { event.preventDefault(); event.stopPropagation(); } };
  const focusProp = (event: FocusEvent<HTMLDivElement>) => {
    if (!editing) return;
    const id = event.target.closest<HTMLElement>('[data-layout-id]')?.dataset.layoutId;
    if (id && isDeskObject(id)) setSelected(id);
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!editing
      || event.metaKey
      || event.ctrlKey
      || event.altKey
      || event.target instanceof HTMLInputElement
      || event.target instanceof HTMLSelectElement
      || event.target instanceof HTMLTextAreaElement) return;
    const value = draft[selected] ?? DEFAULT_ADJUSTMENT, step = event.shiftKey ? 1 : .25;
    const changes: Record<string, Partial<PropAdjustment>> = {
      ArrowLeft: { x: value.x - step },
      ArrowRight: { x: value.x + step },
      ArrowUp: { y: value.y - step },
      ArrowDown: { y: value.y + step },
      '+': { scale: value.scale + .05 },
      '=': { scale: value.scale + .05 },
      '-': { scale: value.scale - .05 }
    };
    if (changes[event.key]) { event.preventDefault(); event.stopPropagation(); update(selected, changes[event.key]); }
  };
  return {
    scene,
    editing,
    selected,
    select: setSelected,
    values,
    message,
    begin,
    cancel,
    save,
    update,
    prop,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    suppressClick,
    focusProp,
    keyDown,
    resetSelected: () => setDraft(previous => resetProp(previous, selected)), resetAll: () => setDraft({}) };
}
export type DeskLayoutControl = ReturnType<typeof useDeskLayout>;

export function DeskLayoutEditor({ layout }: { layout: DeskLayoutControl }) {
  const panel = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  const value = layout.values[layout.selected] ?? DEFAULT_ADJUSTMENT;
  return <aside ref={panel} className="desk-layout-editor" aria-label="Edit desk layout" tabIndex={-1} onKeyDown={layout.keyDown}>
    <header>
      <div><small>MAKE YOURSELF AT HOME</small><h2>Arrange your desk</h2></div>
      <button
        onClick={() => setCollapsed(previous => !previous)}
        aria-label={collapsed ? 'Show layout controls' : 'Hide layout controls'}
        aria-expanded={!collapsed}>
        {collapsed ? '+' : '−'}
      </button>
    </header>
    <div hidden={collapsed}>
    <p id="desk-layout-help">Drag a prop to move it. Drag its corner to resize. Arrow keys move; Shift moves faster; + / − resize.</p>
    <label>Selected object<select
        value={layout.selected}
        onChange={event => { if (isDeskObject(event.target.value)) layout.select(event.target.value); }}>
        {DESK_OBJECTS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
    <label className="desk-inventory-visibility">
      <input
        type="checkbox"
        checked={!value.hidden}
        onChange={event => layout.update(layout.selected, { hidden: !event.target.checked })} /> Show on desk</label>
    <label>Size <output>{Math.round(value.scale * 100)}%</output>
      <input
        aria-label="Object size"
        type="range"
        min="35"
        max="200"
        step="1"
        value={Math.round(value.scale * 100)}
        onChange={event => layout.update(layout.selected, { scale: Number(event.target.value) / 100 })} />
    </label>
    <div className="desk-layout-offsets">
      {(['x', 'y'] as const).map(axis => <label key={axis}>
        {axis === 'x' ? 'Horizontal offset %' : 'Vertical offset %'}
        <input
          type="number"
          min="-100"
          max="100"
          step="0.25"
          value={Math.round(value[axis] * 100) / 100}
          onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) layout.update(layout.selected, { [axis]: event.target.valueAsNumber }); }} />
      </label>)}
    </div>
    <div className="desk-layout-reset">
      <button onClick={layout.resetSelected}>Reset object</button>
      <button onClick={layout.resetAll}>Reset whole layout</button>
    </div>
    <p>Save keeps your arrangement in this browser. Reset restores original sizes, positions and visibility.</p>
    </div>
    <footer><button onClick={layout.cancel}>Cancel</button><button onClick={layout.save}>Save layout</button></footer>
  </aside>;
}

export function DeskLayoutHandles({ layout }: { layout: DeskLayoutControl }) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!layout.editing) return;
    const root = layout.scene.current;
    const element = root?.querySelector<HTMLElement>(`.desk-prop[data-layout-id="${layout.selected}"]`);
    if (!root || !element) return;
    const measure = () => {
      const parent = root.getBoundingClientRect(), rect = element.getBoundingClientRect();
      setBox(logicalSelectionBox(parent, rect, root.clientWidth, root.clientHeight));
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(root); observer.observe(element);
    return () => observer.disconnect();
  }, [layout.editing, layout.selected, layout.values, layout.scene]);
  if (!layout.editing || !box) return null;
  const name = DESK_OBJECTS.find(([id]) => id === layout.selected)?.[1];
  return <div className="desk-layout-selection" style={box} data-layout-id={layout.selected}>
    <span className="desk-layout-selection-name">{name}</span>
    <button
      className="desk-layout-resize"
      data-layout-id={layout.selected}
      data-layout-resize="true"
      aria-label={`Resize ${name}. Drag corner or use plus and minus keys.`}>↗</button>
  </div>;
}
