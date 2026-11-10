import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Clock, UnixSeconds } from '@solace/core';
import { migrate, openDatabase, SqliteRepository } from '@solace/data';
import { dispatch } from '../src/http.ts';
import type { Deps } from '../src/deps.ts';
import { archivesRoutes } from '../src/routes/archives.ts';

// In-process: the real archives route table over an in-memory repository, with a fixed clock.
const clock: Clock = { now: () => 0 as UnixSeconds, today: () => '2026-10-27' };
const seriesBase = { author: null, altTitles: [], type: 'manga' as const, anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed' as const, readingStatus: 'active' as const, totalVolumesKnown: 1, englishPublisher: null, readingDirection: null, coverUrl: null, genres: [], notes: null, sourceHash: null };

async function setup() {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new SqliteRepository(db);
  const routes = archivesRoutes({ repo, clock } as unknown as Deps);
  const call = async (method: string, url: string, body: unknown) => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method, url, headers: {} }) as unknown as IncomingMessage;
    let finish = () => {};
    const done = new Promise<void>((r) => (finish = r));
    const out = { status: 0 };
    const res = {
      headersSent: false,
      statusCode: 0,
      setHeader: () => {},
      end(this: { statusCode: number; headersSent: boolean }) {
        out.status = this.statusCode;
        this.headersSent = true;
        finish();
      },
    } as unknown as ServerResponse;
    dispatch(routes, req, res);
    await done;
    return out.status;
  };
  const s = await repo.addSeries({ ...seriesBase, canonicalTitle: 'X' });
  const v = await repo.addVolume({ seriesId: s.id, volumeNumber: 1, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
  const c = await repo.addCopy({ volumeId: v.id, owned: true, acquiredDate: null, condition: null, readStatus: 'unread', readDate: null, rating: null, notes: null, purchaseId: null });
  const readDate = async () => (await repo.listCopiesByVolume(v.id)).find((x) => x.id === c.id)!.readDate;
  return { call, id: c.id, readDate };
}

describe('PATCH /api/copies read_date', () => {
  it('marking read stamps today (server clock)', async () => {
    const { call, id, readDate } = await setup();
    expect(await call('PATCH', `/api/copies?id=${id}`, { readStatus: 'read' })).toBe(200);
    expect(await readDate()).toBe('2026-10-27');
  });

  it('moving away from read clears it', async () => {
    const { call, id, readDate } = await setup();
    await call('PATCH', `/api/copies?id=${id}`, { readStatus: 'read' });
    await call('PATCH', `/api/copies?id=${id}`, { readStatus: 'reading' });
    expect(await readDate()).toBeNull();
  });

  it('an explicit valid readDate wins', async () => {
    const { call, id, readDate } = await setup();
    expect(await call('PATCH', `/api/copies?id=${id}`, { readStatus: 'read', readDate: '2026-09-01' })).toBe(200);
    expect(await readDate()).toBe('2026-09-01');
  });

  it('an invalid readDate is a 400 and writes nothing', async () => {
    const { call, id, readDate } = await setup();
    expect(await call('PATCH', `/api/copies?id=${id}`, { readStatus: 'read', readDate: '2026-13-40' })).toBe(400);
    expect(await readDate()).toBeNull();
  });
});
