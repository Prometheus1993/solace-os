import type { DashboardDTO } from '@solace/core';
import { SubNav, useHashView } from './parts.tsx';
import { Missions } from './Missions.tsx';
import { SchoolTasks } from './SchoolTasks.tsx';

type View = 'school-term' | 'exam-term';
const VIEWS: { id: View; label: string }[] = [
  { id: 'school-term', label: 'SCHOOL TERM' },
  { id: 'exam-term', label: 'EXAM TERM' },
];
/** MISSIONS area — SCHOOL TERM (school tasks & deadlines: assignments, company visits; the default
 *  view) and EXAM TERM (the exam/resit board, `Missions.tsx`) behind a YoRHa segmented sub-nav
 *  (hash `#school/<view>`). `App.tsx`'s `areaFromHash` only reads the FIRST hash segment, so the
 *  sub-view is owned here by `useHashView`; a stale/unknown sub-view hash (e.g. the old
 *  `#school/missions`) falls back to the default view; the old Dutch ids are aliased in `hash-view.ts`. */
export function School({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  const [view, setView] = useHashView('school', VIEWS, 'school-term');
  return (
    <div>
      <SubNav views={VIEWS} view={view} setView={setView} />
      {view === 'school-term' && <SchoolTasks dto={dto} onReload={onReload} />}
      {view === 'exam-term' && <Missions dto={dto} onReload={onReload} />}
    </div>
  );
}
