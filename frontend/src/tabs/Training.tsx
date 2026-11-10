import type { DashboardDTO } from '@solace/core';
import { SubNav, useHashView } from './parts.tsx';
import { Dashboard } from '../Dashboard.tsx';
import { Running } from './Running.tsx';
import { Strength } from './Strength.tsx';
import { Body } from './Body.tsx';

type View = 'overview' | 'running' | 'strength' | 'body';
const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'STATUS' },
  { id: 'running', label: 'RUNS' },
  { id: 'strength', label: 'STRENGTH' },
  { id: 'body', label: 'VITALS' },
];
/** COMBAT area — the existing training views behind a YoRHa segmented sub-nav (hash `#training/<view>`). */
export function Training({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  const [view, setView] = useHashView('training', VIEWS, 'overview');
  return (
    <div>
      <SubNav views={VIEWS} view={view} setView={setView} />
      {view === 'overview' && <Dashboard data={dto} />}
      {view === 'running' && <Running dto={dto} />}
      {view === 'strength' && <Strength dto={dto} onReload={onReload} />}
      {view === 'body' && <Body dto={dto} onReload={onReload} />}
    </div>
  );
}
