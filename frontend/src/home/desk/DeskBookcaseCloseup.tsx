import { useLayoutEffect, useRef, useState } from 'react';
import { cssVars } from '../../tokens.ts';
import { deskAsset as asset } from './desk-assets.ts';
import { ARROWS, HEADER, LIP_HEIGHT, SHELVES } from './bookcase-parts.ts';
import { boxPercent, coverBox, type Box } from './bookcase-layout.ts';
import {
  bookcaseSeries, clampPage, coverChoice, pageCount, pageShelves, seriesTarget, type Channel, type Series,
} from './bookcase-state.ts';
import type { TerminalTarget } from './terminal-route.ts';
import '../../styles/components/desk-bookcase.css';

const ZOOM_MS = 320;

/** An art-pixel box as the `--x/--y/--w/--h` percentages `.case-box` reads. */
const place = (box: Box) => {
  const p = boxPercent(box);
  return cssVars({ '--x': `${p.x}%`, '--y': `${p.y}%`, '--w': `${p.w}%`, '--h': `${p.h}%` });
};

/** One cover: the real image, or a styled placeholder showing the title when there is no cover or it fails to load. */
function Cover({ series, box, onPick }: { series: Series; box: Box; onPick: (target: TerminalTarget) => void }) {
  const [failed, setFailed] = useState(false);
  const image = coverChoice(series.coverUrl, failed) === 'image';
  return <button
    type="button"
    className="case-box case-cover"
    data-reading={series.reading}
    data-placeholder={!image}
    style={place(box)}
    aria-label={`${series.title}${series.reading ? ', reading' : ''}. Open in the terminal`}
    onClick={() => onPick(seriesTarget(series))}>
    {image
      ? <img src={series.coverUrl!} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      : <span className="case-cover-title"><small>{series.type.toUpperCase()}</small>{series.title}</span>}
  </button>;
}

/** The books prop on the desk, zoomed in: a bookcase of face-out covers (3 shelves x 8 per page) from the real collection.
 *  Its own overlay layer (the desk scene is never scaled): it grows out of the books prop and shrinks back into it. Esc or a click
 *  outside closes it; reduced motion only fades. A cover opens the terminal on that series. Without the private art a plain panel
 *  with the same layout stands in. */
export function DeskBookcaseCloseup({ series, reduced, origin, onPick, onClose }: {
  series: readonly Series[]; reduced: boolean; origin: () => DOMRect | null;
  onPick: (target: TerminalTarget) => void; onClose: () => void;
}) {
  const [channel, setChannel] = useState<Channel>('manga');
  const [query, setQuery] = useState('');
  const [rawPage, setRawPage] = useState(0);
  const shade = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const back = asset('bookcase-back'), front = asset('bookcase-front');
  const art = Boolean(back && front);
  const matches = bookcaseSeries(series, channel, query);
  const pages = pageCount(matches.length);
  const page = clampPage(rawPage, matches.length);
  const shelves = pageShelves(matches, page);
  // forward = zooming in. Reduced motion only fades.
  const zoom = (forward: boolean): Promise<unknown> => {
    const from = origin(), box = stage.current!.getBoundingClientRect();
    const small = !reduced && from ? `translate(${from.left + from.width / 2 - box.left - box.width / 2}px, ${from.top + from.height / 2 - box.top - box.height / 2}px) scale(${from.width / box.width})` : 'none';
    const options: KeyframeAnimationOptions = { duration: reduced ? 160 : ZOOM_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both', direction: forward ? 'normal' : 'reverse' };
    shade.current!.animate([{ opacity: 0 }, { opacity: 1 }], options);
    return stage.current!.animate([{ transform: small, opacity: reduced ? 0 : .5 }, { transform: 'none', opacity: 1 }], options).finished;
  };
  useLayoutEffect(() => { void zoom(true); shade.current!.focus({ preventScroll: true }); }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    void zoom(false).then(onClose, onClose);
  };
  const turn = (step: number) => setRawPage(clampPage(page + step, matches.length));
  const pick = (channelNext: Channel) => { setChannel(channelNext); setRawPage(0); };
  return <div
    ref={shade}
    className="case-closeup"
    role="dialog"
    aria-modal="true"
    aria-label="Bookcase"
    tabIndex={-1}
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    onKeyDown={event => {
      if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault(); turn(event.key === 'ArrowRight' ? 1 : -1);
      }
    }}>
    <button type="button" className="case-close" onClick={close}>← DESK <kbd>ESC</kbd></button>
    <div className="case-stage" ref={stage} data-art={art} data-channel={channel}>
      {art
        ? <img className="case-box case-art" src={back} alt="" draggable={false} />
        : SHELVES.map((shelf, i) => <i key={i} className="case-box case-plain-lip" aria-hidden="true"
          style={place({ x: shelf.coverArea.x, y: shelf.lipTopY, w: shelf.coverArea.w, h: LIP_HEIGHT })} />)}
      {shelves.map((row, i) => row.map((s, slot) => <Cover key={s.id} series={s} box={coverBox(i, slot)} onPick={onPick} />))}
      {art && <img className="case-art case-front" src={front} alt="" draggable={false} />}
      {!matches.length && <p className="case-box case-empty" role="status" style={place(SHELVES[1].coverArea)}>
        {series.length ? 'No matching series in this channel.' : 'Your collection is empty.'}
      </p>}
      <header className="case-box case-head" style={place(HEADER)}>
        <h1>SHELF</h1>
        <div className="case-channels" role="group" aria-label="Collection channel">
          <button type="button" aria-pressed={channel === 'manga'} onClick={() => pick('manga')}>MANGA</button>
          <button type="button" aria-pressed={channel === 'books'} onClick={() => pick('books')}>BOOKS</button>
        </div>
        <input
          type="search"
          aria-label="Find a series by title or author"
          placeholder="Title or author…"
          value={query}
          onChange={event => { setQuery(event.target.value); setRawPage(0); }} />
        <span className="case-count" role="status">{matches.length} SERIES · PAGE {page + 1}/{pages}</span>
      </header>
      <button type="button" className="case-box case-arrow" data-side="left" style={place(ARROWS.left)} aria-label="Previous page" disabled={page === 0} onClick={() => turn(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg></button>
      <button type="button" className="case-box case-arrow" data-side="right" style={place(ARROWS.right)} aria-label="Next page" disabled={page >= pages - 1} onClick={() => turn(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>
  </div>;
}
