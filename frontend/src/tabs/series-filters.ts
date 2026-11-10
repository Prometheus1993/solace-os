import type { DashboardDTO } from '@solace/core';

/**
 * The ARCHIVES shelf filters, split out of `Series.tsx` so they can be unit-tested.
 *
 * The two sub-tabs (BOOKS / MANGA) render the SAME `dto.series` array with different filter sets.
 * Their filter ids do NOT overlap (`tobuy`/`toread` are manga-only; `reading`/`backlog` book-only),
 * so a lookup of one kind's id in the other kind's matcher map yields `undefined` — and
 * `list.filter(undefined)` is a TypeError that blanks the whole area. Both entry points below are
 * therefore kind-scoped and total: they never return `undefined`, and they never evaluate a filter
 * id against the wrong map.
 */

export type SeriesItem = DashboardDTO['series'][number];
/** Which Archives sub-shelf: books (book + LN) vs manga. Same `dto.series`, filtered by `type`. */
export type Kind = 'manga' | 'book';
export type MangaFilter = 'active' | 'all' | 'tobuy' | 'toread' | 'complete';
export type BookFilter = 'active' | 'all' | 'reading' | 'complete' | 'backlog';
export type SeriesFilter = MangaFilter | BookFilter;

type Matcher = (s: SeriesItem) => boolean;

/** The default shelf view — currently-relevant series: neither finished nor dropped. Shared by both
 *  kinds (same predicate), so complete/dropped stay reachable via the other explicit tabs. */
const isActive: Matcher = (s) => !s.finished && s.readingStatus !== 'dropped';

const MANGA_MATCH: Record<MangaFilter, Matcher> = {
  active: isActive,
  all: () => true,
  tobuy: (s) => s.nextVolumeToBuy != null,
  toread: (s) => s.readingStatus !== 'dropped' && !s.finished && s.unreadOwned > 0,
  complete: (s) => s.finished,
};

const BOOK_MATCH: Record<BookFilter, Matcher> = {
  active: isActive,
  all: () => true,
  reading: (s) => s.reading && !s.finished,
  complete: (s) => s.finished,
  backlog: (s) => !s.reading && !s.finished && s.readingStatus !== 'dropped',
};

/** The matcher map for one kind. Keyed by `string`, because a stale id from the other sub-tab can reach it. */
export function matchersFor(kind: Kind): Readonly<Record<string, Matcher>> {
  return kind === 'manga' ? MANGA_MATCH : BOOK_MATCH;
}

/** Always a callable predicate. An id this kind doesn't define degrades to "All", never `undefined`. */
export function matcherFor(kind: Kind, id: string): Matcher {
  return matchersFor(kind)[id] ?? (() => true);
}

/** Lowercase + strip accents, so "jose" finds "José Saramago" and "OTOMO" finds "Katsuhiro Otomo". */
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Does a series match the shelf search box? Matches title, AUTHOR, or any genre — case- and
 * accent-insensitive, trimmed. An empty query matches everything.
 */
export function matchesQuery(s: SeriesItem, query: string): boolean {
  const q = fold(query.trim());
  if (q === '') return true;
  return [s.title, s.author ?? '', ...s.genres].some((field) => fold(field).includes(q));
}

export interface FilterTab {
  id: string;
  label: string;
  count: number;
}

/** Tabs for the ACTIVE kind ONLY — building both kinds' tabs would count one kind's ids against the other's map. */
export function filterTabsFor(kind: Kind, list: readonly SeriesItem[]): FilterTab[] {
  const cnt = (id: string): number => list.filter(matcherFor(kind, id)).length;
  return kind === 'manga'
    ? [
        { id: 'active', label: 'Active', count: cnt('active') },
        { id: 'all', label: 'All', count: list.length },
        { id: 'tobuy', label: 'To buy', count: cnt('tobuy') },
        { id: 'toread', label: 'To read', count: cnt('toread') },
        { id: 'complete', label: 'Complete', count: cnt('complete') },
      ]
    : [
        { id: 'active', label: 'Active', count: cnt('active') },
        { id: 'all', label: 'All', count: list.length },
        { id: 'reading', label: 'Reading', count: cnt('reading') },
        { id: 'backlog', label: 'Backlog', count: cnt('backlog') },
        { id: 'complete', label: 'Complete', count: cnt('complete') },
      ];
}
