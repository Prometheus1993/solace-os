import type { DashboardDTO } from '@solace/core';
import { SubNav, useHashView } from './parts.tsx';
import { Dashboard } from '../Dashboard.tsx';
import { Running } from './Running.tsx';
import { Strength } from './Strength.tsx';
import { Body } from './Body.tsx';

type View = 'overview' | 'running' | 'strength' | 'vitals';
const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'STATUS' },
  { id: 'running', label: 'RUNS' },
  { id: 'strength', label: 'STRENGTH' },
  { id: 'vitals', label: 'VITALS' },
];
/** BODY area — the training views behind a segmented sub-nav (hash `#body/<view>`; the old `#training/…` ids still resolve). */
export function Training({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  const [view, setView] = useHashView('body', VIEWS, 'overview');
  return (
    <div>
      <SubNav views={VIEWS} view={view} setView={setView} />
      {view === 'overview' && <Dashboard data={dto} />}
      {view === 'running' && <Running dto={dto} />}
      {view === 'strength' && <Strength dto={dto} onReload={onReload} />}
      {view === 'vitals' && <Body dto={dto} onReload={onReload} />}
    </div>
  );
}
