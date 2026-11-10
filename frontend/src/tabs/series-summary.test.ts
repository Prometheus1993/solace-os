import { describe, expect, it } from 'vitest';
import { centsToEurInput, nextToBuyList, parseEurToCents, spendSubtitle, toBuyTile } from './series-summary.ts';
import type { SeriesItem } from './series-filters.ts';

const s = (over: Partial<SeriesItem>): SeriesItem =>
  ({
    id: 1,
    title: 'S',
    author: null,
    type: 'manga',
    publicationStatus: 'completed',
    readingStatus: 'active',
    totalVolumesKnown: null,
    coverUrl: null,
    genres: [],
    englishPublisher: null,
    notes: null,
    ownedCount: 0,
    readCount: 0,
    progressPct: null,
    nextVolumeToBuy: null,
    volumesBehind: null,
    unreadOwned: 0,
    finished: false,
    caughtUp: false,
    reading: false,
    totalSpentCents: null,
    volumes: [],
    ...over,
  }) as SeriesItem;

describe('nextToBuyList — filter + sort, never truncated', () => {
  it('keeps only series with a next volume to buy', () => {
    const list = [
      s({ id: 1, title: 'A', nextVolumeToBuy: 5, volumesBehind: 2 }),
      s({ id: 2, title: 'B', nextVolumeToBuy: null }),
      s({ id: 3, title: 'C', nextVolumeToBuy: 3, volumesBehind: 1 }),
    ];
    expect(nextToBuyList(list).map((x) => x.id)).toEqual([1, 3]);
  });

  it('sorts by volumesBehind desc, with a title tiebreak', () => {
    const list = [
      s({ id: 1, title: 'Zeta', nextVolumeToBuy: 2, volumesBehind: 3 }),
      s({ id: 2, title: 'Alpha', nextVolumeToBuy: 2, volumesBehind: 3 }), // tie with #1 → title breaks it
      s({ id: 3, title: 'Long Saga', nextVolumeToBuy: 24, volumesBehind: 86 }),
      s({ id: 4, title: 'Other Saga', nextVolumeToBuy: 10, volumesBehind: 1 }),
    ];
    // 86 first; then the two 3s ordered Alpha < Zeta; then 1.
    expect(nextToBuyList(list).map((x) => x.title)).toEqual(['Long Saga', 'Alpha', 'Zeta', 'Other Saga']);
  });

  it('treats a null volumesBehind as 0 without throwing', () => {
    const list = [
      s({ id: 1, title: 'A', nextVolumeToBuy: 1, volumesBehind: null }),
      s({ id: 2, title: 'B', nextVolumeToBuy: 1, volumesBehind: 4 }),
    ];
    expect(nextToBuyList(list).map((x) => x.id)).toEqual([2, 1]);
  });

  it('never truncates — 27 in, 27 out', () => {
    const list = Array.from({ length: 27 }, (_, i) => s({ id: i + 1, title: `T${i}`, nextVolumeToBuy: i + 1, volumesBehind: i }));
    expect(nextToBuyList(list)).toHaveLength(27);
  });
});

describe('toBuyTile — series count vs volume count', () => {
  it('counts the SERIES with a next volume and carries the total volumes through the param', () => {
    // 27 series need a volume; the DTO says 367 volumes behind in total.
    const list = Array.from({ length: 27 }, (_, i) => s({ id: i + 1, nextVolumeToBuy: i + 1, volumesBehind: i }));
    expect(toBuyTile(list, 367)).toEqual({ seriesCount: 27, volumeCount: 367, danger: true });
  });

  it('is not danger when nothing is to buy', () => {
    expect(toBuyTile([], 0)).toEqual({ seriesCount: 0, volumeCount: 0, danger: false });
  });
});

describe('spendSubtitle — three-way, never repeats the headline', () => {
  it('shows the estimated slice when it is a PART of the total', () => {
    expect(spendSubtitle(10000, 3000)).toBe('incl. €30.00 est.');
  });

  it('says "all estimated" when EVERY euro is estimated (est === total — the bug)', () => {
    // 6151.77 total, 6151.77 estimated: the old code rendered "incl. €6151.77 est." — the same number twice.
    expect(spendSubtitle(615177, 615177)).toBe('all estimated (no receipts)');
  });

  it('falls back to "across purchases" when there is no estimate', () => {
    expect(spendSubtitle(10000, 0)).toBe('across purchases');
  });
});

describe('parseEurToCents / centsToEurInput — the buy-confirm price field', () => {
  it('accepts comma or dot decimals and a € sign, returning integer cents', () => {
    expect(parseEurToCents('10,99')).toBe(1099);
    expect(parseEurToCents('10.99')).toBe(1099);
    expect(parseEurToCents('€ 11')).toBe(1100);
    expect(parseEurToCents('8,5')).toBe(850);
    expect(parseEurToCents('0,29')).toBe(29); // no float drift (0.29 * 100 = 28.999…)
  });

  it('rejects empty, zero, negative, and garbage input', () => {
    for (const bad of ['', '0', '0,00', '-5', 'abc', '10,999', '1.2.3']) expect(parseEurToCents(bad)).toBeNull();
  });

  it('round-trips through the input formatter', () => {
    expect(centsToEurInput(1099)).toBe('10,99');
    expect(parseEurToCents(centsToEurInput(1250))).toBe(1250);
  });
});
