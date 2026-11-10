import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildDashboard, type Copy, type DashboardInput, type Series, type SeriesPublicationStatus, type SeriesReadingStatus, type Volume } from '../../src/index.ts';

const baseInput = (over: Partial<DashboardInput>): DashboardInput => ({
  asOf: '2026-06-21',
  config: DEFAULT_CONFIG,
  runs: [],
  recoveryDays: [],
  weightPoints: [],
  scoredStrengthSets: [],
  shoe: null,
  statHistory: [],
  series: [],
  volumes: [],
  copies: [],
  purchases: [],
  purchaseItems: [],
  exams: [],
  schoolTasks: [],
  ...over,
});

let uid = 1000;
function seriesRow(id: number, over: Partial<Series> = {}): Series {
  return { id, canonicalTitle: 'M', author: null, altTitles: [], type: 'manga', anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed', readingStatus: 'active', totalVolumesKnown: null, englishPublisher: null, readingDirection: null, coverUrl: null, genres: [], notes: null, sourceHash: null, createdAt: 0, ...over };
}
function volumeRow(seriesId: number, volumeNumber: number | null, over: Partial<Volume> = {}): Volume {
  return { id: uid++, seriesId, volumeNumber, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single', createdAt: 0, ...over };
}
function copyRow(volumeId: number, over: Partial<Copy> = {}): Copy {
  return { id: uid++, volumeId, owned: true, acquiredDate: null, condition: null, readStatus: 'unread', readDate: null, rating: null, notes: null, purchaseId: null, createdAt: 0, ...over };
}

/** A manga series with `owned`/`read` volumes out of `total` (mirrors the old flat ownedVolume/readVolume/totalVolumes Manga fixture). */
function mangaFixture(opts: { id: number; publicationStatus?: SeriesPublicationStatus; readingStatus?: SeriesReadingStatus; owned?: number; read?: number; total?: number | null }): { series: Series[]; volumes: Volume[]; copies: Copy[] } {
  const { id, publicationStatus = 'completed', readingStatus = 'active', owned = 0, read = 0, total = null } = opts;
  const series = seriesRow(id, { type: 'manga', publicationStatus, readingStatus, totalVolumesKnown: total });
  const n = Math.max(owned, read, total ?? 0);
  const volumes: Volume[] = [];
  const copies: Copy[] = [];
  for (let i = 1; i <= n; i++) {
    const v = volumeRow(id, i);
    volumes.push(v);
    copies.push(copyRow(v.id, { owned: i <= owned, readStatus: i <= read ? 'read' : 'unread' }));
  }
  return { series: [series], volumes, copies };
}
/** A plain book: one Volume(volumeNumber:null) + one Copy at the given readStatus. */
function bookFixture(id: number, readStatus: Copy['readStatus']): { series: Series[]; volumes: Volume[]; copies: Copy[] } {
  const series = seriesRow(id, { type: 'book', totalVolumesKnown: 1 });
  const v = volumeRow(id, null);
  return { series: [series], volumes: [v], copies: [copyRow(v.id, { readStatus })] };
}
function flatten(...fixtures: Array<{ series: Series[]; volumes: Volume[]; copies: Copy[] }>): { series: Series[]; volumes: Volume[]; copies: Copy[] } {
  return { series: fixtures.flatMap((f) => f.series), volumes: fixtures.flatMap((f) => f.volumes), copies: fixtures.flatMap((f) => f.copies) };
}

describe('series DTO slice — manga (deterministic over asOf)', () => {
  it('ongoing series behind on volumes: progressPct (read) + volumesBehind + the next volume to buy', () => {
    const { series, volumes, copies } = mangaFixture({ id: 1, publicationStatus: 'ongoing', owned: 21, read: 21, total: 26 });
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    const m = dto.series.find((x) => x.id === 1)!;
    expect(m.progressPct).toBe(80); // floor(read 21/26*100) — never round UP toward 100 before fully read
    expect(m.volumesBehind).toBe(5);
    expect(m.nextVolumeToBuy).toBe(22); // own 21 → buy 22
    expect(m.finished).toBe(false); // still publishing → never finished
  });

  it('OWNED vs READ: bought ahead (own 24, read 23) → not finished, nothing to buy', () => {
    const { series, volumes, copies } = mangaFixture({ id: 1, owned: 24, read: 23, total: 24 });
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    const m = dto.series.find((x) => x.id === 1)!;
    expect(m.nextVolumeToBuy).toBeNull(); // own all 24 → no buy hint
    expect(m.volumesBehind).toBe(0);
    expect(m.unreadOwned).toBe(1); // own 24, read 23
    expect(m.finished).toBe(false); // read 23 < 24 → not done
    expect(m.progressPct).toBe(95); // floor(23/24*100) — 1 vol unread, so not 100% (or even 96%)
  });

  it('finished is DERIVED: read the whole complete series → finished, nothing to buy', () => {
    const { series, volumes, copies } = flatten(
      mangaFixture({ id: 1, owned: 30, read: 30, total: 30 }),
      mangaFixture({ id: 2, owned: 0, read: 0, total: null }), // a one-shot with no totals entered yet
    );
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    const fin = dto.series.find((x) => x.id === 1)!;
    expect(fin.finished).toBe(true);
    expect(fin.nextVolumeToBuy).toBeNull(); // finished → not active
    expect(fin.volumesBehind).toBe(0);
    const oneshot = dto.series.find((x) => x.id === 2)!;
    expect(oneshot.progressPct).toBeNull(); // no totals
    expect(oneshot.nextVolumeToBuy).toBeNull();
  });

  it('caught-up ongoing series (own all released) has nothing to buy yet', () => {
    const { series, volumes, copies } = mangaFixture({ id: 1, publicationStatus: 'ongoing', owned: 26, read: 26, total: 26 });
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    const m = dto.series.find((x) => x.id === 1)!;
    expect(m.volumesBehind).toBe(0);
    expect(m.nextVolumeToBuy).toBeNull();
    expect(m.caughtUp).toBe(true);
    expect(m.progressPct).toBe(100);
  });

  it('lifeSimSummary: disjoint reading/ongoing buckets + volumesToBuy over active series only', () => {
    const { series, volumes, copies } = flatten(
      mangaFixture({ id: 1, publicationStatus: 'ongoing', owned: 21, read: 21, total: 26 }), // ongoing, 5 behind
      mangaFixture({ id: 2, owned: 1, read: 1, total: 3 }), // reading (complete-run), 2 behind
      mangaFixture({ id: 3, owned: 12, read: 12, total: 12 }), // derived finished → excluded
    );
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    expect(dto.lifeSimSummary.mangaOngoing).toBe(1);
    expect(dto.lifeSimSummary.mangaReading).toBe(1); // ongoing one is NOT also counted here
    expect(dto.lifeSimSummary.mangaFinished).toBe(1);
    expect(dto.lifeSimSummary.volumesToBuy).toBe(7); // 5 + 2; finished excluded
  });

  it('one-shot: owned 1 / read 0 → not finished (unreadOwned 1); read 1 → Complete', () => {
    const unreadFixture = mangaFixture({ id: 1, owned: 1, read: 0, total: 1 });
    const unread = buildDashboard(baseInput(unreadFixture)).series[0]!;
    expect(unread.finished).toBe(false); // read 0 → still to read
    expect(unread.unreadOwned).toBe(1); // own the one volume, haven't read it
    const doneFixture = mangaFixture({ id: 1, owned: 1, read: 1, total: 1 });
    const done = buildDashboard(baseInput(doneFixture)).series[0]!;
    expect(done.finished).toBe(true); // read 1 → complete
    expect(done.unreadOwned).toBe(0);
  });

  it('volumesToRead: Σ owned-but-unread over active manga (finished + dropped excluded)', () => {
    const { series, volumes, copies } = flatten(
      mangaFixture({ id: 1, owned: 24, read: 20, total: 31 }), // 4 owned, unread
      mangaFixture({ id: 2, owned: 1, read: 0, total: 1 }), // unread one-shot → 1
      mangaFixture({ id: 3, owned: 12, read: 12, total: 12 }), // finished → excluded
      mangaFixture({ id: 4, readingStatus: 'dropped', owned: 5, read: 2, total: 10 }), // dropped → excluded
    );
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    expect(dto.lifeSimSummary.volumesToRead).toBe(5); // 4 + 1; finished & dropped excluded
  });

  it('a DROPPED partially-read series is NOT "reading" and never inflates mangaReading/booksReading', () => {
    // Regression (defect: the derived `reading` flag lost its dropped guard). The old model's
    // status==='reading' was mutually exclusive with 'dropped'; a dropped, partially-read series
    // must stay OUT of the reading tiles (and off Home's "currently reading").
    const droppedManga = mangaFixture({ id: 1, readingStatus: 'dropped', owned: 2, read: 2, total: 5 });
    const droppedBookSeries = seriesRow(2, { type: 'book', readingStatus: 'dropped', totalVolumesKnown: 1 });
    const bv = volumeRow(2, null);
    const droppedBook = { series: [droppedBookSeries], volumes: [bv], copies: [copyRow(bv.id, { readStatus: 'read' })] };
    const { series, volumes, copies } = flatten(droppedManga, droppedBook);
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    expect(dto.series.find((s) => s.id === 1)?.reading).toBe(false);
    expect(dto.series.find((s) => s.id === 2)?.reading).toBe(false);
    expect(dto.lifeSimSummary.mangaReading).toBe(0);
    expect(dto.lifeSimSummary.booksReading).toBe(0);
  });

  it('box purchase tagged via Copy.purchaseId with NO PurchaseItem rows splits the total across copies', () => {
    // Regression (defect: volumePricePaid divided by `purchaseItems.length || 1`, so with zero item
    // rows every volume reported the FULL box total and series.totalSpentCents was 3× the real spend).
    const { series, volumes, copies } = mangaFixture({ id: 1, owned: 3, read: 0, total: 3 });
    const purchase = { id: 1, date: '2026-01-01', source: 'bol', totalPrice: 3000, currency: 'EUR', type: 'box' as const, estimated: false, notes: null, createdAt: 0 };
    copies.forEach((c) => (c.purchaseId = 1));
    const dto = buildDashboard(baseInput({ series, volumes, copies, purchases: [purchase], purchaseItems: [] }));
    const m = dto.series.find((s) => s.id === 1)!;
    expect(m.volumes.map((v) => v.pricePaid?.amountCents)).toEqual([1000, 1000, 1000]); // 3000/3, not 3000 each
    expect(m.totalSpentCents).toBe(3000); // NOT 9000
  });

  it('no series → empty slice + zeroed summary', () => {
    const dto = buildDashboard(baseInput({}));
    expect(dto.series).toEqual([]);
    expect(dto.lifeSimSummary.mangaOngoing).toBe(0);
    expect(dto.lifeSimSummary.volumesToBuy).toBe(0);
    expect(dto.lifeSimSummary.volumesToRead).toBe(0);
  });
});

describe('series DTO slice — author + copyId', () => {
  it('DashboardSeries.author surfaces from the Series (v14)', () => {
    const series = [seriesRow(1, { type: 'manga', author: 'Tite Kubo' })];
    const dto = buildDashboard(baseInput({ series, volumes: [], copies: [] }));
    expect(dto.series.find((s) => s.id === 1)?.author).toBe('Tite Kubo');
    // a series with no author surfaces null (not undefined)
    const noAuthor = buildDashboard(baseInput({ series: [seriesRow(2, { type: 'manga' })], volumes: [], copies: [] }));
    expect(noAuthor.series.find((s) => s.id === 2)?.author).toBeNull();
  });

  it('copyId is the id of the SAME copy the row reports (owned copy chosen) — can never drift from the displayed state', () => {
    // The volume has TWO copies: one read-but-unowned, one owned-but-unread. The row must display the
    // OWNED copy (owned:true, readStatus:'unread') AND expose THAT copy's id — not the read one's.
    const series = [seriesRow(1, { type: 'manga', totalVolumesKnown: 1 })];
    const v = volumeRow(1, 1);
    const readCopy = copyRow(v.id, { owned: false, readStatus: 'read' });
    const ownedCopy = copyRow(v.id, { owned: true, readStatus: 'unread' });
    const dto = buildDashboard(baseInput({ series, volumes: [v], copies: [readCopy, ownedCopy] }));
    const vol = dto.series.find((s) => s.id === 1)!.volumes[0]!;
    expect(vol.owned).toBe(true);
    expect(vol.readStatus).toBe('unread'); // the OWNED copy's status is what's displayed
    expect(vol.copyId).toBe(ownedCopy.id); // copyId points at that SAME copy…
    expect(vol.copyId).not.toBe(readCopy.id); // …never the read-but-unowned one
  });

  it('a volume with ZERO copies → copyId null (the UI disables the read-status control)', () => {
    const series = [seriesRow(1, { type: 'manga', totalVolumesKnown: 1 })];
    const v = volumeRow(1, 1);
    const dto = buildDashboard(baseInput({ series, volumes: [v], copies: [] }));
    const vol = dto.series.find((s) => s.id === 1)!.volumes[0]!;
    expect(vol.copyId).toBeNull();
    expect(vol.owned).toBe(false);
  });
});

describe('series DTO slice — books', () => {
  it('a plain book is a Series(type=book) with one Volume; progressPct reflects read/unread', () => {
    const { series, volumes, copies } = flatten(bookFixture(1, 'reading'), bookFixture(2, 'read'));
    const dto = buildDashboard(baseInput({ series, volumes, copies }));
    expect(dto.series.find((s) => s.id === 1)?.progressPct).toBe(0); // mid-read, not yet counted as read
    expect(dto.series.find((s) => s.id === 2)?.finished).toBe(true);
    expect(dto.lifeSimSummary.booksReading).toBe(1);
    expect(dto.lifeSimSummary.booksFinished).toBe(1);
  });

  it('price paid flattens onto the volume from its linked Purchase', () => {
    const { series, volumes, copies } = bookFixture(1, 'read');
    const purchase = { id: 1, date: '2026-01-01', source: 'bol', totalPrice: 1250, currency: 'EUR', type: 'single' as const, estimated: false, notes: null, createdAt: 0 };
    copies[0]!.purchaseId = 1;
    const dto = buildDashboard(baseInput({ series, volumes, copies, purchases: [purchase], purchaseItems: [{ id: 1, purchaseId: 1, volumeId: volumes[0]!.id, allocatedPrice: null }] }));
    const vol = dto.series[0]!.volumes[0]!;
    expect(vol.pricePaid).toEqual({ amountCents: 1250, estimated: false, split: false });
    expect(dto.series[0]!.totalSpentCents).toBe(1250);
  });
});
