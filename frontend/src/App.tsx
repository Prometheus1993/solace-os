import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardDTO } from '@solace/core';
import { CommandBar } from './CommandBar.tsx';
import { BottomNav, type Area } from './BottomNav.tsx';
import { useMobile } from './responsive.ts';

type Source = 'loading' | 'live' | 'offline';
import { Home, preloadDesk } from './Home.tsx';
import { LinkState } from './home/LinkState.tsx';
import { StartScreen } from './StartScreen.tsx';
import { createEntryState, entryHash } from './start-state.ts';
import { Training } from './tabs/Training.tsx';
import { School } from './tabs/School.tsx';
import { Archives } from './tabs/Archives.tsx';
import { FxOverlay } from './FxOverlay.tsx';
import { C, cssVars } from './tokens.ts';
import type { SolaceSpotify } from './home/desk/spotify-api.ts';

type Toast = { msg: string; tone: 'info' | 'ok' | 'err' } | null;
declare global {
  interface Window {
    /** Present only inside the Mac app (desktop/src/preload.cjs). */
    solaceDesktop?: { garminAuthExpired(): void; spotify: SolaceSpotify };
  }
}
interface SyncResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  summary?: { runsImported: number; recoveryDaysWritten: number; wellnessDays: string[] };
}

const AREA_IDS: Area[] = ['home', 'training', 'school', 'archives'];
const areaFromHash = (): Area => {
  const a = window.location.hash.replace('#', '').split('/')[0];
  return (AREA_IDS.includes(a as Area) ? a : 'home') as Area;
};

const entryState = createEntryState(() => window.sessionStorage);

export function App() {
  const [entered, setEntered] = useState(() => entryState.hasEntered());
  const [fadeIn, setFadeIn] = useState(false);
  const focusPending = useRef(false);
  const [dto, setDto] = useState<DashboardDTO | null>(null);
  const [source, setSource] = useState<Source>('loading');
  const dtoRef = useRef<DashboardDTO | null>(null);
  const loadSeqRef = useRef(0); // monotonic id so a slow earlier /api/dashboard can't overwrite fresher state
  const [area, setAreaState] = useState<Area>(areaFromHash);
  const setArea = (a: Area) => {
    setAreaState(a);
    window.location.hash = a;
  };
  const mobile = useMobile();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  // Single auto-dismiss timer for toasts: clear the previous one before each new toast so a
  // stale timer can't blank a newer toast.
  const toastTimer = useRef<number | null>(null);
  const clearToastTimer = () => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
  };
  const dismissToastAfter = (ms: number) => {
    clearToastTimer();
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, ms);
  };

  // Keep `area` in sync with the hash (back/forward + the Training sub-nav writing `training/<view>`).
  useEffect(() => {
    const onHash = () => setAreaState(areaFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadDashboard = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      const r = await fetch('/api/dashboard');
      if (!r.ok) throw new Error(String(r.status));
      const next = (await r.json()) as DashboardDTO;
      if (seq !== loadSeqRef.current) return; // a newer load started while this was in flight — drop the stale result
      dtoRef.current = next;
      setDto(next);
      setSource('live');
    } catch {
      if (seq !== loadSeqRef.current) return;
      // Initial load with no server → the offline state (the 30s poll retries). A failed POLL keeps
      // the last good data on screen (don't flip live → offline on a transient hiccup).
      if (!dtoRef.current) setSource('offline');
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Live without a manual reload: poll every 30s (paused when hidden) + refetch on focus.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void loadDashboard();
    };
    const id = window.setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [loadDashboard]);

  // Garmin sync from the dashboard: hit the server's POST /api/sync-garmin, then refresh. Shows a busy-bar + toast.
  const syncGarmin = useCallback(async () => {
    if (busy || syncing) return;
    clearToastTimer();
    setSyncing(true);
    setBusy(true);
    setToast({ msg: 'Syncing Garmin… (pulling runs + wellness)', tone: 'info' });
    const holdMs = 7000;
    try {
      const res = await fetch('/api/sync-garmin', { method: 'POST' });
      const j = (await res.json()) as SyncResponse;
      if (res.ok && j.ok && j.summary) {
        await loadDashboard();
        const s = j.summary;
        const runWord = s.runsImported === 1 ? 'run' : 'runs';
        const dayWord = s.recoveryDaysWritten === 1 ? 'day' : 'days';
        setToast({ msg: `Garmin synced · ${s.runsImported} new ${runWord} · ${s.recoveryDaysWritten} wellness ${dayWord}`, tone: 'ok' });
      } else if (j.error === 'busy') {
        setToast({ msg: 'A Garmin sync is already running.', tone: 'info' });
      } else if (j.error === 'auth') {
        window.solaceDesktop?.garminAuthExpired();
        setToast({ msg: 'Garmin login expired — run: uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp@0.1.0 garmin-mcp-auth --force-reauth', tone: 'err' });
      } else {
        setToast({ msg: `Sync failed — ${j.message ?? j.error ?? 'unknown error'}`, tone: 'err' });
      }
    } catch (e) {
      setToast({ msg: `Sync failed — ${String(e)}`, tone: 'err' });
    } finally {
      setSyncing(false);
      setBusy(false);
      dismissToastAfter(holdMs);
    }
  }, [busy, syncing, loadDashboard]);

  // Start fetching the desk chunk as soon as the user has entered, in parallel with /api/dashboard.
  useEffect(() => { if (entered) preloadDesk(); }, [entered]);

  // After "jack in": focus the desk (or the area's main) once it exists. The desk chunk is lazy, so poll briefly.
  useEffect(() => {
    if (!entered || !dto || !focusPending.current) return;
    const focusNow = () => {
      const el = document.querySelector<HTMLElement>('.desktop-hub, main');
      if (!el) return false;
      el.tabIndex = -1;
      el.focus({ preventScroll: true });
      focusPending.current = false;
      return true;
    };
    if (focusNow()) return;
    let tries = 0;
    const id = window.setInterval(() => {
      if (focusNow() || ++tries >= 50) { window.clearInterval(id); focusPending.current = false; }
    }, 100);
    return () => window.clearInterval(id);
  }, [entered, dto, area]);

  const enter = useCallback(() => {
    entryState.markEntered();
    const dest = entryHash(window.location.hash, AREA_IDS); // keep a valid deep link; never overwrite it with #home
    if (window.location.hash !== `#${dest}`) window.location.hash = dest;
    focusPending.current = true;
    setEntered(true);
    // reduced-motion intentionally ignored
    setFadeIn(true);
    window.setTimeout(() => setFadeIn(false), 200);
  }, []);

  if (!entered) return <StartScreen onEnter={enter} />;

  if (!dto && area === 'home') return <LinkState offline={source === 'offline'} />;

  if (!dto) {
    return (
      <div className="app-loading">
        {source === 'offline' ? 'Server offline — start it with `npm run server`; this page retries every 30s.' : 'Loading…'}
      </div>
    );
  }

  const toneColor = toast?.tone === 'ok' ? C.ok : toast?.tone === 'err' ? C.danger : C.gold;

  return (
    <div className={`app-root${fadeIn ? ' ss-fade-in' : ''}`}>
      {/* HOME is the desk and brings its own chrome, so the old shell (CommandBar, BottomNav) is for the other areas only. */}
      {area === 'home' ? (
        <Home onReload={loadDashboard} dto={dto} syncing={syncing} busy={busy} onSyncGarmin={() => void syncGarmin()} />
      ) : (
        <>
          <CommandBar area={area} setArea={setArea} totals={dto.totals} dataFreshness={dto.dataFreshness} onSyncGarmin={() => void syncGarmin()} syncing={syncing} />

          <main className={mobile ? 'app-main is-mobile' : 'app-main'}>
            {area === 'training' && <Training dto={dto} onReload={loadDashboard} />}
            {area === 'school' && <School dto={dto} onReload={loadDashboard} />}
            {area === 'archives' && <Archives dto={dto} onReload={loadDashboard} />}
          </main>

          {mobile && <BottomNav area={area} setArea={setArea} />}
        </>
      )}

      {busy && <div className="app-busy-bar" />}
      {toast && <div className={area === 'home' ? 'app-toast nh-toast' : 'app-toast'} data-tone={toast.tone} style={{ ...cssVars({ '--toast-tone': toneColor }), bottom: overlayBottom(mobile) }}>{toast.msg}</div>}
      <FxOverlay events={dto.levelEvents} />
    </div>
  );
}

// The BottomNav only exists on mobile now (desktop shell = CommandBar): the toast sits
// above it there, and near the true viewport bottom on desktop. Main's clearance is via .app-main.is-mobile.
const overlayBottom = (mobile: boolean): string | number => (mobile ? 'calc(70px + env(safe-area-inset-bottom))' : 24);
