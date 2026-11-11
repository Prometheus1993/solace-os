import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXAM_STATUSES,
  PURCHASE_TYPES,
  READ_STATUSES,
  SERIES_READING_STATUSES,
  SERIES_STATUSES,
  SERIES_TYPES,
  VOLUME_FORMATS,
} from '@solace/core';
import { MIGRATIONS, migrate, openDatabase, SqliteRepository } from '../src/index.ts';

function repo() {
  const db = openDatabase(':memory:');
  migrate(db);
  return new SqliteRepository(db);
}

describe('life-sim modules — migration v4 + repository round-trip', () => {
  it('applies v4: exams table exists and starts empty (books/mangas were replaced by v13)', async () => {
    const r = repo();
    expect(await r.listSeries()).toEqual([]);
    expect(await r.listExams()).toEqual([]);
  });

  it('exams: list sorted by date; status/grade update merges (pass/fail is derived, never stored)', async () => {
    const r = repo();
    await r.addExam({ course: 'Analysis', examDate: '2026-08-20', status: 'scheduled', grade: null, resitDate: null, resitGrade: null, credits: 6, deliberated: false, notes: null });
    await r.addExam({ course: 'Linear Algebra', examDate: '2026-07-01', status: 'pending', grade: null, resitDate: null, resitGrade: null, credits: 5, deliberated: false, notes: null });
    const list = await r.listExams();
    expect(list.map((e) => e.examDate)).toEqual(['2026-07-01', '2026-08-20']);

    const upd = await r.updateExam(list[0]!.id, { status: 'graded', grade: 14 });
    expect(upd?.status).toBe('graded');
    expect(upd?.grade).toBe(14);
    expect(upd?.credits).toBe(5); // untouched
    expect(await r.deleteExam(list[0]!.id)).toBe(true);
  });

  it('exams: one record holds BOTH attempts — a failed first grade + a resit grade round-trip', async () => {
    const r = repo();
    const e = await r.addExam({ course: 'Java', examDate: '2026-01-09', status: 'graded', grade: 8, resitDate: null, resitGrade: null, credits: 3, deliberated: false, notes: null });
    expect(e.grade).toBe(8);
    expect(e.resitGrade).toBeNull();
    const upd = await r.updateExam(e.id, { resitDate: '2026-08-24', resitGrade: 12 });
    expect(upd?.grade).toBe(8); // first attempt preserved, not overwritten
    expect(upd?.resitDate).toBe('2026-08-24');
    expect(upd?.resitGrade).toBe(12);
    // a /20 grade still round-trips (v7 widened the CHECK to 0–20)
    const top = await r.addExam({ course: 'Ideation', examDate: '2026-01-08', status: 'graded', grade: 18, resitDate: null, resitGrade: null, credits: 3, deliberated: false, notes: null });
    expect(top.grade).toBe(18);
  });

  it('exams: deliberated (v18) round-trips insert → read → update → read, boolean ↔ 0/1', async () => {
    const r = repo();
    const e = await r.addExam({ course: 'Data', examDate: '2026-08-20', status: 'graded', grade: 9, resitDate: null, resitGrade: null, credits: 6, deliberated: true, notes: null });
    expect(e.deliberated).toBe(true);
    expect(e.grade).toBe(9); // the real (sub-10) grade is kept, not overwritten
    const listed = (await r.listExams()).find((x) => x.id === e.id)!;
    expect(listed.deliberated).toBe(true);

    const upd = await r.updateExam(e.id, { deliberated: false });
    expect(upd?.deliberated).toBe(false);
    const relisted = (await r.listExams()).find((x) => x.id === e.id)!;
    expect(relisted.deliberated).toBe(false);
    expect(relisted.grade).toBe(9); // untouched by the flag flip
  });

  it('school tasks (v19): add → list (deadline order) → update (merge, done flag + doneDate, nullable clears) → delete', async () => {
    const r = repo();
    expect(await r.listSchoolTasks()).toEqual([]);
    const a = await r.addSchoolTask({ title: 'Report', kind: 'task', deadline: '2026-11-20', course: 'Networking', notes: 'max 5 p.', done: false, doneDate: null });
    const b = await r.addSchoolTask({ title: 'Company visit Acme Corp', kind: 'company_visit', deadline: '2026-11-05', course: null, notes: null, done: false, doneDate: null });
    expect(a.id).toBeGreaterThan(0);
    const list = await r.listSchoolTasks();
    expect(list.map((t) => t.title)).toEqual(['Company visit Acme Corp', 'Report']);
    expect(list[1]).toMatchObject({ kind: 'task', course: 'Networking', notes: 'max 5 p.', done: false, doneDate: null });

    const done = await r.updateSchoolTask(a.id, { done: true, doneDate: '2026-11-18' });
    expect(done).toMatchObject({ done: true, doneDate: '2026-11-18', title: 'Report', course: 'Networking' }); // untouched fields kept
    const reopened = await r.updateSchoolTask(a.id, { done: false, doneDate: null, notes: null });
    expect(reopened).toMatchObject({ done: false, doneDate: null, notes: null });
    expect(await r.updateSchoolTask(9999, { title: 'nope' })).toBeNull();

    expect(await r.deleteSchoolTask(b.id)).toBe(true);
    expect(await r.deleteSchoolTask(b.id)).toBe(false);
    expect((await r.listSchoolTasks()).map((t) => t.id)).toEqual([a.id]);
  });

  it('school tasks: the DB rejects an unknown kind (CHECK backstop)', async () => {
    await expect(repo().addSchoolTask({ title: 'x', kind: 'bogus' as never, deadline: '2026-11-05', course: null, notes: null, done: false, doneDate: null })).rejects.toThrow();
  });

  it('series: manga series round-trips genres/altTitles/publication+reading status; add → list → update (merge) → delete', async () => {
    const r = repo();
    const s = await r.addSeries({
      canonicalTitle: 'Sample Saga',
      author: 'Gege Akutami',
      altTitles: ['呪術廻戦'],
      type: 'manga',
      anilistId: 113138,
      mangadexId: null,
      mangaupdatesId: null,
      malId: null,
      publicationStatus: 'ongoing',
      readingStatus: 'active',
      totalVolumesKnown: 26,
      englishPublisher: 'Example Press',
      readingDirection: 'rtl',
      coverUrl: 'https://img/jjk.jpg',
      genres: ['Action', 'Supernatural'],
      notes: null,
      sourceHash: null,
    });
    expect(s.id).toBeGreaterThan(0);
    expect(s.createdAt).toBeGreaterThan(0);
    const got = (await r.listSeries())[0]!;
    expect(got.canonicalTitle).toBe('Sample Saga');
    expect(got.author).toBe('Gege Akutami'); // v14: author persists
    expect(got.altTitles).toEqual(['呪術廻戦']); // JSON array round-trips
    expect(got.genres).toEqual(['Action', 'Supernatural']);
    expect(got.publicationStatus).toBe('ongoing');
    expect(got.readingStatus).toBe('active');
    expect(await r.getSeries(s.id)).toEqual(got);

    const upd = await r.updateSeries(s.id, { readingStatus: 'dropped', genres: ['Action', 'Drama'], author: 'Akutami Gege' });
    expect(upd?.readingStatus).toBe('dropped');
    expect(upd?.genres).toEqual(['Action', 'Drama']); // genres patch (re)serializes via lifeSimSet
    expect(upd?.author).toBe('Akutami Gege'); // author patch applies
    expect(upd?.englishPublisher).toBe('Example Press'); // untouched fields are preserved

    // author is nullable: patching it back to null round-trips (not skipped as "unset")
    const cleared = await r.updateSeries(s.id, { author: null });
    expect(cleared?.author).toBeNull();

    expect(await r.deleteSeries(s.id)).toBe(true);
    expect(await r.listSeries()).toEqual([]);
    expect(await r.updateSeries(s.id, { readingStatus: 'active' })).toBeNull(); // gone
  });

  it('series: a plain book is a Series(type=book) with exactly one Volume (volumeNumber null)', async () => {
    const r = repo();
    const s = await r.addSeries({ canonicalTitle: 'Dune', author: 'Frank Herbert', altTitles: [], type: 'book', anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed', readingStatus: 'active', totalVolumesKnown: 1, englishPublisher: null, readingDirection: null, coverUrl: null, genres: [], notes: null, sourceHash: null });
    const v = await r.addVolume({ seriesId: s.id, volumeNumber: null, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: 600, coverUrl: null, coverSource: null, format: 'single' });
    expect(v.volumeNumber).toBeNull();
    expect((await r.listVolumesBySeries(s.id)).map((x) => x.id)).toEqual([v.id]);
  });

  it('volumes: add → list → listBySeries → update (merge) → delete', async () => {
    const r = repo();
    const s = await r.addSeries({ canonicalTitle: 'Plain Tale', author: null, altTitles: [], type: 'manga', anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed', readingStatus: 'active', totalVolumesKnown: 74, englishPublisher: null, readingDirection: 'rtl', coverUrl: null, genres: [], notes: null, sourceHash: null });
    const v1 = await r.addVolume({ seriesId: s.id, volumeNumber: 1, title: 'The First Volume Title', isbn13: '9780000000002', isbn10: null, publisher: 'Example Press', releaseDateEn: '2004-01-01', releaseDateJp: null, pageCount: 192, coverUrl: null, coverSource: 'googlebooks', format: 'single' });
    await r.addVolume({ seriesId: s.id, volumeNumber: 2, title: null, isbn13: null, isbn10: null, publisher: 'Example Press', releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
    expect(v1.id).toBeGreaterThan(0);
    expect((await r.listVolumes()).map((v) => v.volumeNumber)).toEqual([1, 2]);
    expect((await r.listVolumesBySeries(s.id)).length).toBe(2);

    const upd = await r.updateVolume(v1.id, { isbn13: '9780000000000', format: 'omnibus' });
    expect(upd?.isbn13).toBe('9780000000000');
    expect(upd?.format).toBe('omnibus');
    expect(upd?.publisher).toBe('Example Press'); // untouched fields are preserved

    expect(await r.deleteVolume(v1.id)).toBe(true);
    expect((await r.listVolumesBySeries(s.id)).length).toBe(1);
  });

  it('copies: owned boolean + readStatus round-trip; add → update (merge) → delete', async () => {
    const r = repo();
    const s = await r.addSeries({ canonicalTitle: 'Tiny Tale', author: null, altTitles: [], type: 'manga', anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed', readingStatus: 'active', totalVolumesKnown: 1, englishPublisher: null, readingDirection: null, coverUrl: null, genres: [], notes: null, sourceHash: null });
    const v = await r.addVolume({ seriesId: s.id, volumeNumber: null, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
    const c = await r.addCopy({ volumeId: v.id, owned: true, acquiredDate: '2026-01-01', condition: 'new', readStatus: 'read', readDate: '2026-01-10', rating: 5, notes: null, purchaseId: null });
    expect(c.id).toBeGreaterThan(0);
    const got = (await r.listCopies())[0]!;
    expect(got.owned).toBe(true);
    expect(got.readStatus).toBe('read');
    expect(got.rating).toBe(5);
    expect((await r.listCopiesByVolume(v.id)).map((x) => x.id)).toEqual([c.id]);

    const upd = await r.updateCopy(c.id, { readStatus: 'reading', rating: null });
    expect(upd?.readStatus).toBe('reading');
    expect(upd?.rating).toBeNull();
    expect(upd?.condition).toBe('new'); // untouched fields are preserved

    const p = await r.addPurchase({ date: '2026-01-01', source: 'bol', totalPrice: 999, currency: 'EUR', type: 'single', estimated: false, notes: null });
    await r.updateCopy(c.id, { purchaseId: p.id });

    expect(await r.deleteCopy(c.id)).toBe(true);
    expect(await r.listCopies()).toEqual([]);
  });

  it('purchases + purchase items: add → list → update (merge) → addPurchaseItems → list → delete cascades items', async () => {
    const r = repo();
    const s = await r.addSeries({ canonicalTitle: 'Demon Slayer', author: null, altTitles: [], type: 'manga', anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed', readingStatus: 'active', totalVolumesKnown: 23, englishPublisher: null, readingDirection: 'rtl', coverUrl: null, genres: [], notes: null, sourceHash: null });
    const v1 = await r.addVolume({ seriesId: s.id, volumeNumber: 1, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
    const v2 = await r.addVolume({ seriesId: s.id, volumeNumber: 2, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });

    const p = await r.addPurchase({ date: '2026-02-01', source: 'example shop', totalPrice: 1899, currency: 'EUR', type: 'box', estimated: false, notes: 'box set' });
    expect(p.id).toBeGreaterThan(0);
    expect((await r.listPurchases())[0]!.type).toBe('box');

    const upd = await r.updatePurchase(p.id, { totalPrice: 1999, estimated: true });
    expect(upd?.totalPrice).toBe(1999);
    expect(upd?.estimated).toBe(true);
    expect(upd?.source).toBe('example shop'); // untouched

    const items = await r.addPurchaseItems([
      { purchaseId: p.id, volumeId: v1.id, allocatedPrice: 999 },
      { purchaseId: p.id, volumeId: v2.id, allocatedPrice: 1000 },
    ]);
    expect(items.length).toBe(2);
    expect((await r.listPurchaseItems()).length).toBe(2);

    expect(await r.deletePurchase(p.id)).toBe(true);
    expect(await r.listPurchaseItems()).toEqual([]); // cascaded via ON DELETE CASCADE
  });

  it('series: deleting a series cascades to its volumes and their copies', async () => {
    const r = repo();
    const s = await r.addSeries({ canonicalTitle: 'Long Saga', author: 'Sample Author', altTitles: [], type: 'manga', anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'ongoing', readingStatus: 'active', totalVolumesKnown: null, englishPublisher: null, readingDirection: 'rtl', coverUrl: null, genres: [], notes: null, sourceHash: null });
    const v = await r.addVolume({ seriesId: s.id, volumeNumber: 1, title: null, isbn13: null, isbn10: null, publisher: null, releaseDateEn: null, releaseDateJp: null, pageCount: null, coverUrl: null, coverSource: null, format: 'single' });
    await r.addCopy({ volumeId: v.id, owned: true, acquiredDate: null, condition: null, readStatus: 'unread', readDate: null, rating: null, notes: null, purchaseId: null });

    expect(await r.deleteSeries(s.id)).toBe(true);
    expect(await r.listVolumesBySeries(s.id)).toEqual([]);
    expect(await r.listCopiesByVolume(v.id)).toEqual([]);
  });

  it('series: a malformed/empty genres or altTitles column reads back as [] (JSON array parse is defensive)', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    // alt_titles/genres are NOT NULL; simulate a legacy/corrupt row with an empty or malformed JSON string.
    db.prepare(
      "INSERT INTO series (canonical_title, alt_titles, type, publication_status, reading_status, genres, created_at) VALUES ('Legacy', '', 'manga', 'ongoing', 'active', 'not-json', 0)",
    ).run();
    const got = (await new SqliteRepository(db).listSeries())[0]!;
    expect(got.altTitles).toEqual([]);
    expect(got.genres).toEqual([]);
  });
});

describe('life-sim CHECK enums stay in sync with the core tuples', () => {
  const checkOf = (sql: string, re: RegExp): string[] => {
    const m = sql.match(re);
    expect(m).not.toBeNull();
    return (m![1] ?? '').split(',').map((s) => s.trim().replace(/'/g, ''));
  };

  it('exams.status = EXAM_STATUSES (v8 CHECK, single source of truth; kind dropped)', () => {
    const v8 = MIGRATIONS.find((m) => m.version === 8)!.sql;
    expect([...checkOf(v8, /status\s+TEXT NOT NULL CHECK \(status IN \(([^)]+)\)\)/)].sort()).toEqual([...EXAM_STATUSES].sort());
  });

  const v13 = MIGRATIONS.find((m) => m.version === 13)!.sql;

  it('series.type = SERIES_TYPES', () => {
    expect([...checkOf(v13, /type\s+TEXT NOT NULL CHECK \(type IN \(([^)]+)\)\)/)].sort()).toEqual([...SERIES_TYPES].sort());
  });
  it('series.publication_status = SERIES_STATUSES', () => {
    expect([...checkOf(v13, /publication_status\s+TEXT NOT NULL DEFAULT 'ongoing' CHECK \(publication_status IN \(([^)]+)\)\)/)].sort()).toEqual([...SERIES_STATUSES].sort());
  });
  it('series.reading_status = SERIES_READING_STATUSES', () => {
    expect([...checkOf(v13, /reading_status\s+TEXT NOT NULL DEFAULT 'active' CHECK \(reading_status IN \(([^)]+)\)\)/)].sort()).toEqual([...SERIES_READING_STATUSES].sort());
  });
  it('volumes.format = VOLUME_FORMATS', () => {
    expect([...checkOf(v13, /format\s+TEXT NOT NULL DEFAULT 'single' CHECK \(format IN \(([^)]+)\)\)/)].sort()).toEqual([...VOLUME_FORMATS].sort());
  });
  it('copies.read_status = READ_STATUSES', () => {
    expect([...checkOf(v13, /read_status\s+TEXT NOT NULL DEFAULT 'unread' CHECK \(read_status IN \(([^)]+)\)\)/)].sort()).toEqual([...READ_STATUSES].sort());
  });
  it('purchases.type = PURCHASE_TYPES', () => {
    expect([...checkOf(v13, /type\s+TEXT NOT NULL DEFAULT 'single' CHECK \(type IN \(([^)]+)\)\)/)].sort()).toEqual([...PURCHASE_TYPES].sort());
  });

  it('rejects an invalid series.type / copies.read_status via the CHECK constraint (drift guard sanity)', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    expect(() => db.prepare("INSERT INTO series (canonical_title, type, created_at) VALUES ('x', 'not-a-type', 0)").run()).toThrow();
    db.prepare("INSERT INTO series (canonical_title, type, created_at) VALUES ('x', 'manga', 0)").run();
    db.prepare("INSERT INTO volumes (series_id, format, created_at) VALUES (1, 'single', 0)").run();
    expect(() => db.prepare("INSERT INTO copies (volume_id, read_status, created_at) VALUES (1, 'not-a-status', 0)").run()).toThrow();
    db.close();
  });
});

describe('list order is stable when created_at ties', () => {
  afterEach(() => vi.useRealTimers());

  it('listSeries breaks a created_at tie by id, newest first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    const r = repo();
    const base = { author: null, altTitles: [], type: 'book' as const, anilistId: null, mangadexId: null, mangaupdatesId: null, malId: null, publicationStatus: 'completed' as const, readingStatus: 'active' as const, totalVolumesKnown: 1, englishPublisher: null, readingDirection: null, coverUrl: null, genres: [], notes: null, sourceHash: null };
    const first = await r.addSeries({ ...base, canonicalTitle: 'First' });
    const second = await r.addSeries({ ...base, canonicalTitle: 'Second' });
    expect(second.createdAt).toBe(first.createdAt);
    expect((await r.listSeries()).map((s) => s.id)).toEqual([second.id, first.id]);
  });
});
