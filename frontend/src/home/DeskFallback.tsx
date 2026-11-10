import type { ReactNode } from 'react';

/** The one box shown in place of the desk: no children = loading (blank backdrop, screen-reader label only), children = a centred message. */
export function DeskFallback({ children }: { children?: ReactNode }) {
  return children
    ? <div className="desk-fallback desk-fallback-error" aria-live="polite">{children}</div>
    : <div className="desk-fallback" aria-busy="true"><span className="desk-fallback-label">Loading desk</span></div>;
}
