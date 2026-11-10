import { describe, expect, it } from 'vitest';
import { nextVolumeToBuy, seriesCaughtUp, seriesFinished, volumePricePaid } from '../../src/domain/series.ts';
import type { Copy, Purchase, Series, SeriesPublicationStatus, SeriesReadingStatus, Volume } from '../../src/index.ts';

const s = (over: Partial<Series>): Series => ({
  id: 0,
  canonicalTitle: 'M',
  author: null,
  altTitles: [],
  type: 'manga',
  anilistId: null,
  mangadexId: null,
  mangaupdatesId: null,
  malId: null,
  publicationStatus: 'completed',
  readingStatus: 'active',
  totalVolumesKnown: null,
  englishPublisher: null,
  readingDirection: null,
  coverUrl: null,
  genres: [],
  notes: null,
  sourceHash: null,
  createdAt: 0,
  ...over,
});

/** Builds a Series + its Volume/Copy rows from owned/read counts (mirrors the old flat Manga fixture). */
function fixture(opts: {
  readingStatus?: SeriesReadingStatus;
  publicationStatus?: SeriesPublicationStatus;
  owned?: number;
  read?: number;
  total?: number | null;
}): { series: Series; volumes: Volume[]; copies: Copy[] } {
  const { readingStatus = 'active', publicationStatus = 'completed', owned = 0, read = 0, total = null } = opts;
  const series = s({ readingStatus, publicationStatus, totalVolumesKnown: total });
  const n = Math.max(owned, read, total ?? 0);
  const volumes: Volume[] = [];
  const copies: Copy[] = [];
  for (let i = 1; i <= n; i++) {
    volumes.push({
      id: i,
      seriesId: series.id,
      volumeNumber: i,
      title: null,
      isbn13: null,
      isbn10: null,
      publisher: null,
      releaseDateEn: null,
      releaseDateJp: null,
      pageCount: null,
      coverUrl: null,
      coverSource: null,
      format: 'single',
      createdAt: 0,
    });
    copies.push({
      id: i,
      volumeId: i,
      owned: i <= owned,
      acquiredDate: null,
      condition: null,
      readStatus: i <= read ? 'read' : 'unread',
      readDate: null,
      rating: null,
      notes: null,
      purchaseId: null,
      createdAt: 0,
    });
  }
  return { series, volumes, copies };
}

describe('series derived helpers — reading state (finished/active/caught-up are DERIVED)', () => {
  it('dropped is never finished or active, regardless of volumes', () => {
    const { series, volumes, copies } = fixture({ readingStatus: 'dropped', owned: 30, read: 30, total: 30 });
    expect(seriesFinished(series, volumes, copies)).toBe(false);
    expect(nextVolumeToBuy(series, volumes, copies)).toBeNull();
  });

  it('owning ALL volumes but unread is NOT finished — owning ≠ having read', () => {
    // Regression guard: without the read-count gate this would derive Complete off owned alone.
    const { series, volumes, copies } = fixture({ owned: 12, read: 0, total: 12 });
    expect(seriesFinished(series, volumes, copies)).toBe(false);
    expect(nextVolumeToBuy(series, volumes, copies)).toBeNull(); // owns all 12 → nothing to buy
  });

  it('reading a complete run to the end derives finished', () => {
    const { series, volumes, copies } = fixture({ publicationStatus: 'completed', owned: 12, read: 12, total: 12 });
    expect(seriesFinished(series, volumes, copies)).toBe(true);
  });

  it('bought ahead (own 24, read 23) is not finished — read drives "done", not owned', () => {
    const { series, volumes, copies } = fixture({ owned: 24, read: 23, total: 24 });
    expect(seriesFinished(series, volumes, copies)).toBe(false);
  });

  it('an ongoing series is never finished even when fully caught up', () => {
    const { series, volumes, copies } = fixture({ publicationStatus: 'ongoing', owned: 26, read: 26, total: 26 });
    expect(seriesFinished(series, volumes, copies)).toBe(false);
    expect(seriesCaughtUp(series, volumes, copies)).toBe(true);
    expect(nextVolumeToBuy(series, volumes, copies)).toBeNull();
  });

  it('next-to-buy = owned + 1 when more volumes have released', () => {
    const { series, volumes, copies } = fixture({ owned: 20, read: 18, total: 26 });
    expect(nextVolumeToBuy(series, volumes, copies)).toBe(21);
  });
});

describe('volumePricePaid — box split with copies tagged but NO PurchaseItem rows', () => {
  const box: Purchase = { id: 7, date: '2026-01-01', source: 'bol', totalPrice: 3000, currency: 'EUR', type: 'box', estimated: false, notes: null, createdAt: 0 };
  // 3 copies (vol 1/2/3) all tagged to the box, but the purchase carries ZERO PurchaseItem rows.
  const copies: Copy[] = [1, 2, 3].map((volumeId) => ({ id: volumeId, volumeId, owned: true, acquiredDate: null, condition: null, readStatus: 'read', readDate: null, rating: null, notes: null, purchaseId: 7, createdAt: 0 }));

  it('divides the box total by the COPY count (1000 each), not by 1 (which would report 3000 each)', () => {
    for (const volumeId of [1, 2, 3]) {
      expect(volumePricePaid(volumeId, copies, [box], [])).toEqual({ amountCents: 1000, estimated: false, split: false });
    }
  });
});
