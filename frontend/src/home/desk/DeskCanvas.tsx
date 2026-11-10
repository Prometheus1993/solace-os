import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DESK_CANVAS, fitDeskCanvas } from './desk-canvas.ts';

export function DeskCanvas({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setScale(fitDeskCanvas(element.clientWidth, element.clientHeight).scale);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const style = {
    '--desk-w': `${DESK_CANVAS.width}px`,
    '--desk-h': `${DESK_CANVAS.height}px`,
    '--desk-scene-scale': scale || 1,
    visibility: scale > 0 ? 'visible' : 'hidden'
  } as CSSProperties;
  return <div ref={viewport} className="desk-scene-viewport"><div className="desk-stage" style={style}>{children}</div></div>;
}
