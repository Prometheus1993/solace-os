import { describe, expect, it } from 'vitest';
import { filterTabsFor, matcherFor, matchersFor, matchesQuery, type SeriesItem } from './series-filters.ts';

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

const LIST: SeriesItem[] = [
  s({ id: 1, nextVolumeToBuy: 22, volumesBehind: 5, unreadOwned: 2, reading: true }),
  s({ id: 2, finished: true }),
  s({ id: 3, readingStatus: 'dropped' }),
  s({ id: 4 }), // untouched → book "backlog"
];

describe('series filters — kind-scoped, never undefined', () => {
  // The bug: `Series.tsx` built BOTH kinds' tab arrays but resolved matchers by the ACTIVE kind, so
  // rendering the manga shelf evaluated `cnt('reading')` → `mangaMatch['reading']` → undefined →
  // `list.filter(undefined)` → "TypeError: undefined is not a function". It blanked ALL of ARCHIVES.
  // A `f as MangaFilter` cast hid it from tsc.
  it('a filter id the kind does not define degrades to "All" instead of returning undefined', () => {
    // 'reading' is book-only; 'tobuy' is manga-only.
    expect(matchersFor('manga')['reading']).toBeUndefined();
    expect(matchersFor('book')['tobuy']).toBeUndefined();

    // …but the public accessor is TOTAL: always a callable predicate.
    expect(typeof matcherFor('manga', 'reading')).toBe('function');
    expect(typeof matcherFor('book', 'tobuy')).toBe('function');
    expect(() => LIST.filter(matcherFor('manga', 'reading'))).not.toThrow();
    expect(LIST.filter(matcherFor('manga', 'reading'))).toHaveLength(LIST.length); // degrades to All
  });

  it('building each kind\'s tabs never throws and never evaluates the other kind\'s ids', () => {
    expect(() => filterTabsFor('manga', LIST)).not.toThrow();
    expect(() => filterTabsFor('book', LIST)).not.toThrow();
    expect(filterTabsFor('manga', LIST).map((t) => t.id)).toEqual(['active', 'all', 'tobuy', 'toread', 'complete']);
    expect(filterTabsFor('book', LIST).map((t) => t.id)).toEqual(['active', 'all', 'reading', 'backlog', 'complete']);
    for (const kind of ['manga', 'book'] as const) {
      for (const t of filterTabsFor(kind, LIST)) expect(Number.isInteger(t.count)).toBe(true);
    }
  });

  it('counts the right rows per kind', () => {
    const manga = Object.fromEntries(filterTabsFor('manga', LIST).map((t) => [t.id, t.count]));
    expect(manga['active']).toBe(2); // #1, #4 — neither finished nor dropped
    expect(manga['all']).toBe(4);
    expect(manga['tobuy']).toBe(1); // only #1 has nextVolumeToBuy
    expect(manga['toread']).toBe(1); // #1: active, unfinished, unreadOwned > 0
    expect(manga['complete']).toBe(1); // #2

    const book = Object.fromEntries(filterTabsFor('book', LIST).map((t) => [t.id, t.count]));
    expect(book['active']).toBe(2); // #1, #4 — neither finished nor dropped
    expect(book['all']).toBe(4);
    expect(book['reading']).toBe(1); // #1
    expect(book['complete']).toBe(1); // #2
    expect(book['backlog']).toBe(1); // #4 (#3 is dropped)
  });

  it('an empty shelf still yields tabs with zero counts (no books in the collection)', () => {
    expect(() => filterTabsFor('book', [])).not.toThrow();
    expect(filterTabsFor('book', []).every((t) => t.count === 0)).toBe(true);
  });
});

describe('matchesQuery — the shelf search box', () => {
  const blindnessBook = s({ title: 'Blindness', author: 'José Saramago', type: 'book', genres: ['Literary Fiction'] });

  it('matches the author, not just title/genre', () => {
    expect(matchesQuery(blindnessBook, 'saramago')).toBe(true);
    expect(matchesQuery(blindnessBook, 'blind')).toBe(true);
    expect(matchesQuery(blindnessBook, 'literary')).toBe(true);
    expect(matchesQuery(blindnessBook, 'murakami')).toBe(false);
  });

  it('is case- and accent-insensitive and trims the query', () => {
    expect(matchesQuery(blindnessBook, '  JOSE ')).toBe(true);
    expect(matchesQuery(s({ author: 'Katsuhiro Otomo' }), 'ōtomo')).toBe(true);
  });

  it('an empty query matches everything; a null author never throws', () => {
    expect(matchesQuery(s({ author: null }), '')).toBe(true);
    expect(matchesQuery(s({ author: null }), 'anyone')).toBe(false);
  });
});
