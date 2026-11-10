import { Component, lazy, Suspense, type ReactNode } from 'react';
import { DeskFallback } from './home/DeskFallback.tsx';
import type { DesktopHubProps } from './home/desk/DesktopHub.tsx';

const loadDesk = () => import('./home/desk/DesktopHub.tsx');
const Desktop = lazy(loadDesk);

/** Start fetching the desk chunk early (same import as `lazy`, so it is fetched once). */
export function preloadDesk() { void loadDesk().catch(() => undefined); }

class DeskBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <DeskFallback><p>The desk failed to load.</p><button className="yorha-btn parts-button" onClick={() => location.reload()}>Reload</button></DeskFallback>
      : this.props.children;
  }
}

/** Fixed desktop hub. The desk chunk is lazy: a backdrop-matching placeholder shows while it loads, a reload screen if it fails. */
export function Home(props: DesktopHubProps) {
  return <DeskBoundary><Suspense fallback={<DeskFallback />}>
    <Desktop {...props} />
  </Suspense></DeskBoundary>;
}
