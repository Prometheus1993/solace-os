import { useEffect, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { SubNav, useHashView } from './parts.tsx';
import { GoogleBooksKey } from './GoogleBooksKey.tsx';
import { Series } from './Series.tsx';

type View = 'books' | 'manga';
const VIEWS: { id: View; label: string }[] = [
  { id: 'books', label: 'BOOKS' },
  { id: 'manga', label: 'MANGA' },
];
/** ARCHIVES area — Books + Manga behind a YoRHa segmented sub-nav (hash `#archives/<view>`). Both views
 *  render the SAME unified `dto.series` (migration v13), filtered by type inside {@link Series}. The old
 *  TROPHIES sub-tab was dropped. */
export function Archives({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => { const update = () => setHash(window.location.hash); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const segment = hash.split('/')[2];
  const detailId = segment && /^\d+$/.test(segment) ? Number(segment) : undefined;
  const [view, setView] = useHashView('archives', VIEWS, 'books');
  return (
    <div>
      <SubNav views={VIEWS} view={view} setView={setView} />
      {view === 'books' && <Series key={`${view}/${detailId ?? "shelf"}`} detailId={detailId} dto={dto} onReload={onReload} kind="book" />}
      {view === 'manga' && <Series key={`${view}/${detailId ?? "shelf"}`} detailId={detailId} dto={dto} onReload={onReload} kind="manga" />}
      <GoogleBooksKey />
    </div>
  );
}
