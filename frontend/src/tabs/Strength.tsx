import type { DashboardDTO } from '@solace/core';
import { STAT_COLOR, fmtNum } from '../tokens.ts';
import { StatTile, TabShell, TileGrid } from './parts.tsx';
import { StrengthLog } from './StrengthLog.tsx';

/** What each breakdown tile means, in a few plain words. */
const TILE_SUB: Record<string, string> = {
  'Total lifted': 'every rep × kg you logged',
  'Best lifts': 'bench + squat + sumo, your best of each',
  'Lifts ÷ body weight': 'best lifts ÷ your lightest weight',
};

const lastSession = (days: number | null | undefined): string =>
  days == null ? 'No sessions yet' : days === 0 ? 'Last session today' : `Last session ${days} day${days === 1 ? '' : 's'} ago`;

export function Strength({ dto, onReload }: { dto: DashboardDTO; onReload: () => void | Promise<void> }) {
  const s = dto.stats.strength;
  return (
    <TabShell>
      <TileGrid>
        <StatTile label="Strength" value={`LV ${s.level}`} sub={lastSession(s.lastSessionDaysAgo)} color={STAT_COLOR.strength} />
        {s.breakdown.map((b) => (
          <StatTile key={b.label} label={b.label} value={`${fmtNum(b.value)} ${b.unit}`} sub={`${TILE_SUB[b.label] ?? ''} · ${b.level} pts`} />
        ))}
      </TileGrid>

      <StrengthLog dto={dto} onReload={onReload} />
    </TabShell>
  );
}
