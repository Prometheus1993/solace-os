import type { DashboardDTO } from '@solace/core';
import type { TerminalTarget } from './terminal-route.ts';

export type Series = DashboardDTO['series'][number];
export type Channel = 'manga' | 'books';

export const SHELF_COUNT = 3;
export const PER_SHELF = 8;
export const PAGE_SIZE = SHELF_COUNT * PER_SHELF;

/** Manga is its own channel; books and light novels share the other. */
export const channelOf = (s: Pick<Series, 'type'>): Channel => (s.type === 'manga' ? 'manga' : 'books');

/** The series of one channel whose title or author contains the query, what you are reading first, then by title. */
export function bookcaseSeries(series: readonly Series[], channel: Channel, query: string): Series[] {
  const needle = query.trim().toLowerCase();
  return series
    .filter(s => channelOf(s) === channel && `${s.title} ${s.author ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.reading) - Number(a.reading) || a.title.localeCompare(b.title));
}

export const pageCount = (total: number): number => Math.max(1, Math.ceil(total / PAGE_SIZE));

/** A page index kept inside 0..last (the collection can shrink while the bookcase is open). */
export const clampPage = (page: number, total: number): number => Math.min(Math.max(0, page), pageCount(total) - 1);

/** The shelves of one page: up to PER_SHELF series per shelf, SHELF_COUNT shelves, the rest of the page empty. */
export function pageShelves<T>(items: readonly T[], page: number): T[][] {
  const start = page * PAGE_SIZE;
  return Array.from({ length: SHELF_COUNT }, (_, i) => items.slice(start + i * PER_SHELF, start + (i + 1) * PER_SHELF));
}

/** A real image only when there is a URL and it has not failed to load; otherwise the styled placeholder. */
export const coverChoice = (url: string | null | undefined, failed: boolean): 'image' | 'placeholder' => (url && !failed ? 'image' : 'placeholder');

/** The terminal target of a cover click: SHELF, the series' channel view, that series selected. */
export const seriesTarget = (s: Pick<Series, 'id' | 'type'>): TerminalTarget => ({ folder: 'shelf', view: channelOf(s), seriesId: s.id });
