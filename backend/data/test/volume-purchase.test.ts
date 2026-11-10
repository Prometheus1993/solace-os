import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, fixedClock, parsePriceTable, type SeriesInput } from '@solace/core';
import { assembleDashboard, migrate, openDatabase, quoteNextVolume, readPriceTable, recordVolumeBought, SqliteRepository } from '../src/index.ts';

const TABLE = parsePriceTable({
  version: 1,
  defaultCents: 1099,
  oneShotCents: 1499,
  publisherStandard: { 'example press': 999 },
  publisherEdition: {},
  seriesOverrides: {},
  seriesVolumeOverrides: {},
});

function repo() {
  const db = openDatabase(':memory:');
  migrate(db);
  return new SqliteRepository(db);
}

const SERIES: SeriesInput = {
  canonicalTitle: 'Test Piece',
  author: null,
  altTitles: [],
  type: 'manga',
  anilistId: null,
  mangadexId: null,
  mangaupdatesId: null,
  malId: null,
  publicationStatus: 'ongoing',
  readingStatus: 'active',
  totalVolumesKnown: 10,
  englishPublisher: 'Example Press',
  readingDirection: null,
  coverUrl: null,
  genres: [],
  notes: null,
  sourceHash: null,
};

/** A series owning volumes 1..owned (placeholder rows, like POST /api/series). */
async function seed(r: SqliteRepository, owned: number) {
  await r.saveAthleteConfig(DEFAULT_CONFIG); // assembleDashboard needs an athlete config
  const s = await r.addSeries(SERIES);
  for (let i = 1; i <= owned; i++) {
    const v = await r.addVolume({ seriesId: s.id, volumeNumber: i, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
    await r.addCopy({ volumeId: v.id, owned: true, acquiredDate: null, condition: null, readStatus: 'read', readDate: null, rating: null, notes: null, purchaseId: null });
  }
  return s;
}

const dashSeries = async (r: SqliteRepository, id: number) => (await assembleDashboard(r, fixedClock(1_790_000_000, '2026-09-13')))!.series.find((s) => s.id === id)!;

describe('recordVolumeBought — the Next-to-buy "Bought vol N?" confirm', () => {
  it('quotes the next volume from the price table', async () => {
    const r = repo();
    const s = await seed(r, 3);
    expect(await quoteNextVolume(r, s.id, TABLE)).toEqual({ volumeNumber: 4, priceCents: 999, basis: 'publisher-standard', publisherSlug: 'example press' });
    expect(await quoteNextVolume(r, 999, TABLE)).toBeNull();
  });

  it('creates the missing volume, owns it, and links an ESTIMATED table-priced purchase', async () => {
    const r = repo();
    const s = await seed(r, 3);
    const res = await recordVolumeBought(r, { seriesId: s.id, volumeNumber: 4, date: '2026-09-13', table: TABLE });
    expect(res).toMatchObject({ ok: true, priceCents: 999, estimated: true });

    const d = await dashSeries(r, s.id);
    expect(d.ownedCount).toBe(4);
    expect(d.nextVolumeToBuy).toBe(5);
    const vol4 = d.volumes.find((v) => v.volumeNumber === 4)!;
    expect(vol4.pricePaid).toEqual({ amountCents: 999, estimated: true, split: true });
    expect(vol4.readStatus).toBe('unread');
    expect(d.totalSpentCents).toBe(999); // the only priced volume

    const [p] = await r.listPurchases();
    expect(p).toMatchObject({ source: 'price_table', type: 'single', totalPrice: 999, date: '2026-09-13', estimated: true });
  });

  it('a typed price is a real receipt (estimated:false, source manual)', async () => {
    const r = repo();
    const s = await seed(r, 1);
    const res = await recordVolumeBought(r, { seriesId: s.id, volumeNumber: 2, priceCents: 1250, date: '2026-09-13', table: TABLE });
    expect(res).toMatchObject({ ok: true, priceCents: 1250, estimated: false });
    expect((await r.listPurchases())[0]).toMatchObject({ source: 'manual', totalPrice: 1250, estimated: false });
    expect((await dashSeries(r, s.id)).totalSpentCents).toBe(1250);
  });

  it('reuses an existing UNOWNED copy instead of adding a second one', async () => {
    const r = repo();
    const s = await seed(r, 1);
    const v = await r.addVolume({ seriesId: s.id, volumeNumber: 2, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
    const wish = await r.addCopy({ volumeId: v.id, owned: false, acquiredDate: null, condition: null, readStatus: 'unread', readDate: null, rating: null, notes: null, purchaseId: null });

    const res = await recordVolumeBought(r, { seriesId: s.id, volumeNumber: 2, date: '2026-09-13', table: TABLE });
    expect(res).toMatchObject({ ok: true, volumeId: v.id, copyId: wish.id });
    const copies = await r.listCopiesByVolume(v.id);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ owned: true, acquiredDate: '2026-09-13' });
    expect(copies[0]!.purchaseId).not.toBeNull();
  });

  it('refuses an already-owned volume and writes nothing', async () => {
    const r = repo();
    const s = await seed(r, 3);
    expect(await recordVolumeBought(r, { seriesId: s.id, volumeNumber: 2, date: '2026-09-13', table: TABLE })).toEqual({ ok: false, reason: 'already_owned' });
    expect(await recordVolumeBought(r, { seriesId: 999, volumeNumber: 1, date: '2026-09-13', table: TABLE })).toEqual({ ok: false, reason: 'not_found' });
    expect(await r.listPurchases()).toEqual([]);
    expect(await r.listVolumesBySeries(s.id)).toHaveLength(3);
  });

  it('without a price table the volume is still owned, just unpriced', async () => {
    const r = repo();
    const s = await seed(r, 1);
    const res = await recordVolumeBought(r, { seriesId: s.id, volumeNumber: 2, date: '2026-09-13', table: null });
    expect(res).toMatchObject({ ok: true, purchaseId: null, priceCents: null });
    expect(await r.listPurchases()).toEqual([]);
    expect((await dashSeries(r, s.id)).ownedCount).toBe(2);
  });

  it('readPriceTable returns null for a missing or malformed file (never throws)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rag-price-'));
    try {
      expect(readPriceTable(join(dir, 'nope.json'))).toBeNull();
      writeFileSync(join(dir, 'bad.json'), '{"version":1}');
      expect(readPriceTable(join(dir, 'bad.json'))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
