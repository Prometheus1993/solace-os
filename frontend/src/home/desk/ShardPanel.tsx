import { useEffect, useRef, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { navigate } from '../navigate.ts';
import { reducedMotionQuery } from './desk-browser.ts';

function ShardCover({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  return <div className="wp-shard-cover">{url && !failed
    ? <img src={url} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
    : <span>NO COVER</span>}</div>;
}

export function ShardPanel({ series }: { series: DashboardDTO['series'] }) {
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState<'manga' | 'books'>('manga');
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const matches = [...series]
    .filter(s => (channel === 'manga' ? s.type === 'manga' : s.type !== 'manga'))
    .filter(s => `${s.title} ${s.author ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b) => Number(b.reading) - Number(a.reading) || a.title.localeCompare(b.title));
  useEffect(() => {
    const el = rail.current!;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? el.clientWidth : 1);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const shift = (direction: number) => rail.current?.scrollBy({
    left: direction * rail.current.clientWidth * .7,
    behavior: reducedMotionQuery().matches ? 'instant' : 'smooth'
  });
  return <section className="wp-shard-panel wp-shard-stream" data-channel={channel} aria-labelledby="wp-shard-title">
    <header>
      <div>
        <span className="wp-eyebrow">{channel === 'manga' ? 'NEON DISTRICT / MANGA' : 'LITERARY ARCHIVE / BOOKS'}</span>
        <h1 id="wp-shard-title">SHARD CACHE</h1>
      </div>
      <label className="wp-shard-search">Find a book or series<input
          type="search"
          value={query}
          placeholder="Title or author…"
          onChange={e => { setQuery(e.target.value); if (rail.current) rail.current.scrollLeft = 0; }} />
      </label>
    </header>
    <div className="wp-shard-channels" role="group" aria-label="Collection channel">
      <button
        type="button"
        aria-pressed={channel === 'manga'}
        onClick={() => { setChannel('manga'); if (rail.current) rail.current.scrollLeft = 0; }}>MANGA <small>NEON DISTRICT</small>
      </button>
      <button
        type="button"
        aria-pressed={channel === 'books'}
        onClick={() => { setChannel('books'); if (rail.current) rail.current.scrollLeft = 0; }}>BOOKS <small>BOOKS + LIGHT NOVELS</small>
      </button>
    </div>
    <p className="wp-stream-hint">Scroll · swipe · drag to browse. Select a shard to open its details and edit.</p>
    <div ref={rail} className="wp-shard-rail" role="region" aria-label="Scrollable collection" tabIndex={0}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); shift(e.key === 'ArrowRight' ? 1 : -1); }
      }}
      onPointerDown={e => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        drag.current = { x:e.clientX, left:e.currentTarget.scrollLeft, moved:false };
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d || e.buttons !== 1) return;
        if (Math.abs(e.clientX-d.x) > 7) {
          d.moved = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.scrollLeft = d.left - (e.clientX-d.x);
        }
      }}
      onPointerCancel={() => { drag.current = null; }}
      onClickCapture={e => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); } drag.current = null; }}>
      {matches.map(s => <button
        type="button"
        className="wp-stream-card"
        key={s.id}
        onClick={() => navigate(`archives/${s.type === 'manga' ? 'manga' : 'books'}/${s.id}`)}>
        <small>{s.type.toUpperCase()} / {s.finished ? 'COMPLETE' : s.reading ? 'READING' : 'ARCHIVE'}</small>
        <ShardCover key={s.coverUrl} url={s.coverUrl} />
        <strong>{s.title}</strong><span>{s.progressPct == null ? 'Progress unknown' : `${s.progressPct}% read`} <b aria-hidden="true">↗</b></span>
      </button>)}
      {!matches.length && <p>{series.length ? 'No matching shards in this channel.' : 'Your collection is empty.'}</p>}
    </div>
    <footer>
      <span role="status">{matches.length} SHARDS · CONTINUOUS STREAM</span>
      <div>
        <button type="button" aria-label="Scroll collection left" onClick={() => shift(-1)}>←</button>
        <button type="button" aria-label="Scroll collection right" onClick={() => shift(1)}>→</button>
      </div>
    </footer>
    {!series.length && <button className="wp-sync" onClick={() => navigate('archives/books')}>OPEN ARCHIVE ↗</button>}
  </section>;
}
