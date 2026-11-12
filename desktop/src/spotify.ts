import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BrowserWindow, ipcMain, shell } from 'electron';
import {
  acceptTokens, authorizeUrl, codeExchangeBody, codeFromRedirect, isPlayerRequest, isRedirect, needsRefresh, newPkce, parseStoredTokens, redirectUri, refreshBody,
  type StoredTokens,
} from './spotify-auth.ts';

// The desk radio's Spotify connection. The login window, the tokens and every call to Spotify live here in the main
// process, so the web page never sees a token (and the token endpoint needs no CORS). The page only asks for the
// player calls it needs, through preload.cjs. Tokens: <userData>/spotify.json, readable by this user only. Never logged.

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com';

export function registerSpotify(options: { clientId: string | undefined; webPort: number; userData: string }): void {
  const { clientId, webPort } = options;
  const redirect = redirectUri(webPort);
  const tokenFile = join(options.userData, 'spotify.json');
  let tokens = parseStoredTokens(existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8') : null);

  const save = (next: StoredTokens | null): void => {
    tokens = next;
    if (next === null) {
      rmSync(tokenFile, { force: true });
      return;
    }
    mkdirSync(dirname(tokenFile), { recursive: true });
    writeFileSync(tokenFile, JSON.stringify(next), { mode: 0o600 });
  };

  async function tokenRequest(body: URLSearchParams, previousRefresh: string | null): Promise<StoredTokens | null> {
    const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (res.status >= 500) throw new Error('Spotify is unavailable');
    return acceptTokens(await res.json().catch(() => null), previousRefresh, Date.now());
  }

  /** A fresh access token, or null when there is no login (or Spotify refused the refresh: then the login is dropped). */
  async function accessToken(): Promise<string | null> {
    if (tokens === null || clientId === undefined) return null;
    if (needsRefresh(tokens, Date.now())) {
      const refreshed = await tokenRequest(refreshBody(clientId, tokens.refreshToken), tokens.refreshToken).catch(() => undefined);
      if (refreshed === undefined) return null; // network trouble: keep the login, try again on the next call
      save(refreshed);
      return refreshed?.accessToken ?? null;
    }
    return tokens.accessToken;
  }

  /** Opens Spotify's own login page in a small window and resolves once the redirect carries a code (or the window closes). */
  function login(): Promise<boolean> {
    if (clientId === undefined) return Promise.resolve(false);
    const { verifier, challenge } = newPkce();
    const state = randomBytes(16).toString('hex');
    const url = authorizeUrl({ clientId, redirect, challenge, state });
    console.log(`[solace] spotify login: ${url.replace(clientId, '<client-id>')}`);
    return new Promise((resolve) => {
      const win = new BrowserWindow({ width: 480, height: 740, title: 'Spotify login', autoHideMenuBar: true });
      let done = false;
      const finish = (ok: boolean): void => {
        if (done) return;
        done = true;
        resolve(ok);
        if (!win.isDestroyed()) win.close();
      };
      const onNavigate = (event: { preventDefault(): void }, target: string): void => {
        if (!isRedirect(target, redirect)) return;
        event.preventDefault(); // the redirect page itself is never loaded
        const code = codeFromRedirect(target, redirect, state);
        if (code === null) return finish(false);
        void tokenRequest(codeExchangeBody({ clientId, code, redirect, verifier }), null)
          .then((next) => {
            if (next !== null) save(next);
            finish(next !== null);
          })
          .catch(() => finish(false));
      };
      win.webContents.on('will-redirect', onNavigate);
      win.webContents.on('will-navigate', onNavigate);
      win.on('closed', () => finish(false));
      void win.loadURL(url);
    });
  }

  ipcMain.handle('spotify-status', () => ({ configured: clientId !== undefined, connected: tokens !== null }));
  ipcMain.handle('spotify-login', async () => ({ connected: await login() }));
  ipcMain.handle('spotify-logout', () => save(null));
  ipcMain.handle('spotify-open-app', () => shell.openExternal('spotify:'));
  ipcMain.handle('spotify-request', async (_event, req: { method: string; path: string; body?: unknown }) => {
    // The page may only reach the player endpoints.
    if (!isPlayerRequest(req.method, req.path)) return { status: 400, body: null };
    const token = await accessToken();
    if (token === null) return { status: 401, body: null };
    const res = await fetch(`${API}${req.path}`, {
      method: req.method,
      ...(req.body === undefined
        ? { headers: { Authorization: `Bearer ${token}` } }
        : { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  });
}
