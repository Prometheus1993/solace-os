import { DeskFallback } from './DeskFallback.tsx';

/** Home while there is no dashboard yet: the same box as the desk's loading placeholder, so the swap is invisible. */
export function LinkState({ offline }: { offline: boolean }) {
  return offline
    ? <DeskFallback><p>Server offline — start it with `npm run server`; this page retries every 30s.</p></DeskFallback>
    : <DeskFallback />;
}
