import { describe, expect, it } from 'vitest';
import { bookcaseSeries, channelOf, clampPage, coverChoice, pageCount, pageShelves, PAGE_SIZE, PER_SHELF, SHELF_COUNT, seriesTarget, type Series } from './bookcase-state.ts';
import { ARROWS, CANVAS, HEADER, SHELVES } from './bookcase-parts.ts';
import { boxPercent, COVER, coverBox } from './bookcase-layout.ts';

const s = (id: number, title: string, over: Partial<Series> = {}): Series =>
  ({ id, title, author: null, type: 'manga', reading: false, ...over }) as Series;

describe('channel filter and search', () => {
  const all = [s(1, 'Berserk'), s(2, 'Dune', { type: 'book', author: 'Frank Herbert' }), s(3, 'Mushishi Light', { type: 'LN' }), s(4, 'Akira')];
  it('splits manga from books and light novels', () => {
    expect(channelOf(all[0]!)).toBe('manga');
    expect(bookcaseSeries(all, 'manga', '').map(x => x.id)).toEqual([4, 1]);
    expect(bookcaseSeries(all, 'books', '').map(x => x.id)).toEqual([2, 3]);
  });
  it('matches title or author, case-insensitive and trimmed', () => {
    expect(bookcaseSeries(all, 'books', '  herbert ').map(x => x.id)).toEqual([2]);
    expect(bookcaseSeries(all, 'manga', 'BERS').map(x => x.id)).toEqual([1]);
    expect(bookcaseSeries(all, 'manga', 'zzz')).toEqual([]);
  });
  it('puts what you are reading first, then orders by title, without mutating the input', () => {
    const list = [s(1, 'Berserk'), s(2, 'Zetman', { reading: true }), s(3, 'Akira')];
    expect(bookcaseSeries(list, 'manga', '').map(x => x.id)).toEqual([2, 3, 1]);
    expect(list.map(x => x.id)).toEqual([1, 2, 3]);
  });
});

describe('paging', () => {
  it('holds 3 shelves of 8 = 24 per page', () => { expect(PAGE_SIZE).toBe(24); expect([SHELF_COUNT, PER_SHELF]).toEqual([3, 8]); });
  it('counts at least one page', () => {
    expect([0, 1, 24, 25, 48, 49].map(pageCount)).toEqual([1, 1, 1, 2, 2, 3]);
  });
  it('clamps the page into range', () => {
    expect(clampPage(-1, 50)).toBe(0);
    expect(clampPage(2, 50)).toBe(2);
    expect(clampPage(3, 50)).toBe(2);
    expect(clampPage(5, 0)).toBe(0);
  });
  it('fills shelves left to right, top to bottom, per page', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const first = pageShelves(items, 0);
    expect(first.map(r => r.length)).toEqual([8, 8, 8]);
    expect(first[1]![0]).toBe(8);
    const second = pageShelves(items, 1);
    expect(second.map(r => r.length)).toEqual([6, 0, 0]);
    expect(second[0]![0]).toBe(24);
    expect(pageShelves([], 0)).toEqual([[], [], []]);
  });
});

describe('cover or placeholder', () => {
  it('uses the image only with a URL that has not failed', () => {
    expect(coverChoice('/c.jpg', false)).toBe('image');
    expect(coverChoice('/c.jpg', true)).toBe('placeholder');
    expect(coverChoice(null, false)).toBe('placeholder');
    expect(coverChoice(undefined, false)).toBe('placeholder');
    expect(coverChoice('', false)).toBe('placeholder');
  });
});

describe('cover click target', () => {
  it('opens SHELF on the series channel view with that series', () => {
    expect(seriesTarget({ id: 12, type: 'manga' })).toEqual({ folder: 'shelf', view: 'manga', seriesId: 12 });
    expect(seriesTarget({ id: 7, type: 'LN' })).toEqual({ folder: 'shelf', view: 'books', seriesId: 7 });
  });
});

describe('layout from the art numbers', () => {
  it('has the capacity the paging assumes', () => {
    expect(SHELVES).toHaveLength(SHELF_COUNT);
    for (const shelf of SHELVES) expect(shelf.capacity).toBe(PER_SHELF);
  });
  it('keeps every cover inside its shelf cover area, bottom behind the lip', () => {
    SHELVES.forEach((shelf, i) => {
      for (let slot = 0; slot < PER_SHELF; slot++) {
        const b = coverBox(i, slot);
        expect(b.x).toBeGreaterThanOrEqual(shelf.coverArea.x);
        expect(b.x + b.w).toBeLessThanOrEqual(shelf.coverArea.x + shelf.coverArea.w + 1e-6);
        expect(b.y).toBeGreaterThanOrEqual(shelf.coverArea.y);
        expect(b.y + b.h).toBeGreaterThan(shelf.lipTopY);
        expect(b.y + b.h).toBeLessThanOrEqual(shelf.shelfTopSurfaceY);
        if (slot > 0) expect(b.x).toBeGreaterThan(coverBox(i, slot - 1).x + COVER.w);
      }
    });
  });
  it('keeps header and arrows on the canvas and expresses boxes as canvas percentages', () => {
    for (const r of [HEADER, ARROWS.left, ARROWS.right]) { expect(r.x + r.w).toBeLessThanOrEqual(CANVAS.w); expect(r.y + r.h).toBeLessThanOrEqual(CANVAS.h); }
    expect(boxPercent({ x: 1400, y: 900, w: 280, h: 180 })).toEqual({ x: 50, y: 50, w: 10, h: 10 });
  });
});
