import { canonicalHash, resolveArea } from '../../areas.ts';
import { viewFromHash } from '../../tabs/hash-view.ts';

/** The three folders of the desk terminal and the views inside each (the first view opens with the folder). */
export const TERMINAL_FOLDERS = [
  { id: 'body', label: 'BODY', views: [
    { id: 'overview', label: 'STATUS' },
    { id: 'running', label: 'RUNS' },
    { id: 'strength', label: 'STRENGTH' },
    { id: 'vitals', label: 'VITALS' },
  ] },
  { id: 'study', label: 'STUDY', views: [
    { id: 'school-term', label: 'SCHOOL TERM' },
    { id: 'exam-term', label: 'EXAM TERM' },
  ] },
  { id: 'shelf', label: 'SHELF', views: [
    { id: 'books', label: 'BOOKS' },
    { id: 'manga', label: 'MANGA' },
    { id: 'key', label: 'BOOKS KEY' },
  ] },
] as const;

export type TerminalFolder = typeof TERMINAL_FOLDERS[number]['id'];
export type TerminalTarget = { folder: TerminalFolder; view: string; seriesId?: number };

const folderDef = (folder: TerminalFolder) => TERMINAL_FOLDERS.find((f) => f.id === folder)!;

/** The terminal target a hash names (`#body/vitals`, `#shelf/manga/12`, any older alias); null for the desk, an unknown hash or nothing. */
export function parseTerminalHash(hash: string): TerminalTarget | null {
  const [first = '', , third] = hash.replace(/^#/, '').split('/');
  const area = resolveArea(first);
  if (area === null || area === 'desk') return null;
  const views = folderDef(area).views;
  const view = viewFromHash(hash, views, views[0].id);
  const seriesId = (view === 'books' || view === 'manga') && third && /^\d+$/.test(third) ? Number(third) : undefined;
  return seriesId === undefined ? { folder: area, view } : { folder: area, view, seriesId };
}

/** The hash (no `#`) that opens a target. */
export const terminalHash = (t: TerminalTarget): string => `${t.folder}/${t.view}${t.seriesId === undefined ? '' : `/${t.seriesId}`}`;

/** An old or loose hash rewritten to its canonical form (`training/body` -> `body/vitals`, `home` -> `desk`); unknown hashes stay as they are. */
export function canonicalRoute(hash: string): string {
  const target = parseTerminalHash(hash);
  return target ? terminalHash(target) : canonicalHash(hash);
}
