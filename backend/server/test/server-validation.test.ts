import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// End-to-end validation tests against the REAL server process (the package had zero tests). Spawns it via
// tsx on an ephemeral port with SOLACE_DB pointed at a throwaway DB, so the project DB is never touched.
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SERVER_ENTRY = resolve(import.meta.dirname, '..', 'src', 'index.ts');
const CLI_ENTRY = resolve(REPO_ROOT, 'backend', 'cli', 'src', 'index.ts');
const TSX_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const EXIT_WITH_PARENT = pathToFileURL(resolve(import.meta.dirname, 'helpers', 'exit-with-parent.mjs')).href;

const freePort = (): Promise<number> =>
  new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => (port ? res(port) : rej(new Error('no port'))));
    });
    s.on('error', rej);
  });

let child: ChildProcess;
let base = '';
let tmp = '';

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'rag-srv-'));
  const dbPath = join(tmp, 'test.sqlite');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  // Seed the throwaway DB (athlete_config + baseline) so /api/dashboard assembles — the manga round-trip
  // reads it back. SOLACE_DB now points both the CLI and the server at this temp file.
  execFileSync(TSX_BIN, [CLI_ENTRY, 'seed'], { cwd: REPO_ROOT, env: { ...process.env, SOLACE_DB: dbPath }, stdio: 'ignore' });
  // Run the server as a plain node process with tsx as a LOADER, not through the `tsx` CLI. The CLI is a
  // wrapper that starts the real server as its own child, so afterAll's kill() only reached the wrapper and
  // the node server survived as an orphan: every run leaked one (measured 2026-09-13, 38 had piled up).
  // The second preload makes the server exit when this test run is gone (stdin EOF, or the watched pids
  // disappearing), which covers aborted runs too; see helpers/exit-with-parent.mjs for why both are needed.
  child = spawn(process.execPath, ['--import', 'tsx', '--import', EXIT_WITH_PARENT, SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      SOLACE_DB: dbPath,
      SOLACE_TEST_WATCH_PIDS: `${process.pid},${process.ppid}`,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Poll until the listener answers (any response — even the 404 JSON — means it's up).
  const deadline = Date.now() + 25_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('server did not start in time');
    try {
      await fetch(base + '/');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}, 30_000);

afterAll(() => {
  child?.kill('SIGKILL');
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('server write-route validation (security guards)', () => {
  it('POST /api/weight rejects a non-numeric weightKg with 400 (not a 500 / corrupt row)', async () => {
    const r = await post('/api/weight', { weightKg: 'abc', date: '2026-06-28' });
    expect(r.status).toBe(400);
  });

  it('POST /api/weight from a foreign Origin is a 403 and writes nothing; the same POST without one works', async () => {
    const body = { weightKg: 71.5, date: '2026-06-29' };
    const weights = async () => ((await (await fetch(base + '/api/dashboard')).json()) as { vitals: { weight: unknown[] } }).vitals.weight.length;
    const before = await weights();
    const evil = await post('/api/weight', body, { origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect(await weights()).toBe(before);
    expect((await post('/api/weight', body)).status).toBe(200);
    expect(await weights()).toBe(before + 1);
  });

  it('POST /api/weight accepts a valid numeric weigh-in', async () => {
    const r = await post('/api/weight', { weightKg: 80.5, date: '2026-06-28' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { ok?: boolean }).ok).toBe(true);
  });

  it('PATCH /api/goals: out-of-range / non-numeric / missing is 400; valid is 200 and shows in the dashboard', async () => {
    const patch = (body: unknown) => fetch(base + '/api/goals', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ok = { weightKg: 80, bodyFatPct: 12, paceMinPerKm: 5.5, weeklyKm: 40 };
    expect((await patch({ ...ok, weightKg: 'abc' })).status).toBe(400);
    expect((await patch({ ...ok, weightKg: 9999 })).status).toBe(400);
    expect((await patch({ weightKg: 80 })).status).toBe(400);
    expect((await patch(ok)).status).toBe(200);
    const dto = (await (await fetch(base + '/api/dashboard')).json()) as { goals: { weightKg: { value: number; userSet: boolean } } };
    expect(dto.goals.weightKg).toEqual({ value: 80, userSet: true });
  });

  it('GET /api/manga-lookup with malformed percent-encoding is a 400, NOT a crash', async () => {
    const r = await fetch(base + '/api/manga-lookup?title=%ZZ');
    expect(r.status).toBe(400);
    // The process must still be alive afterwards (a follow-up request succeeds).
    const alive = await fetch(base + '/');
    expect(alive.status).toBe(404);
  });

  type DashSeries = { id: number; title: string; author: string | null; notes: string | null; ownedCount: number; readCount: number; totalSpentCents: number | null; volumes: Array<{ id: number; copyId: number | null; volumeNumber: number | null; readStatus: string; pricePaid: { amountCents: number; estimated: boolean; split: boolean } | null }> };
  const series = async (): Promise<DashSeries[]> =>
    ((await (await fetch(base + '/api/dashboard')).json()) as { series?: DashSeries[] }).series ?? [];

  it('series write routes round-trip (POST → dashboard → PATCH → DELETE)', async () => {
    // ownedVolumes/readVolumes create placeholder Volume+Copy rows in the same call.
    const created = await post('/api/series', { canonicalTitle: 'CrudRoundtrip', type: 'manga', ownedVolumes: 3, readVolumes: 2 });
    expect(created.status).toBe(200);
    const id = ((await created.json()) as { id: number }).id;

    const found = (await series()).find((s) => s.id === id);
    expect(found).toBeDefined();
    expect(found?.ownedCount).toBe(3);
    expect(found?.readCount).toBe(2);
    expect(found?.volumes.length).toBe(3);

    const patched = await fetch(base + `/api/series?id=${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ readingStatus: 'dropped', notes: 'shelved' }) });
    expect(patched.status).toBe(200);
    expect((await series()).find((s) => s.id === id)?.notes).toBe('shelved');

    const del = await fetch(base + `/api/series?id=${id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await series()).some((s) => s.id === id)).toBe(false);
  });

  it('POST /api/series stores author and it surfaces in the DTO; PATCH changes it; PATCH author:null clears it', async () => {
    const created = await post('/api/series', { canonicalTitle: 'Sample Saga', type: 'manga', author: 'Sample Author' });
    expect(created.status).toBe(200);
    const id = ((await created.json()) as { id: number }).id;
    expect((await series()).find((s) => s.id === id)?.author).toBe('Sample Author');

    const patched = await fetch(base + `/api/series?id=${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: 'Studio Gaga' }) });
    expect(patched.status).toBe(200);
    expect((await series()).find((s) => s.id === id)?.author).toBe('Studio Gaga');

    const cleared = await fetch(base + `/api/series?id=${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: null }) });
    expect(cleared.status).toBe(200);
    expect((await series()).find((s) => s.id === id)?.author).toBe(null);
  });

  it('DTO volumes[].copyId is the real copy id and PATCH /api/copies?id=<copyId> mutates the exact copy the row displays', async () => {
    const created = await post('/api/series', { canonicalTitle: 'CopyIdSeries', type: 'manga', ownedVolumes: 2, readVolumes: 0 });
    expect(created.status).toBe(200);
    const id = ((await created.json()) as { id: number }).id;

    const before = (await series()).find((s) => s.id === id)!;
    expect(before.readCount).toBe(0);
    const copyId = before.volumes[0]!.copyId;
    expect(typeof copyId).toBe('number'); // a real copy id, not null / not the volume id

    const patched = await fetch(base + `/api/copies?id=${copyId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ readStatus: 'read' }) });
    expect(patched.status).toBe(200);

    const after = (await series()).find((s) => s.id === id)!;
    expect(after.volumes[0]?.readStatus).toBe('read'); // the very row whose copyId we PATCHed
    expect(after.readCount).toBe(1);
  });

  it('DELETE /api/series-lookup does NOT fall through to the series delete route (regression: routing data-loss)', async () => {
    const created = await post('/api/series', { canonicalTitle: 'MustSurvive', type: 'manga', ownedVolumes: 1 });
    const id = ((await created.json()) as { id: number }).id;
    // A hypothetical `/api/series-lookup` (GET-only) must NOT be treated as `DELETE /api/series?id=` by a
    // bare startsWith — the exact-match guard makes this a 404 fall-through, not a delete.
    const r = await fetch(base + `/api/series-lookup?id=${id}`, { method: 'DELETE' });
    expect(r.status).toBe(404);
    expect((await series()).some((s) => s.id === id)).toBe(true); // still there — the lookup path didn't delete it
  });

  // The same exact-match rule for the older write routes, which used a bare startsWith. exams carry
  // a DELETE handler, so a prefix match there is the exact data-loss bug the series test above guards against.
  it('DELETE /api/exams-lookup does NOT fall through to the delete route (regression: routing data-loss)', async () => {
    const dash = async () => (await (await fetch(base + '/api/dashboard')).json()) as { missions?: Array<{ id: number }> };
    const examId = ((await (await post('/api/exams', { course: 'MustSurviveExam', examDate: '2026-12-01' })).json()) as { id: number }).id;

    const e = await fetch(base + `/api/exams-lookup?id=${examId}`, { method: 'DELETE' });
    expect(e.status).toBe(404);
    const after = await dash();
    expect((after.missions ?? []).some((x) => x.id === examId)).toBe(true);

    // The real routes still work with their ?id= form.
    expect((await fetch(base + `/api/exams?id=${examId}`, { method: 'DELETE' })).status).toBe(200);
  });

  it('POST to a longer path sharing a write route prefix is a 404, not that route (weight / sync-garmin)', async () => {
    for (const path of ['/api/weighty', '/api/sync-garmin-x']) {
      const r = await post(path, {});
      expect({ path, status: r.status }).toEqual({ path, status: 404 });
    }
  });

  it('POST /api/volumes rejects a missing/zero/negative seriesId with 400', async () => {
    expect((await post('/api/volumes', { volumeNumber: 1 })).status).toBe(400);
    expect((await post('/api/volumes', { seriesId: 0, volumeNumber: 1 })).status).toBe(400);
    expect((await post('/api/volumes', { seriesId: -3, volumeNumber: 1 })).status).toBe(400);
  });

  it('POST /api/series type=book defaults totalVolumesKnown so a fully-read book DERIVES finished', async () => {
    // Regression (defect: the book branch never set totalVolumesKnown, so seriesFinished could never
    // fire — the read book was stuck in booksReading and booksFinished stayed 0).
    const before = ((await (await fetch(base + '/api/dashboard')).json()) as { lifeSimSummary: { booksFinished: number } }).lifeSimSummary.booksFinished;
    const r = await post('/api/series', { canonicalTitle: 'A Finished Novel', type: 'book', readVolumes: 1 });
    expect(r.status).toBe(200);
    const id = ((await r.json()) as { id: number }).id;
    const dash = (await (await fetch(base + '/api/dashboard')).json()) as { series: Array<{ id: number; finished: boolean }>; lifeSimSummary: { booksFinished: number } };
    expect(dash.series.find((s) => s.id === id)?.finished).toBe(true);
    expect(dash.lifeSimSummary.booksFinished).toBe(before + 1);
  });

  it('buy-volume: GET quotes the next volume, POST marks it owned + prices it (estimate, then a receipt)', async () => {
    const s = await post('/api/series', { canonicalTitle: 'BuyFlowSeries', type: 'manga', publicationStatus: 'ongoing', totalVolumesKnown: 10, ownedVolumes: 3, englishPublisher: 'Example Press' });
    const seriesId = ((await s.json()) as { id: number }).id;

    const quoteRes = await fetch(base + `/api/buy-volume?seriesId=${seriesId}`);
    expect(quoteRes.status).toBe(200);
    const quote = (await quoteRes.json()) as { volumeNumber: number; priceCents: number | null };
    expect(quote.volumeNumber).toBe(4);
    expect(quote.priceCents).toBeGreaterThan(0); // resolved from the price table (the example one when no private file exists)

    // Untouched estimate: no priceCents sent → the server prices it from the table, marked estimated.
    const bought = await post('/api/buy-volume', { seriesId, volumeNumber: 4 });
    expect(bought.status).toBe(200);
    expect((await bought.json()) as object).toMatchObject({ ok: true, priceCents: quote.priceCents, estimated: true });

    let found = (await series()).find((x) => x.id === seriesId) as DashSeries & { nextVolumeToBuy: number | null };
    expect(found.ownedCount).toBe(4);
    expect(found.nextVolumeToBuy).toBe(5);
    expect(found.volumes.find((v) => v.volumeNumber === 4)?.pricePaid).toEqual({ amountCents: quote.priceCents, estimated: true, split: true });
    expect(found.totalSpentCents).toBe(quote.priceCents);

    // A typed price is a real receipt.
    const receipt = await post('/api/buy-volume', { seriesId, volumeNumber: 5, priceCents: 1250 });
    expect((await receipt.json()) as object).toMatchObject({ ok: true, priceCents: 1250, estimated: false });
    found = (await series()).find((x) => x.id === seriesId) as typeof found;
    expect(found.totalSpentCents).toBe(quote.priceCents! + 1250);

    // Buying an owned volume again is a 409 and writes nothing.
    const again = await post('/api/buy-volume', { seriesId, volumeNumber: 5, priceCents: 999 });
    expect(again.status).toBe(409);
    expect(((await series()).find((x) => x.id === seriesId))?.totalSpentCents).toBe(quote.priceCents! + 1250);
  });

  it('buy-volume validates its input and is exact-match routed', async () => {
    expect((await fetch(base + '/api/buy-volume')).status).toBe(400);
    expect((await fetch(base + '/api/buy-volume?seriesId=999999')).status).toBe(404);
    expect((await post('/api/buy-volume', { volumeNumber: 1 })).status).toBe(400);
    expect((await post('/api/buy-volume', { seriesId: 1, volumeNumber: 0 })).status).toBe(400);
    expect((await post('/api/buy-volume', { seriesId: 1, volumeNumber: 1, priceCents: 12.5 })).status).toBe(400);
    expect((await post('/api/buy-volume', { seriesId: 1, volumeNumber: 1, priceCents: 0 })).status).toBe(400);
    expect((await post('/api/buy-volume', { seriesId: 999999, volumeNumber: 1 })).status).toBe(404);
    expect((await post('/api/buy-volume-x', { seriesId: 1, volumeNumber: 1 })).status).toBe(404);
  });
});

describe('strength log (/api/strength)', () => {
  const send = (method: string, path: string, body?: unknown) =>
    fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const bench = (reps: number, weightKg = 80) => [{ name: 'Bench Press', sets: [{ reps, weightKg }] }];

  it('rejects invalid input with 400 and writes nothing', async () => {
    expect((await send('POST', '/api/strength', { date: '2026-09-01', exercises: [] })).status).toBe(400);
    expect((await send('POST', '/api/strength', { date: 'nope', exercises: bench(5) })).status).toBe(400);
    expect((await send('POST', '/api/strength', { date: '2999-01-01', exercises: bench(5) })).status).toBe(400);
    expect((await send('POST', '/api/strength', { date: '2026-06-21', exercises: bench(5) })).status).toBe(400);
    expect((await send('POST', '/api/strength', { date: '2026-09-01', exercises: bench(5, 900) })).status).toBe(400);
    const plank = (set: unknown) => [{ name: 'Plank', sets: [set] }];
    for (const set of [{ seconds: 0 }, { seconds: 3601 }, { seconds: 1.5 }, { seconds: '60' }, { seconds: 60, reps: 5 }, { seconds: 60, weightKg: 0 }]) {
      expect((await send('POST', '/api/strength', { date: '2026-09-01', exercises: plank(set) })).status, JSON.stringify(set)).toBe(400);
    }
    expect((await send('PATCH', '/api/strength', { date: '2026-09-01', exercises: bench(5) })).status).toBe(400);
    expect((await send('PATCH', '/api/strength?id=999999', { date: '2026-09-01', exercises: bench(5) })).status).toBe(404);
    expect((await send('DELETE', '/api/strength?id=999999')).status).toBe(404);
    expect(((await (await send('GET', '/api/strength')).json()) as { sessions: unknown[] }).sessions).toEqual([]);
  });

  it('saves, lists, edits and deletes a session, and answers a same-day clash with 409', async () => {
    const saved = await send('POST', '/api/strength', { date: '2026-09-01', notes: 'Push', exercises: bench(5) });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { ok: boolean; status: string; sessionId: number; strength: { level: number } | null };
    expect(body).toMatchObject({ ok: true, status: 'saved' });
    expect(body.strength).not.toBeNull();

    expect(((await (await send('POST', '/api/strength', { date: '2026-09-01', exercises: bench(5) })).json()) as { status: string }).status).toBe('already_logged');

    const clash = await send('POST', '/api/strength', { date: '2026-09-01', exercises: bench(6) });
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ ok: false, error: 'same_day', existingSessionId: body.sessionId, date: '2026-09-01' });

    const patched = await send('PATCH', `/api/strength?id=${body.sessionId}`, { date: '2026-09-01', notes: 'Push v2', exercises: bench(8) });
    expect(patched.status).toBe(200);
    const list = (await (await send('GET', '/api/strength')).json()) as { sessions: { id: number; notes: string | null; exercises: { sets: { reps: number }[] }[] }[] };
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]).toMatchObject({ notes: 'Push v2' });
    expect(list.sessions[0]!.exercises[0]!.sets[0]!.reps).toBe(8);

    const id = list.sessions[0]!.id;
    expect(await (await send('DELETE', `/api/strength?id=${id}`)).json()).toEqual({ ok: true });
    expect(((await (await send('GET', '/api/strength')).json()) as { sessions: unknown[] }).sessions).toEqual([]);
  });

  it('saves a hold set as { seconds }, lists it back and deletes it', async () => {
    const saved = await send('POST', '/api/strength', { date: '2026-09-02', exercises: [{ name: 'Plank', sets: [{ seconds: 60 }, { seconds: 45 }] }] });
    expect(saved.status).toBe(200);
    const list = (await (await send('GET', '/api/strength')).json()) as { sessions: { id: number; exercises: { name: string; sets: unknown[] }[] }[] };
    expect(list.sessions[0]!.exercises).toEqual([{ name: 'Plank', sets: [{ seconds: 60 }, { seconds: 45 }] }]);
    expect(await (await send('DELETE', `/api/strength?id=${list.sessions[0]!.id}`)).json()).toEqual({ ok: true });
  });
});
