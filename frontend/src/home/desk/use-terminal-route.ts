import { useEffect, useState } from 'react';
import { parseTerminalHash, type TerminalTarget } from './terminal-route.ts';

/** The terminal target the URL hash names right now (null = the terminal is closed). Following `hashchange` makes the hash the one
 *  source of truth, so back/forward, old bookmarks and in-app links all open the terminal the same way. */
export function useTerminalRoute(): TerminalTarget | null {
  const [target, setTarget] = useState(() => parseTerminalHash(window.location.hash));
  useEffect(() => {
    const update = () => setTarget(parseTerminalHash(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return target;
}
