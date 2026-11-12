import { useEffect, useMemo, useRef, useState } from 'react';
import { deskAsset } from './desk-assets.ts';
import { advanceCat, CAT_SEQUENCE_IDS, catBox, catSpots, catView, petCat, startCat, type CatSequenceId, type CatState } from './desk-cat.ts';
import type { DeskLayout } from './desk-layout-state.ts';
import { loadSheet, type Sheet } from './DeskSprite.tsx';

type CatSheets = Record<CatSequenceId, Sheet>;

/** The walking cat. Its state machine only advances while `moving`; otherwise the current frame stays up. */
export function DeskCat({ moving, reduced, layout, petted, onPet, onError }: {
  moving: boolean; reduced: boolean; layout: DeskLayout; petted: boolean; onPet: () => void; onError: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const brain = useRef<CatState | null>(null), drawn = useRef('');
  const error = useRef(onError); error.current = onError;
  const [sheets, setSheets] = useState<CatSheets | null>(null);
  const spots = useMemo(() => catSpots(layout), [layout]);
  // The cat was one sprite with its cushion, so it keeps the cushion's size setting.
  const scale = layout.companion?.scale ?? 1;
  useEffect(() => {
    let disposed = false;
    const sources = CAT_SEQUENCE_IDS.map(id => deskAsset(`desk-cat-${id}-atlas`));
    if (sources.some(src => !src)) { error.current(); return; }
    void Promise.all(sources.map(src => loadSheet(src!, 4, 2, false)))
      .then(loaded => { if (!disposed) setSheets(Object.fromEntries(CAT_SEQUENCE_IDS.map((id, index) => [id, loaded[index]])) as CatSheets); })
      .catch(() => { if (!disposed) error.current(); });
    return () => { disposed = true; };
  }, []);
  const paint = () => {
    const state = brain.current, element = button.current, target = canvas.current;
    if (!state || !element || !target || !sheets) return;
    const view = catView(state), sheet = sheets[view.sequence], frame = sheet.frames[view.frame];
    // Cell 0 starts at the sheet's origin, so its frame is the sequence's shared crop in cell pixels.
    const box = catBox(sheet.frames[0], view.facing, scale);
    for (const [name, value] of [['x', view.point.x], ['y', view.point.y], ['dx', box.dx], ['dy', box.dy], ['w', box.width], ['h', box.height]] as const) {
      element.style.setProperty(`--cat-${name}`, String(value));
    }
    element.dataset.flip = String(view.facing === -1);
    const key = `${view.sequence}/${view.frame}`;
    if (drawn.current === key) return;
    const context = target.getContext('2d');
    if (!context) return;
    target.width = frame.width; target.height = frame.height;
    context.drawImage(sheet.image, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    drawn.current = key;
  };
  // A moved or hidden prop moves or drops its spot: the cat settles again where it was, or at home.
  // Reduced motion: seated at home, and it stays there because `moving` is off.
  useEffect(() => {
    brain.current = startCat(spots, Math.random, reduced ? undefined : brain.current?.spot);
    paint();
  }, [spots, reduced]);
  useEffect(() => {
    paint();
    if (!moving || !sheets) return;
    let request = 0, previous = 0;
    const tick = (now: number) => {
      request = requestAnimationFrame(tick);
      if (!previous) { previous = now; return; }
      if (now - previous < 1000 / 30) return;
      brain.current = advanceCat(brain.current!, Math.min((now - previous) / 1000, .1), spots, Math.random);
      previous = now;
      paint();
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [moving, sheets, spots, scale]);
  return <button
    ref={button}
    className="desk-prop desk-cat"
    hidden={!sheets}
    data-reaction={petted}
    onClick={() => { if (moving) brain.current = petCat(brain.current!); onPet(); }}
    aria-label="Pet the cyber fox-cat">
    <canvas ref={canvas} />
    <span className="desk-prop-label">LITTLE COMPANION<small>{petted ? 'A QUIET PURR. RIGHT HERE WITH YOU.' : 'WANDERING YOUR DESK'}</small></span>
  </button>;
}
