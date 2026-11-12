import { AREAS, type Area } from './areas.ts';

/** Mobile-first bottom tab bar (4 areas): icon over caption, the active cell takes cyan and a top bar. ≥44px targets, thumb zone. */
export function BottomNav({ area, setArea }: { area: Area; setArea: (a: Area) => void }) {
  return (
    <nav className="bn-nav">
      {AREAS.map((a) => {
        const active = a.id === area;
        return (
          <button
            key={a.id}
            aria-current={active ? 'page' : undefined}
            onClick={() => setArea(a.id)}
            className={`bn-item${active ? ' is-active' : ''}`}
          >
            <span className={`area-icon area-icon--${a.id}`} aria-hidden="true" />
            {a.label}
          </button>
        );
      })}
    </nav>
  );
}
