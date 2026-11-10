/** Go to an app hash route (`'training/running'`, `'home'`). Writes the FULL nested hash and lets
 *  App's `hashchange` listener update the area, so a nested view is never overwritten by `setArea`.
 *  Back/forward work because every call adds a history entry (a no-op when already there). */
export function navigate(hash: string): void {
  if (window.location.hash !== `#${hash}`) window.location.hash = hash;
}
