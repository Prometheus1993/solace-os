export type Area = 'home' | 'training' | 'school' | 'archives';

export const AREAS: { id: Area; label: string }[] = [
  { id: 'home', label: 'HOME' },
  { id: 'training', label: 'COMBAT' },
  { id: 'school', label: 'MISSIONS' },
  { id: 'archives', label: 'ARCHIVES' },
];

/** Mobile-first bottom tab bar (4 areas). Active item = YoRHa inversion. ≥44px targets, thumb zone. */
export function BottomNav({ area, setArea }: { area: Area; setArea: (a: Area) => void }) {
  return (
    <nav className="bn-nav">
      {AREAS.map((a) => {
        const active = a.id === area;
        return (
          <button
            key={a.id}
            aria-selected={active}
            onClick={() => setArea(a.id)}
            className={`bn-item${active ? ' is-active' : ''}`}
          >
            {a.label}
          </button>
        );
      })}
    </nav>
  );
}
