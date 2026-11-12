import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  acceptTokens, authorizeUrl, codeExchangeBody, codeFromRedirect, isPlayerRequest, needsRefresh, newPkce, parseStoredTokens, redirectUri, refreshBody,
} from '../src/spotify-auth.ts';

const redirect = redirectUri(5175);

describe('PKCE and the authorize URL', () => {
  it('the challenge is the S256 of the verifier, both URL-safe and within Spotify\'s length', () => {
    const { verifier, challenge } = newPkce(Buffer.alloc(64, 7));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
  it('asks for the three playback scopes with PKCE and the 127.0.0.1 redirect', () => {
    const url = new URL(authorizeUrl({ clientId: 'cid', redirect, challenge: 'abc', state: 's1' }));
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid', response_type: 'code', redirect_uri: 'http://127.0.0.1:5175/spotify-callback', code_challenge_method: 'S256',
      code_challenge: 'abc', state: 's1', scope: 'user-read-playback-state user-modify-playback-state user-read-currently-playing',
    });
  });
});

describe('the redirect', () => {
  it('returns the code only for the right state', () => {
    expect(codeFromRedirect(`${redirect}?code=XYZ&state=s1`, redirect, 's1')).toBe('XYZ');
    expect(codeFromRedirect(`${redirect}?code=XYZ&state=other`, redirect, 's1')).toBeNull();
    expect(codeFromRedirect(`${redirect}?error=access_denied&state=s1`, redirect, 's1')).toBeNull();
    expect(codeFromRedirect('https://accounts.spotify.com/login', redirect, 's1')).toBeNull();
  });
  it('builds the token request bodies', () => {
    expect(Object.fromEntries(codeExchangeBody({ clientId: 'cid', code: 'c', redirect, verifier: 'v' }))).toEqual({
      grant_type: 'authorization_code', code: 'c', redirect_uri: redirect, client_id: 'cid', code_verifier: 'v',
    });
    expect(Object.fromEntries(refreshBody('cid', 'r'))).toEqual({ grant_type: 'refresh_token', refresh_token: 'r', client_id: 'cid' });
  });
});

describe('tokens', () => {
  it('stores a returned refresh token and keeps the old one when the answer has none', () => {
    expect(acceptTokens({ access_token: 'a', refresh_token: 'new', expires_in: 3600 }, 'old', 1000)).toEqual({ accessToken: 'a', refreshToken: 'new', expiresAt: 3_601_000 });
    expect(acceptTokens({ access_token: 'a', expires_in: 3600 }, 'old', 1000)?.refreshToken).toBe('old');
    expect(acceptTokens({ access_token: 'a', expires_in: 3600 }, null, 1000)).toBeNull();
    expect(acceptTokens({ error: 'invalid_grant' }, 'old', 1000)).toBeNull();
    expect(acceptTokens('nope', 'old', 1000)).toBeNull();
  });
  it('refreshes one minute before expiry', () => {
    const t = { accessToken: 'a', refreshToken: 'r', expiresAt: 100_000 };
    expect(needsRefresh(t, 39_999)).toBe(false);
    expect(needsRefresh(t, 40_000)).toBe(true);
    expect(needsRefresh(t, 200_000)).toBe(true);
  });
  it('reads the saved file or says "not logged in"', () => {
    const t = { accessToken: 'a', refreshToken: 'r', expiresAt: 5 };
    expect(parseStoredTokens(JSON.stringify(t))).toEqual(t);
    expect(parseStoredTokens(null)).toBeNull();
    expect(parseStoredTokens('not json')).toBeNull();
    expect(parseStoredTokens('{"accessToken":1}')).toBeNull();
  });
});

describe('isPlayerRequest', () => {
  it('allows the player paths the desk builds', () => {
    for (const [m, p] of [
      ['GET', '/v1/me/player'], ['GET', '/v1/me/player/devices'], ['GET', '/v1/me/player/currently-playing'],
      ['PUT', '/v1/me/player/play'], ['PUT', '/v1/me/player/play?device_id=abc123DEF'], ['PUT', '/v1/me/player/play?device_id=a%20b'],
      ['PUT', '/v1/me/player/pause'], ['POST', '/v1/me/player/next'], ['PUT', '/v1/me/player/volume?volume_percent=40'],
    ]) expect(isPlayerRequest(m, p), `${m} ${p}`).toBe(true);
  });
  it('rejects traversal, other hosts, other methods and non-strings', () => {
    for (const p of [
      '/v1/me', '/v1/me/player/../../me', '/v1/me/player/%2e%2e/%2e%2e/me', '/v1/me/player\\..\\me',
      'https://evil.example/v1/me/player', '//evil.example/v1/me/player', '/v1/me/playerx', '/v1/me/player/Play',
    ]) expect(isPlayerRequest('GET', p), p).toBe(false);
    expect(isPlayerRequest('DELETE', '/v1/me/player')).toBe(false);
    expect(isPlayerRequest('GET', 42)).toBe(false);
    expect(isPlayerRequest('GET', undefined)).toBe(false);
    expect(isPlayerRequest(undefined, '/v1/me/player')).toBe(false);
  });
});
