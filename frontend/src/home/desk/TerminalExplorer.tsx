import { useRef, useState, type ReactNode } from 'react';
import type { DashboardDTO } from '@solace/core';
import { Dashboard } from '../../Dashboard.tsx';
import { Running } from '../../tabs/Running.tsx';
import { Strength } from '../../tabs/Strength.tsx';
import { Body } from '../../tabs/Body.tsx';
import { SchoolTasks } from '../../tabs/SchoolTasks.tsx';
import { Missions } from '../../tabs/Missions.tsx';
import { Series } from '../../tabs/Series.tsx';
import { GoogleBooksKey } from '../../tabs/GoogleBooksKey.tsx';
import { FilterTabs } from '../../tabs/parts.tsx';
import { courseNames } from './school-courses.ts';
import { TERMINAL_FOLDERS, type TerminalTarget } from './terminal-route.ts';
import { useVisited } from './use-visited.ts';
import '../../styles/components/terminal-explorer.css';

const key = (t: TerminalTarget) => `${t.folder}/${t.view}`;

/** The terminal's work area: folders BODY, STUDY and SHELF, each with its views. A view mounts on its first visit and stays
 *  mounted (hidden) so browsing folders never discards a draft; every save goes through the existing forms and API validation. */
export function TerminalExplorer({ dto, target, onSelect, onClose, onReload }: {
  dto: DashboardDTO;
  target: TerminalTarget;
  onSelect: (target: TerminalTarget) => void;
  onClose: () => void;
  onReload: () => void | Promise<void>;
}) {
  const [visited, visit] = useVisited<string>([key(target)]);
  if (!visited.has(key(target))) visit(key(target));
  const [course, setCourse] = useState('');
  const [receipt, setReceipt] = useState('LOCAL FILESYSTEM READY');
  const [confirmed, setConfirmed] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const saved = async () => {
    setReceipt('✓ CHANGES SAVED · REFRESHING FILES');
    await onReload();
    setReceipt('✓ CHANGES SAVED · FILES UPDATED');
    setConfirmed(count => count + 1);
  };
  const select = (next: TerminalTarget) => {
    setReceipt('LOCAL FILESYSTEM READY');
    content.current?.scrollTo({ top: 0 });
    onSelect(next);
  };
  const folder = TERMINAL_FOLDERS.find(f => f.id === target.folder)!;
  const viewLabel = folder.views.find(v => v.id === target.view)!.label;
  const selectedTitle = target.seriesId == null ? null : dto.series.find(s => s.id === target.seriesId)?.title;
  const path = `PERSONAL / ${folder.label} / ${viewLabel}${selectedTitle ? ` / ${selectedTitle}` : ''}`;
  const counts: Record<string, number> = {
    'school-term': dto.schoolTasks.filter(t => !t.done).length,
    manga: dto.series.filter(s => s.type === 'manga').length,
    books: dto.series.filter(s => s.type !== 'manga').length,
  };
  const courses = courseNames(dto.schoolTasks);
  const view = (id: string, folderId: TerminalTarget['folder'], children: ReactNode) => {
    const at = { folder: folderId, view: id };
    return visited.has(key(at)) && <section key={key(at)} className="te-view" hidden={key(target) !== key(at)}>{children}</section>;
  };
  const shelf = (kind: 'manga' | 'book') => {
    const id = kind === 'manga' ? 'manga' : 'books';
    return <Series
      kind={kind}
      dto={dto}
      onReload={saved}
      detailId={target.view === id ? target.seriesId : undefined}
      onOpen={seriesId => select({ folder: 'shelf', view: id, seriesId })}
      onBack={() => select({ folder: 'shelf', view: id })} />;
  };
  return <div className="terminal-explorer">
    <div className="te-layout">
      <nav className="te-folders" aria-label="Terminal folders">
        <p className="te-directory-label">DIRECTORY<span>PERSONAL/</span></p>
        {TERMINAL_FOLDERS.map(f => <div key={f.id} className="te-folder" data-active={f.id === target.folder}>
          <button type="button" className="te-folder-head" onClick={() => select({ folder: f.id, view: f.views[0].id })}>
            <span className={`area-icon area-icon--${f.id}`} aria-hidden="true" />{f.label}
          </button>
          {f.views.map(v => <button
            key={v.id}
            type="button"
            className="te-view-link"
            aria-current={f.id === target.folder && v.id === target.view ? 'page' : undefined}
            onClick={() => select({ folder: f.id, view: v.id })}>
            <span aria-hidden="true">└</span> {v.label}
            <small>{counts[v.id] ?? ''}</small>
          </button>)}
        </div>)}
        <span className="te-nav-note">SELECT A FOLDER<br />OPEN · EDIT · SAVE</span>
      </nav>
      <main className="te-workspace" aria-label="Terminal files">
        <div className="te-path">
          <span className="te-path-text" title={path}><span aria-hidden="true">&gt;_</span> {path}<i className="te-active" aria-hidden="true" /></span>
          <button type="button" className="te-close" onClick={onClose}>← DESK <kbd>ESC</kbd></button>
        </div>
        <div className="te-content" ref={content}>
          {view('overview', 'body', <Dashboard data={dto} />)}
          {view('running', 'body', <Running dto={dto} />)}
          {view('strength', 'body', <Strength dto={dto} onReload={saved} />)}
          {view('vitals', 'body', <Body dto={dto} onReload={saved} />)}
          {view('school-term', 'study', <>
            <FilterTabs<string>
              active={course}
              onChange={setCourse}
              tabs={[{ id: '', label: 'ALL' }, ...courses.map(c => ({ id: c, label: c.toUpperCase() }))]} />
            <SchoolTasks dto={dto} onReload={saved} courseFilter={course || undefined} />
          </>)}
          {view('exam-term', 'study', <Missions dto={dto} onReload={saved} />)}
          {view('books', 'shelf', shelf('book'))}
          {view('manga', 'shelf', shelf('manga'))}
          {view('key', 'shelf', <GoogleBooksKey />)}
        </div>
        <footer className="te-status" role="status">
          {/* Re-keyed by every finished save: the confirmation flash plays once per real save callback, never on its own. */}
          <b key={confirmed} className="te-receipt" data-confirmed={confirmed > 0 && receipt.endsWith('FILES UPDATED')}>{receipt}</b>
          <span>MANUAL INPUT / LOCAL SAVE</span>
        </footer>
      </main>
    </div>
  </div>;
}
