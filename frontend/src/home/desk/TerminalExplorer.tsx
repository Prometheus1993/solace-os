import { useRef, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { SchoolTasks } from '../../tabs/SchoolTasks.tsx';
import { StrengthLog } from '../../tabs/StrengthLog.tsx';
import { Series } from '../../tabs/Series.tsx';
import { Icon } from '../icons.tsx';
import { courseNames } from './school-courses.ts';
import { useVisited } from './use-visited.ts';
import '../../styles/components/terminal-explorer.css';
import '../../styles/components/netrunner-rig.css';

type Folder = 'school' | 'training' | 'manga' | 'books';
const PATHS: Record<Folder, string> = { school:'SCHOOL', training:'TRAINING', manga:'LIBRARY / MANGA', books:'LIBRARY / BOOKS' };

/** Local file workspace; all writes use the existing domain forms and API validation. */
export function TerminalExplorer({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  const [folder, setFolder] = useState<Folder>('school');
  const [visited, visit] = useVisited<Folder>(['school']);
  const [course, setCourse] = useState<string | undefined>();
  const [detail, setDetail] = useState<number | undefined>();
  const [receipt, setReceipt] = useState('LOCAL FILESYSTEM READY');
  const content = useRef<HTMLDivElement>(null);
  const courses = courseNames(dto.schoolTasks);
  const open = (next: Folder, nextCourse?: string, id?: number) => {
    visit(next);
    setFolder(next); setCourse(nextCourse); setDetail(id); setReceipt('LOCAL FILESYSTEM READY');
    content.current?.scrollTo({ top:0 });
  };
  const saved = async () => {
    setReceipt('✓ CHANGES SAVED · REFRESHING FILES');
    await onReload();
    setReceipt('✓ CHANGES SAVED · FILES UPDATED');
  };
  const selectedTitle = detail == null ? null : dto.series.find(s => s.id === detail)?.title;
  const path = `PERSONAL / ${PATHS[folder]}${course ? ` / ${course}` : ''}${selectedTitle ? ` / ${selectedTitle}` : ''}`;
  const folderButton = (id: Folder, label: string, count?: number) => <button
    type="button"
    aria-current={folder === id && course === undefined ? 'page' : undefined}
    onClick={() => open(id)}>
    <Icon name="folder" size={18} /> {label}
    <small>{count ?? ''}</small>
  </button>;
  return <div className="terminal-explorer">
    <div className="te-layout">
      <nav className="te-folders" aria-label="Terminal folders">
        <p className="te-directory-label">DIRECTORY<span>PERSONAL/</span></p>
        {folderButton('school', 'SCHOOL', dto.schoolTasks.filter(t => !t.done).length)}
        <div className="te-subfolders">
          {courses.map(c => <button
            key={c}
            type="button"
            aria-current={folder === 'school' && course === c ? 'page' : undefined}
            onClick={() => open('school', c)}>
            <span aria-hidden="true">└</span> {c}
          </button>)}
        </div>
        {folderButton('training', 'TRAINING')}
        <p className="te-library"><Icon name="book" size={16} /> LIBRARY/</p>
        <div className="te-subfolders">
          {folderButton('manga', 'MANGA', dto.series.filter(s => s.type === 'manga').length)}
          {folderButton('books', 'BOOKS', dto.series.filter(s => s.type !== 'manga').length)}
        </div>
        <span className="te-nav-note">SELECT A FOLDER<br />OPEN · EDIT · SAVE</span>
      </nav>
      <main className="te-workspace" aria-label="Terminal files">
        <div className="te-path" title={path}><span aria-hidden="true">&gt;_</span> {path}</div>
        <div className="te-content" ref={content}>
          {/* Keep folder forms mounted so browsing files never discards a draft. */}
          <section hidden={folder !== 'school'}>
            <h1>{course ?? 'School tasks'}</h1>
            <SchoolTasks compact courseFilter={course} dto={dto} onReload={saved} />
          </section>
          {visited.has('training') && <section hidden={folder !== 'training'}><h1>Gym logs</h1><StrengthLog dto={dto} onReload={saved} /></section>}
          {visited.has('manga')
            && <section hidden={folder !== 'manga'}>
              <h1>{folder === 'manga' ? selectedTitle ?? 'Manga' : 'Manga'}</h1>
              <Series
                terminal
                kind="manga"
                dto={dto}
                onReload={saved}
                detailId={folder === 'manga' ? detail : undefined}
                onOpen={id => open('manga', undefined, id)}
                onBack={() => open('manga')} />
            </section>}
          {visited.has('books')
            && <section hidden={folder !== 'books'}>
              <h1>{folder === 'books' ? selectedTitle ?? 'Books & light novels' : 'Books & light novels'}</h1>
              <Series
                terminal
                kind="book"
                dto={dto}
                onReload={saved}
                detailId={folder === 'books' ? detail : undefined}
                onOpen={id => open('books', undefined, id)}
                onBack={() => open('books')} />
            </section>}
        </div>
        <footer className="te-status" role="status">{receipt}<span>MANUAL INPUT / LOCAL SAVE</span></footer>
      </main>
      <RigContext dto={dto} folder={folder} onOpen={open} />
    </div>
  </div>;
}

function RigContext({ dto, folder, onOpen }: { dto: DashboardDTO; folder: Folder; onOpen: (folder: Folder, course?: string, id?: number) => void }) {
  const tasks = dto.schoolTasks.filter(t => !t.done).slice().sort((a,b) => a.deadline.localeCompare(b.deadline)).slice(0,3);
  const strength = dto.stats.strength;
  const reading = dto.series.filter(s => (folder === 'manga' ? s.type === 'manga' : s.type !== 'manga')
      && !s.finished).sort((a,b) => Number(b.reading)-Number(a.reading)).slice(
    0,
    3
  );
  return <aside className="te-instrument" aria-label="Folder context">
    <div className="te-instrument-port" aria-hidden="true"><i /><i /><i /><span /></div>
    <div className="te-instrument-body">
      <h2>{folder === 'school' ? 'DEADLINE FEED' : folder === 'training' ? 'POWER LINK' : 'READING QUEUE'}</h2>
      {folder === 'school'
        ? tasks.length
          ? tasks.map(t => <button
            key={t.id}
            onClick={() => onOpen('school', t.course ?? 'Unsorted')}>
            <time dateTime={t.deadline}>{t.deadline}</time>
            <strong>{t.title}</strong>
            <span>{t.overdue ? 'OVERDUE' : t.daysUntil === 0 ? 'DUE TODAY' : `${t.daysUntil} DAYS LEFT`} · {t.course ?? 'Unsorted'}</span>
          </button>)
          : <p>No open deadlines.</p>
        : folder === 'training' ? <>
        <div className="te-power-signal"><Icon name="strength" size={40} /><strong>LV {strength.level}</strong></div>
        <p>
          {strength.lastSessionDaysAgo == null
            ? 'No workout recorded yet.'
            : strength.lastSessionDaysAgo === 0 ? 'Last workout: today.' : `Last workout: ${strength.lastSessionDaysAgo} days ago.`}
        </p>
        <label>{strength.progressPct}% to next level<progress max={100} value={strength.progressPct} /></label>
        <p>Manual gym logs feed your Power progression.</p>
      </>
      : reading.length
        ? reading.map(item => <button
          key={item.id}
          onClick={() => onOpen(folder, undefined, item.id)}>
          <strong>{item.title}</strong>
          <span>{item.readCount} / {item.totalVolumesKnown ?? '?'} volumes read</span>
          {item.progressPct != null && <progress aria-label={`${item.title} reading progress`} max={100} value={item.progressPct} />}
        </button>)
        : <p>No unfinished titles in this folder.</p>}
    </div>
    <div className="te-hardware-label" aria-hidden="true">ARS / PERSONAL DECK<br /><span>HARDLINE CONNECTED</span></div>
  </aside>;
}
