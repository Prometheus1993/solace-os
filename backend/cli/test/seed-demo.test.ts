import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixedClock, parsePriceTable } from '@solace/core';
import { assembleDashboard, demoDbPath, migrate, openDatabase, SqliteRepository } from '@solace/data';
import { prepareDemoDb, seedDemo } from '../src/commands/seed-demo.ts';

const TABLE = parsePriceTable({
  version: 1,
  defaultCents: 999,
  oneShotCents: 1399,
  publisherStandard: { 'example press': 1099, 'sample house': 1499, 'demo books': 1699 },
  publisherEdition: {},
  seriesOverrides: {},
  seriesVolumeOverrides: {},
});
const TODAY = '2026-11-11';
const clock = fixedClock(Date.parse(`${TODAY}T12:00:00Z`) / 1000, TODAY);

async function seeded() {
  const db = openDatabase(':memory:');
  migrate(db);
  const repo = new SqliteRepository(db);
  await seedDemo(repo, clock, TABLE);
  return { db, repo };
}

// createdAt is the repository's wall clock, so it is left out of the comparison.
const strip = (rows: object[]) => rows.map((r) => ({ ...r, createdAt: undefined }));

describe('seedDemo', () => {
  it('is deterministic: the same date gives identical data', async () => {
    const a = await seeded();
    const b = await seeded();
    for (const read of [(r: SqliteRepository) => r.getRuns(), (r: SqliteRepository) => r.getStrengthSets(), (r: SqliteRepository) => r.getWeightPoints(), (r: SqliteRepository) => r.getRecoveryDays(), (r: SqliteRepository) => r.getStatHistory()]) {
      expect(await read(b.repo)).toEqual(await read(a.repo));
    }
    for (const read of [(r: SqliteRepository) => r.listExams(), (r: SqliteRepository) => r.listSchoolTasks(), (r: SqliteRepository) => r.listSeries(), (r: SqliteRepository) => r.listVolumes(), (r: SqliteRepository) => r.listCopies(), (r: SqliteRepository) => r.listPurchases()]) {
      expect(strip(await read(b.repo))).toEqual(strip(await read(a.repo)));
    }
    a.db.close();
    b.db.close();
  });

  it('gives a current dashboard with non-zero stats and the promised variety', async () => {
    const { db, repo } = await seeded();
    const dto = await assembleDashboard(repo, clock);
    expect(dto).not.toBeNull();
    const history = await repo.getStatHistory();
    for (const stat of ['STAMINA', 'STRENGTH', 'LEANNESS'] as const) {
      expect(history.filter((h) => h.stat === stat).at(-1)!.value).toBeGreaterThan(0);
    }
    expect((await repo.getRecoveryDays()).some((d) => d.date === TODAY)).toBe(true);
    expect((await repo.getRuns()).length).toBeGreaterThan(20);
    expect((await repo.getStrengthSessions()).length).toBeGreaterThan(5);

    const exams = await repo.listExams();
    expect(exams.some((e) => e.resitDate !== null && e.resitGrade !== null)).toBe(true);
    expect(exams.some((e) => e.deliberated && e.grade !== null && e.grade < 10)).toBe(true);
    expect((await repo.listSchoolTasks()).length).toBeGreaterThan(3);
    db.close();
  });

  it('follows the money and Copy rules: integer cents, linked copies, no box, receipt + estimate, mixed read state', async () => {
    const { db, repo } = await seeded();
    const [purchases, items, copies, series] = await Promise.all([repo.listPurchases(), repo.listPurchaseItems(), repo.listCopies(), repo.listSeries()]);
    expect(purchases.length).toBeGreaterThan(0);
    expect(purchases.every((p) => p.type === 'single' && Number.isInteger(p.totalPrice))).toBe(true);
    expect(purchases.some((p) => p.estimated)).toBe(true);
    expect(purchases.some((p) => !p.estimated)).toBe(true);
    for (const item of items) {
      const copy = copies.find((c) => c.volumeId === item.volumeId);
      expect(copy?.purchaseId).toBe(item.purchaseId);
    }
    expect(series.some((s) => s.type === 'manga')).toBe(true);
    expect(series.some((s) => s.type === 'book')).toBe(true);
    expect(new Set(copies.map((c) => c.readStatus))).toEqual(new Set(['read', 'reading', 'unread']));
    db.close();
  });
});

describe('prepareDemoDb', () => {
  const project = () => {
    const cwd = mkdtempSync(join(tmpdir(), 'solace-demo-'));
    mkdirSync(join(cwd, 'data'));
    return cwd;
  };

  it('targets data/demo.sqlite only and refuses when it exists without --reset', () => {
    const cwd = project();
    expect(prepareDemoDb(false, cwd)).toBe(demoDbPath(cwd));
    writeFileSync(demoDbPath(cwd), '');
    expect(() => prepareDemoDb(false, cwd)).toThrow(/--reset/);
  });

  it('--reset deletes the demo trio and nothing else', () => {
    const cwd = project();
    const demo = demoDbPath(cwd);
    const live = join(cwd, 'data', 'solace.sqlite');
    for (const f of [demo, `${demo}-wal`, `${demo}-shm`, live]) writeFileSync(f, '');
    expect(prepareDemoDb(true, cwd)).toBe(demo);
    expect([demo, `${demo}-wal`, `${demo}-shm`].some(existsSync)).toBe(false);
    expect(existsSync(live)).toBe(true);
  });
});
