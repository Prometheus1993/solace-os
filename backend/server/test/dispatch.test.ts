import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_CONFIG, type Clock, type UnixSeconds } from '@solace/core';
import { GarminSyncError, migrate, openDatabase, SqliteRepository, type OpenMeteoClient, type syncGarmin } from '@solace/data';
import type { Deps } from '../src/deps.ts';
import { archivesRoutes } from '../src/routes/archives.ts';
import { trainingRoutes } from '../src/routes/training.ts';
import { BadRequest, dispatch, isLoopbackBind, mergeRoutes, type GuardOptions, type Routes } from '../src/http.ts';
import { createSyncRunner } from '../src/sync-runner.ts';

// In-process pins for the route table's structural guarantees (the end-to-end behaviour of each route is in
// server-validation.test.ts). No server process, no DB.

const fakeRes = () => {
  const out = { status: 0, body: undefined as unknown, done: Promise.resolve() };
  let finish = () => {};
  out.done = new Promise<void>((r) => (finish = r));
  const res = {
    headersSent: false,
    statusCode: 0,
    setHeader: () => {},
    end(text: string) {
      out.status = this.statusCode;
      out.body = JSON.parse(text);
      this.headersSent = true;
      finish();
    },
  };
  return { res: res as unknown as ServerResponse, out };
};

const call = async (routes: Routes, method: string, url: string) => {
  const { res, out } = fakeRes();
  dispatch(routes, { method, url, headers: {} } as IncomingMessage, res);
  await out.done;
  return out;
};

const hit = (label: string) => async ({ res }: { res: ServerResponse }) => {
  res.statusCode = 200;
  res.end(JSON.stringify({ label }));
};

const routes: Routes = { '/api/items': { GET: hit('items-get'), DELETE: hit('items-delete') } };

describe('dispatch', () => {
  it('matches the exact pathname, with or without a query string', async () => {
    expect((await call(routes, 'DELETE', '/api/items?id=5')).body).toEqual({ label: 'items-delete' });
    expect((await call(routes, 'GET', '/api/items')).body).toEqual({ label: 'items-get' });
  });

  it('never lets a longer path, a sub-path, or a trailing slash reach a route (the prefix-match data-loss bug)', async () => {
    for (const url of ['/api/items-lookup?id=5', '/api/itemsx', '/api/items/5', '/api/items/', '/api/item']) {
      expect({ url, status: (await call(routes, 'DELETE', url)).status }).toEqual({ url, status: 404 });
    }
  });

  it('is a 404 for a method the path does not define, and for inherited object keys', async () => {
    expect((await call(routes, 'POST', '/api/items')).status).toBe(404);
    expect((await call(routes, 'GET', '/__proto__')).status).toBe(404);
    expect((await call(routes, 'GET', '/constructor')).status).toBe(404);
  });

  it('maps a thrown BadRequest to 400 with its message, anything else to a generic 500', async () => {
    const failing: Routes = {
      '/bad': { POST: () => Promise.reject(new BadRequest('need a title')) },
      '/boom': { POST: () => Promise.reject(new Error('/Users/secret/path.sqlite is locked')) },
    };
    expect(await call(failing, 'POST', '/bad')).toMatchObject({ status: 400, body: { error: 'need a title' } });
    const boom = await call(failing, 'POST', '/boom');
    expect(boom).toMatchObject({ status: 500, body: { error: 'internal error' } });
    expect(JSON.stringify(boom.body)).not.toContain('secret');
  });

  it('refuses to boot with the same path in two route tables', () => {
    expect(() => mergeRoutes(routes, { '/api/items': { POST: hit('dupe') } })).toThrow('duplicate route /api/items');
  });
});

// The real training + archives route tables over an in-memory repository (no server process).
function realRoutes(serialize: Deps['serialize'] = (fn) => fn(), doSync?: typeof syncGarmin, fetchImpl?: typeof fetch) {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new SqliteRepository(db);
  const clock: Clock = { now: () => 0 as UnixSeconds, today: () => '2026-11-05' };
  const weather = {} as OpenMeteoClient;
  const sync = createSyncRunner({ repo, clock, weather, serialize, doSync });
  const deps = { repo, clock, weather, serialize, sync, fetch: fetchImpl } as Deps;
  const routes = mergeRoutes(trainingRoutes(deps), archivesRoutes(deps));
  const callWith = async (method: string, url: string, req: Readable, headers: Record<string, string> = {}, opts?: GuardOptions) => {
    const { res, out } = fakeRes();
    dispatch(routes, Object.assign(req, { method, url, headers }) as unknown as IncomingMessage, res, opts);
    await out.done;
    return out as { status: number; body: Record<string, unknown> };
  };
  const call = (method: string, url: string, body?: unknown) => callWith(method, url, Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]));
  return { repo, call, callWith };
}

describe('POST /api/sync-garmin and the body limit', () => {
  const leaky = () => Promise.reject(new Error('/Users/secret/data.sqlite is locked'));

  it('an oversized body is a 400', async () => {
    const { callWith } = realRoutes();
    const big = await callWith('POST', '/api/weight', Readable.from([Buffer.alloc(26 * 1024 * 1024)]));
    expect(big).toMatchObject({ status: 400, body: { error: 'request body too large' } });
  });

  it('sync-garmin: an unknown error is a logged generic 500 that leaks no detail', async () => {
    const { call } = realRoutes(leaky);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await call('POST', '/api/sync-garmin');
    expect(r).toMatchObject({ status: 500, body: { error: 'internal error' } });
    expect(JSON.stringify(r.body)).not.toContain('secret');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('POST /api/sync-garmin result + lock', () => {
  const summary = { runsImported: 1 } as Awaited<ReturnType<typeof syncGarmin>>;

  it('a successful sync is a 200 {ok:true} carrying the summary', async () => {
    const { call } = realRoutes(undefined, async () => summary);
    expect(await call('POST', '/api/sync-garmin')).toMatchObject({ status: 200, body: { ok: true, summary } });
  });

  it('a GarminSyncError is a 200 {ok:false} carrying its kind', async () => {
    const { call } = realRoutes(undefined, async () => {
      throw new GarminSyncError('token expired', 'auth');
    });
    expect(await call('POST', '/api/sync-garmin')).toMatchObject({ status: 200, body: { ok: false, error: 'auth', message: 'token expired' } });
  });

  it('a second sync while one runs is 409 busy, and the lock is released afterwards', async () => {
    let release = () => {};
    const { call } = realRoutes(undefined, () => new Promise((r) => (release = () => r(summary))));
    const first = call('POST', '/api/sync-garmin');
    await new Promise((r) => setTimeout(r, 0));
    expect(await call('POST', '/api/sync-garmin')).toMatchObject({ status: 409, body: { ok: false, error: 'busy' } });
    release();
    expect((await first).status).toBe(200);
    release = () => {};
    const again = call('POST', '/api/sync-garmin');
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect((await again).status).toBe(200);
  });
});

describe('POST /api/weight validation', () => {
  it('rejects an impossible calendar date and out-of-range kg / body-fat with 400, writing nothing', async () => {
    const { repo, call } = realRoutes();
    for (const body of [
      { date: '2026-13-45', weightKg: 80 },
      { date: '2026-02-30', weightKg: 80 },
      { weightKg: 20 },
      { weightKg: 0.5 },
      { weightKg: 401 },
      { weightKg: 80, bodyFatPct: 101 },
      { weightKg: 80, bodyFatPct: -1 },
    ]) {
      expect({ body, status: (await call('POST', '/api/weight', body)).status }).toEqual({ body, status: 400 });
    }
    expect(await repo.getWeightPoints()).toEqual([]);
  });

  it('a valid date and kg is a 200 and the row is written', async () => {
    const { repo, call } = realRoutes();
    expect((await call('POST', '/api/weight', { date: '2026-11-04', weightKg: 73.5, bodyFatPct: 22 })).status).toBe(200);
    expect(await repo.getWeightPoints()).toMatchObject([{ date: '2026-11-04', weightKg: 73.5, bodyFatPct: 22 }]);
  });
});

describe('PATCH /api/goals', () => {
  const full = { weightKg: 82, bodyFatPct: 12, paceMinPerKm: 5.5, weeklyKm: 40 };

  it('rejects out-of-range, non-numeric and missing values with 400, writing nothing', async () => {
    const { repo, call } = realRoutes();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    for (const body of [
      { ...full, weightKg: 29 },
      { ...full, weightKg: 251 },
      { ...full, bodyFatPct: 2 },
      { ...full, bodyFatPct: 61 },
      { ...full, paceMinPerKm: 2.4 },
      { ...full, paceMinPerKm: 15.1 },
      { ...full, weeklyKm: 0 },
      { ...full, weeklyKm: 301 },
      { ...full, weightKg: '80' },
      { weightKg: 82, bodyFatPct: 12, paceMinPerKm: 5.5 }, // weeklyKm missing
    ]) {
      expect({ body, status: (await call('PATCH', '/api/goals', body)).status }).toEqual({ body, status: 400 });
    }
    expect((await repo.getAthleteConfig())!.goals).toEqual(DEFAULT_CONFIG.goals);
  });

  it('saves valid goals, preserves the rest of the config, and recomputes LEANNESS from the new goal', async () => {
    const { repo, call } = realRoutes();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    await repo.saveWeightPoint({ date: '2026-06-01', weightKg: 78, bodyFatPct: 24, source: 'manual', notes: null });
    await repo.saveWeightPoint({ date: '2026-07-01', weightKg: 75, bodyFatPct: 21, source: 'manual', notes: null });
    expect((await call('PATCH', '/api/goals', full)).status).toBe(200);
    const cfg = await repo.getAthleteConfig();
    expect(cfg).toMatchObject({ ...DEFAULT_CONFIG, goals: full });
    const lean = (await repo.getStatHistory()).filter((h) => h.stat === 'LEANNESS');
    expect(lean.length).toBeGreaterThan(0);
    expect(lean[lean.length - 1]!.inputsJson).toContain('goal 9.8 kg (82 kg @ 12%)');
  });

  it('null resets a goal to the default; the dashboard reports value + userSet', async () => {
    const { repo, call } = realRoutes();
    await repo.saveAthleteConfig(DEFAULT_CONFIG);
    await call('PATCH', '/api/goals', full);
    expect((await call('PATCH', '/api/goals', { ...full, weeklyKm: null, paceMinPerKm: null })).status).toBe(200);
    const dto = (await call('GET', '/api/dashboard')).body as { goals: Record<string, { value: number; userSet: boolean }> };
    expect(dto.goals).toEqual({
      weightKg: { value: 82, userSet: true },
      bodyFatPct: { value: 12, userSet: true },
      paceMinPerKm: { value: 6, userSet: false },
      weeklyKm: { value: 30, userSet: false },
    });
  });
});

const seriesBase = { author: null, altTitles: [], type: 'manga' as const, anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed' as const, readingStatus: 'active' as const, totalVolumesKnown: 1, englishPublisher: null, readingDirection: null, coverUrl: null, genres: [], notes: null, sourceHash: null };

describe('deleting a series / volume leaves no empty purchase behind', () => {
  async function boxed() {
    const { repo, call } = realRoutes();
    const mk = async (title: string) => {
      const s = await repo.addSeries({ ...seriesBase, canonicalTitle: title });
      const v = await repo.addVolume({ seriesId: s.id, volumeNumber: 1, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
      await repo.addCopy({ volumeId: v.id, owned: true, acquiredDate: null, condition: null, readStatus: 'unread', readDate: null, rating: null, notes: null, purchaseId: null });
      return { seriesId: s.id, volumeId: v.id };
    };
    // Same effect as a purchase over these volumes: the Purchase, its items, and each Copy tagged with it.
    const buy = async (totalPrice: number, type: 'single' | 'box', volumeIds: number[]) => {
      const purchase = await repo.addPurchase({ date: null, source: null, totalPrice, currency: 'EUR', type, estimated: false, notes: null });
      await repo.addPurchaseItems(volumeIds.map((volumeId) => ({ volumeId, allocatedPrice: null, purchaseId: purchase.id })));
      for (const volumeId of volumeIds) for (const c of await repo.listCopiesByVolume(volumeId)) await repo.updateCopy(c.id, { purchaseId: purchase.id });
    };
    return { repo, call, buy, a: await mk('A'), b: await mk('B') };
  }

  it('DELETE series whose purchase covers only it: the purchase is gone', async () => {
    const { repo, call, buy, a } = await boxed();
    await buy(1500, 'single', [a.volumeId]);
    expect((await repo.listPurchases()).length).toBe(1);
    expect((await call('DELETE', `/api/series?id=${a.seriesId}`)).status).toBe(200);
    expect(await repo.listPurchases()).toEqual([]);
  });

  it('DELETE series sharing a box purchase with another series: the purchase stays with its other items', async () => {
    const { repo, call, buy, a, b } = await boxed();
    await buy(3000, 'box', [a.volumeId, b.volumeId]);
    await call('DELETE', `/api/series?id=${a.seriesId}`);
    expect((await repo.listPurchases()).map((p) => p.totalPrice)).toEqual([3000]);
    expect((await repo.listPurchaseItems()).map((i) => i.volumeId)).toEqual([b.volumeId]);
  });

  it('DELETE volume drops its now-empty purchase; a purchase with no items ever is left alone', async () => {
    const { repo, call, buy, a } = await boxed();
    await repo.addPurchase({ date: null, source: null, totalPrice: 700, currency: 'EUR', type: 'single', estimated: false, notes: null });
    await buy(1500, 'single', [a.volumeId]);
    expect((await call('DELETE', `/api/volumes?id=${a.volumeId}`)).status).toBe(200);
    expect((await repo.listPurchases()).map((p) => p.totalPrice)).toEqual([700]);
  });
});

describe('cross-site write and DNS-rebinding guard', () => {
  const weight = { date: '2026-11-05', weightKg: 80.5 };
  const postWeight = (headers: Record<string, string>, opts?: GuardOptions) => {
    const r = realRoutes();
    const send = async () => r.callWith('POST', '/api/weight', Readable.from([Buffer.from(JSON.stringify(weight))]), headers, opts);
    const count = async () => (await r.repo.getWeightPoints()).length;
    return { send, count };
  };

  it('refuses a cross-site POST (json and text/plain) and never reaches the handler', async () => {
    for (const ct of ['application/json', 'text/plain']) {
      const t = postWeight({ host: 'localhost:8787', origin: 'https://evil.example', 'content-type': ct });
      expect(await t.send()).toMatchObject({ status: 403, body: { error: 'forbidden origin' } });
      expect(await t.count()).toBe(0);
    }
  });

  it('refuses Origin: null for writes', async () => {
    const t = postWeight({ host: 'localhost:8787', origin: 'null' });
    expect((await t.send()).status).toBe(403);
    expect(await t.count()).toBe(0);
  });

  it('allows a localhost origin, and a request with no Origin header', async () => {
    const a = postWeight({ host: 'localhost:5174', origin: 'http://localhost:5174' });
    expect((await a.send()).status).toBe(200);
    expect(await a.count()).toBe(1);
    const b = postWeight({ host: '127.0.0.1:8787' });
    expect((await b.send()).status).toBe(200);
    const c = postWeight({ host: '[::1]:8787', origin: 'http://[::1]:5174' });
    expect((await c.send()).status).toBe(200);
  });

  it('refuses a non-loopback Host (DNS rebinding) for GET and POST on a loopback bind', async () => {
    const { callWith, repo } = realRoutes();
    const get = await callWith('GET', '/api/dashboard', Readable.from([]), { host: 'evil.example:8787' });
    expect(get).toMatchObject({ status: 403, body: { error: 'forbidden origin' } });
    const t = postWeight({ host: 'evil.example:8787', origin: 'http://evil.example:8787' });
    expect((await t.send()).status).toBe(403);
    expect(await t.count()).toBe(0);
    expect((await repo.getWeightPoints()).length).toBe(0);
  });

  it('skips the Host check when exposed, and allows a same-origin LAN write but not a foreign one', async () => {
    const exposed = { exposed: true };
    const lan = postWeight({ host: '192.168.1.20:5174', origin: 'http://192.168.1.20:5174' }, exposed);
    expect((await lan.send()).status).toBe(200);
    expect(await lan.count()).toBe(1);
    const foreign = postWeight({ host: '192.168.1.20:8787', origin: 'https://evil.example' }, exposed);
    expect((await foreign.send()).status).toBe(403);
    expect(await foreign.count()).toBe(0);
  });

  it('treats only loopback binds as not exposed', () => {
    expect(['127.0.0.1', 'localhost', '::1', '[::1]'].map(isLoopbackBind)).toEqual([true, true, true, true]);
    expect(['0.0.0.0', '192.168.1.20', '::'].map(isLoopbackBind)).toEqual([false, false, false]);
  });
});

describe('Google Books key routes (#43)', () => {
  const KEY = 'AIza' + 'b'.repeat(35);
  const answer = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  const noEnv = () => vi.stubEnv('GOOGLE_BOOKS_API_KEY', '');
  afterEach(() => vi.unstubAllEnvs());

  it('PUT refuses an AQ. key, a short key, blanks and a non-string with 400, saving nothing', async () => {
    noEnv();
    const { repo, call } = realRoutes();
    for (const key of ['AQ.' + 'x'.repeat(36), 'AIzashort', '   ', '', 'AIza' + 'b'.repeat(36), 5, undefined]) {
      const r = await call('PUT', '/api/settings/google-books', { key });
      expect({ key, status: r.status }).toEqual({ key, status: 400 });
      expect(String(r.body['error'])).toContain('AIza');
    }
    expect(await repo.getSetting('google_books_api_key')).toBeNull();
  });

  it('PUT saves a valid key trimmed; GET and PUT never contain the full key; DELETE clears it', async () => {
    noEnv();
    const { repo, call } = realRoutes();
    expect((await call('GET', '/api/settings/google-books')).body).toEqual({ configured: false, source: null });
    const put = await call('PUT', '/api/settings/google-books', { key: `  ${KEY}\n` });
    expect(put).toMatchObject({ status: 200, body: { configured: true, source: 'app', last4: KEY.slice(-4) } });
    expect(await repo.getSetting('google_books_api_key')).toBe(KEY);
    const get = await call('GET', '/api/settings/google-books');
    expect(get.body).toEqual(put.body);
    expect(JSON.stringify([put.body, get.body])).not.toContain(KEY);
    const del = await call('DELETE', '/api/settings/google-books');
    expect(del).toMatchObject({ status: 200, body: { configured: false, source: null } });
    expect(await repo.getSetting('google_books_api_key')).toBeNull();
  });

  it('with the env var set, source stays env (also after DELETE) and the env key is not leaked', async () => {
    const envKey = 'AIza' + 'e'.repeat(35);
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', envKey);
    const { call } = realRoutes();
    await call('PUT', '/api/settings/google-books', { key: KEY });
    const del = await call('DELETE', '/api/settings/google-books');
    expect(del.body).toEqual({ configured: true, source: 'env', last4: envKey.slice(-4) });
    expect(JSON.stringify(del.body)).not.toContain(envKey);
  });

  it('POST /test: no key, 200, 403, 429 and a network failure; the key is never echoed', async () => {
    noEnv();
    expect((await realRoutes().call('POST', '/api/settings/google-books/test')).body).toEqual({ ok: false, message: 'no key' });
    const outcomes: unknown[] = [];
    for (const f of [
      answer(200),
      answer(403),
      answer(429),
      (async () => { throw new Error(`boom ${KEY}`); }) as typeof fetch,
    ]) {
      const { call } = realRoutes(undefined, undefined, f);
      await call('PUT', '/api/settings/google-books', { key: KEY });
      const r = await call('POST', '/api/settings/google-books/test');
      expect(r.status).toBe(200);
      outcomes.push(r.body);
    }
    expect(outcomes).toMatchObject([{ ok: true }, { ok: false, status: 403 }, { ok: false, status: 429 }, { ok: false, status: 0 }]);
    expect(JSON.stringify(outcomes)).not.toContain(KEY);
  });

  it('GET /api/manga-lookup uses the app key, picks up a new key without a restart, and env wins', async () => {
    noEnv();
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    const { call } = realRoutes(undefined, undefined, f);
    await call('GET', '/api/manga-lookup?title=dune&kind=book');
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => !u.includes('key='))).toBe(true);
    urls.length = 0;
    await call('PUT', '/api/settings/google-books', { key: KEY });
    await call('GET', '/api/manga-lookup?title=dune&kind=book');
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.includes(`key=${KEY}`))).toBe(true);
    urls.length = 0;
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'ENVWINS');
    await call('GET', '/api/manga-lookup?title=dune&kind=book');
    expect(urls.every((u) => u.includes('key=ENVWINS'))).toBe(true);
  });
});
