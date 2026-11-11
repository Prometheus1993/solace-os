import { describe, expect, it } from 'vitest';
import { decideStart, findNode22Bin, isSolaceApi, isSolaceWeb, portsFromEnv, probe, type FsLike } from '../src/services.ts';

const fakeFs = (paths: string[], dirs: Record<string, string[]> = {}): FsLike => ({
  exists: (path) => paths.includes(path),
  list: (dir) => dirs[dir] ?? [],
});

describe('decideStart', () => {
  it('reuses a running Solace, starts on a free port, refuses a foreign program', () => {
    expect(decideStart('solace')).toBe('reuse');
    expect(decideStart('free')).toBe('start');
    expect(decideStart('foreign')).toBe('conflict');
  });
});

describe('isSolaceApi', () => {
  it('accepts a dashboard-shaped JSON body', () => {
    expect(isSolaceApi(JSON.stringify({ generatedAt: '2026-01-01T00:00:00Z', missions: [], lifeSimSummary: {} }))).toBe(true);
  });
  it('accepts the "Not seeded" answer of an empty database', () => {
    expect(isSolaceApi(JSON.stringify({ error: 'Not seeded — drop your export files to begin.' }))).toBe(true);
  });
  it('rejects other JSON, non-objects and non-JSON', () => {
    expect(isSolaceApi(JSON.stringify({ error: 'not found' }))).toBe(false);
    expect(isSolaceApi('null')).toBe(false);
    expect(isSolaceApi('<html></html>')).toBe(false);
  });
});

describe('isSolaceWeb', () => {
  it('recognises the Solace index.html by its title', () => {
    expect(isSolaceWeb('<head><title>Solace — Personal OS</title></head>')).toBe(true);
    expect(isSolaceWeb('<head><title>Another app</title></head>')).toBe(false);
  });
});

describe('probe', () => {
  const answer = (body: string) => async () => ({ text: async () => body });
  it('is "solace" when the answer passes the check', async () => {
    expect(await probe(answer('<title>Solace</title>'), 'http://x/', isSolaceWeb)).toBe('solace');
  });
  it('is "foreign" when something else answers', async () => {
    expect(await probe(answer('hello'), 'http://x/', isSolaceWeb)).toBe('foreign');
  });
  it('is "free" when nothing answers', async () => {
    const refused = async (): Promise<never> => {
      throw new Error('ECONNREFUSED');
    };
    expect(await probe(refused, 'http://x/', isSolaceWeb)).toBe('free');
  });
});

describe('portsFromEnv', () => {
  it('defaults to the npm start ports', () => {
    expect(portsFromEnv({})).toEqual({ api: 8787, web: 5174 });
  });
  it('reads PORT and SOLACE_WEB_PORT', () => {
    expect(portsFromEnv({ PORT: '8799', SOLACE_WEB_PORT: '5175' })).toEqual({ api: 8799, web: 5175 });
  });
});

describe('findNode22Bin', () => {
  const keg = '/opt/homebrew/opt/node@22/bin';
  const nvm = '/home/u/.nvm/versions/node';
  it('prefers the Homebrew keg', () => {
    expect(findNode22Bin('/home/u', fakeFs([`${keg}/node`], { [nvm]: ['v22.1.0'] }))).toBe(keg);
  });
  it('falls back to the newest nvm v22, compared numerically', () => {
    const fs = fakeFs([`${nvm}/v22.10.0/bin/node`, `${nvm}/v22.9.1/bin/node`], { [nvm]: ['v20.5.0', 'v22.9.1', 'v22.10.0', 'v24.0.0'] });
    expect(findNode22Bin('/home/u', fs)).toBe(`${nvm}/v22.10.0/bin`);
  });
  it('is null without any Node 22', () => {
    expect(findNode22Bin('/home/u', fakeFs([], { [nvm]: ['v20.5.0'] }))).toBeNull();
    expect(findNode22Bin('/home/u', fakeFs([]))).toBeNull();
  });
});
