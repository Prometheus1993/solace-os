import { createHash, randomBytes } from 'node:crypto';

// Pure Spotify login helpers (Authorization Code with PKCE, no client secret). No Electron, no I/O: spotify.ts does that.

export const SPOTIFY_SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing'];
/** Spotify forbids `localhost` in redirect URIs; the user registers one per web port. */
export const redirectUri = (webPort: number): string => `http://127.0.0.1:${webPort}/spotify-callback`;
/** Refresh this long before the access token runs out. */
const REFRESH_MARGIN_MS = 60_000;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

/** A PKCE verifier (86 URL-safe characters) and its S256 challenge. */
export function newPkce(bytes: Buffer = randomBytes(64)): { verifier: string; challenge: string } {
  const verifier = bytes.toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizeUrl(a: { clientId: string; redirect: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: a.clientId,
    response_type: 'code',
    redirect_uri: a.redirect,
    code_challenge_method: 'S256',
    code_challenge: a.challenge,
    state: a.state,
    scope: SPOTIFY_SCOPES.join(' '),
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}

/** The code from the redirect, or null when this URL is not the redirect (or the state or the code is wrong, or Spotify said no). */
export function codeFromRedirect(url: string, redirect: string, state: string): string | null {
  if (!url.startsWith(redirect)) return null;
  const q = new URL(url).searchParams;
  return q.get('state') === state ? q.get('code') : null;
}

export const isRedirect = (url: string, redirect: string): boolean => url.startsWith(redirect);

export const codeExchangeBody = (a: { clientId: string; code: string; redirect: string; verifier: string }): URLSearchParams =>
  new URLSearchParams({ grant_type: 'authorization_code', code: a.code, redirect_uri: a.redirect, client_id: a.clientId, code_verifier: a.verifier });

export const refreshBody = (clientId: string, refreshToken: string): URLSearchParams =>
  new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });

/** Tokens from a token-endpoint answer. A refresh answer may omit the refresh token: then the old one stays. */
export function acceptTokens(response: unknown, previousRefresh: string | null, nowMs: number): StoredTokens | null {
  if (typeof response !== 'object' || response === null) return null;
  const r = response as Record<string, unknown>;
  const refreshToken = typeof r['refresh_token'] === 'string' && r['refresh_token'] !== '' ? r['refresh_token'] : previousRefresh;
  if (typeof r['access_token'] !== 'string' || typeof r['expires_in'] !== 'number' || refreshToken === null) return null;
  return { accessToken: r['access_token'], refreshToken, expiresAt: nowMs + r['expires_in'] * 1000 };
}

export const needsRefresh = (tokens: StoredTokens, nowMs: number): boolean => nowMs >= tokens.expiresAt - REFRESH_MARGIN_MS;

/** Tokens from the saved file's text; a missing or unreadable file means "not logged in". */
export function parseStoredTokens(text: string | null): StoredTokens | null {
  if (text === null) return null;
  try {
    const r = JSON.parse(text) as Record<string, unknown>;
    if (typeof r['accessToken'] === 'string' && typeof r['refreshToken'] === 'string' && typeof r['expiresAt'] === 'number') {
      return { accessToken: r['accessToken'], refreshToken: r['refreshToken'], expiresAt: r['expiresAt'] };
    }
  } catch {
    // unreadable file: log in again
  }
  return null;
}

/** The only requests the page may relay to Spotify: player endpoints, exact shape (no dots or slashes that fetch could normalise away). */
export function isPlayerRequest(method: unknown, path: unknown): boolean {
  return (
    (method === 'GET' || method === 'PUT' || method === 'POST') &&
    typeof path === 'string' &&
    /^\/v1\/me\/player(\/[a-z-]+)*(\?[A-Za-z0-9_=&%.,:-]*)?$/.test(path)
  );
}
