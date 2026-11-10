import { useEffect, useState } from 'react';

/** True when the viewport is narrower than `threshold` px. Live-updates on resize.
 *  SSR-safe (defaults to false when there's no window). Shared across the app so every
 *  component uses the SAME breakpoints instead of redefining the hook locally. */
export function useNarrow(threshold = 1100): boolean {
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' ? window.innerWidth < threshold : false);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < threshold);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [threshold]);
  return narrow;
}

/** Phone-sized viewport (≤640px). iPhone 16 Pro Max portrait is ~430px, so this is true on a phone
 *  held upright and false in landscape / on tablet+ — the line where layouts switch to a single column. */
export function useMobile(): boolean {
  return useNarrow(640);
}
