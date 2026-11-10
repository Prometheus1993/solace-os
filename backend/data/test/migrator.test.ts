import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate, openDatabase, SqliteRepository } from '../src/index.ts';

describe('migrator', () => {
  it('applies the migrations once and is idempotent on re-run', () => {
    const db = openDatabase(':memory:');

    expect(migrate(db).applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(migrate(db).applied).toEqual([]); // no-op second time

    const version = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
    expect(version.v).toBe(22);

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    ).map((r) => r.name);
    for (const expected of ['athlete_config', 'runs', 'run_samples', 'strength_sets', 'recovery_days', 'stat_history', 'exams', 'series', 'volumes', 'copies', 'purchases', 'purchase_items', 'school_tasks', 'app_settings']) {
      expect(tables).toContain(expected);
    }
    // v19: school_tasks columns + the kind CHECK mirror SCHOOL_TASK_KINDS
    const taskCols = (db.prepare('PRAGMA table_info(school_tasks)').all() as { name: string }[]).map((c) => c.name);
    expect(taskCols).toEqual(['id', 'title', 'kind', 'deadline', 'course', 'notes', 'done', 'done_date', 'created_at']);
    expect(() => db.prepare("INSERT INTO school_tasks (title, kind, deadline, created_at) VALUES ('x', 'bogus', '2026-01-01', 0)").run()).toThrow();
    // v13 dropped books/mangas outright (a FULL REPLACE, not additive — unlike every other life-sim migration).
    expect(tables).not.toContain('books');
    expect(tables).not.toContain('mangas');

    db.close();
  });
});

describe('strength_sets hold sets (#13): no migration needed', () => {
  it('reps, raw_weight and duration_seconds are all nullable since v1, so seconds-only rows fit as-is', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const cols = db.prepare('PRAGMA table_info(strength_sets)').all() as { name: string; notnull: number }[];
    for (const name of ['reps', 'raw_weight', 'duration_seconds', 'real_load_kg', 'weight_kg_normalized']) {
      expect(cols.find((c) => c.name === name), name).toMatchObject({ notnull: 0 });
    }
    db.close();
  });
});

describe('migrator — v20 editable goals', () => {
  it('upgrades a v19 DB: row + legacy columns + stat/weight rows survive, goals read as defaults', async () => {
    const db = openDatabase(':memory:');
    migrate(db, MIGRATIONS.filter((m) => m.version <= 19));
    db.prepare(
      `INSERT INTO athlete_config (id, age, height_cm, height_confirmed, max_hr, resting_hr_baseline, hrv_baseline_ms, sleep_need_minutes,
         hevy_convention_start, hevy_total_weight_switch_date, units_logged_in, home_lat, home_lon, peak_loads_json, comeback_loads_json, updated_at)
       VALUES (1, 34, 175, 1, 183, 58, 54, 480, '2022-01-01', '2026-03-10', 'lbs', NULL, NULL, '{"benchPressKg":55,"dbInclineKg":20,"latPulldownKg":45}', '{"bench":70}', 1700000000)`,
    ).run();
    db.prepare("INSERT INTO weight_points (date, weight_kg, body_fat_pct, source, notes) VALUES ('2026-06-01', 71.5, 22, 'manual', NULL)").run();
    db.prepare("INSERT INTO stat_history (stat, date, value, level, confidence, trigger, inputs_json) VALUES ('LEANNESS', '2026-06-01', 0.1, 3, 'low', 'first', '{}')").run();

    expect(migrate(db, MIGRATIONS.filter((m) => m.version <= 20)).applied).toEqual([20]);

    const row = db.prepare('SELECT * FROM athlete_config WHERE id = 1').get() as Record<string, unknown>;
    expect(row).toMatchObject({ age: 34, max_hr: 183, sleep_need_minutes: 480, units_logged_in: 'lbs', comeback_loads_json: '{"bench":70}', updated_at: 1700000000 });
    expect(row).toMatchObject({ goal_weight_kg: null, goal_body_fat_pct: null, goal_pace_min_per_km: null, goal_weekly_km: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM weight_points').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM stat_history').get()).toEqual({ n: 1 });

    expect(migrate(db, MIGRATIONS.filter((m) => m.version <= 21)).applied).toEqual([21]); // the repo below writes without the legacy columns
    const repo = new SqliteRepository(db);
    const cfg = await repo.getAthleteConfig();
    expect(cfg).toMatchObject({ age: 34, maxHr: 183, goals: { weightKg: null, bodyFatPct: null, paceMinPerKm: null, weeklyKm: null } });

    // saving goals round-trips
    await repo.saveAthleteConfig({ ...cfg!, goals: { weightKg: 82, bodyFatPct: 12, paceMinPerKm: 5.5, weeklyKm: 40 } });
    expect((await repo.getAthleteConfig())!.goals).toEqual({ weightKg: 82, bodyFatPct: 12, paceMinPerKm: 5.5, weeklyKm: 40 });
    db.close();
  });
});

describe('migrator — v21 drop dead tables (#42)', () => {
  const DEAD = [
    'study_plans', 'study_sessions', 'study_logs', 'gameplans', 'gameplan_subjects', 'gameplan_phases',
    'gameplan_weeks', 'gameplan_tasks', 'ai_cache', 'games', 'training_plans', 'plan_sessions', 'conversion_audit',
  ];
  const tableNames = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);

  it('drops exactly the dead tables and the 3 legacy columns, keeps every other table and row', () => {
    const db = openDatabase(':memory:');
    migrate(db, MIGRATIONS.filter((m) => m.version <= 20));
    db.prepare(
      `INSERT INTO athlete_config (id, age, height_cm, height_confirmed, max_hr, resting_hr_baseline, hrv_baseline_ms, sleep_need_minutes,
         hevy_convention_start, hevy_total_weight_switch_date, units_logged_in, home_lat, home_lon, peak_loads_json, comeback_loads_json, updated_at)
       VALUES (1, 34, 175, 1, 183, 58, 54, 480, '2022-01-01', '2026-03-10', 'lbs', NULL, NULL, '{}', '{"bench":70}', 1700000000)`,
    ).run();
    db.prepare("INSERT INTO study_plans (week_start_date, week_end_date, title, source, created_at) VALUES ('2026-01-05', '2026-01-11', 't', 'seed', 0)").run();
    db.prepare("INSERT INTO study_sessions (plan_id, date, type, course, title, detail) VALUES (1, '2026-01-05', 'review', 'c', 't', 'd')").run();
    db.prepare("INSERT INTO conversion_audit (entity_type, entity_id, conversion_type, rule_reference, created_at) VALUES ('strength_set', 1, 'barbell_plus20', 'r', 0)").run();
    db.prepare("INSERT INTO weight_points (date, weight_kg, body_fat_pct, source, notes) VALUES ('2026-06-01', 71.5, 22, 'manual', NULL)").run();
    const before = tableNames(db);

    expect(migrate(db, MIGRATIONS.filter((m) => m.version <= 21)).applied).toEqual([21]);

    const after = tableNames(db);
    expect(before.filter((n) => !after.includes(n)).sort()).toEqual([...DEAD].sort());
    expect(after.filter((n) => !before.includes(n))).toEqual([]);
    for (const keep of ['athlete_config', 'weight_points', 'strength_sets', 'series']) {
      expect(after).toContain(keep);
    }
    const cols = (db.prepare('PRAGMA table_info(athlete_config)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).not.toContain('sleep_need_minutes');
    expect(cols).not.toContain('units_logged_in');
    expect(cols).not.toContain('comeback_loads_json');
    expect(db.prepare('SELECT age, max_hr, updated_at FROM athlete_config').get()).toEqual({ age: 34, max_hr: 183, updated_at: 1700000000 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM weight_points').get()).toEqual({ n: 1 });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.close();
  });
});

describe('migrator — v13 backfill: mangas/books → series/volumes/copies', () => {
  /** A scratch DB migrated only through v12, so raw pre-v13 mangas/books rows can be seeded. */
  function dbThroughV12() {
    const db = openDatabase(':memory:');
    migrate(
      db,
      MIGRATIONS.filter((m) => m.version <= 12),
    );
    return db;
  }

  it('backfills a manga (owned=5, read=3, total=null) into 5 Volumes + 5 Copies (3 read, 2 unread), all owned', () => {
    const db = dbThroughV12();
    db.prepare(
      `INSERT INTO mangas (title, author, status, is_series, is_ongoing, owned_volume, read_volume, total_volumes, rating, started_date, finished_date, notes, cover_url, genres, source_hash, created_at)
       VALUES ('Vinland Saga', 'Makoto Yukimura', 'reading', 1, 1, 5, 3, NULL, 4, NULL, NULL, 'great art', 'https://img/vs.jpg', '["Action","Historical"]', NULL, 1700000000)`,
    ).run();

    migrate(db); // apply v13 (and anything after)

    const series = db.prepare('SELECT * FROM series').all() as Record<string, unknown>[];
    expect(series.length).toBe(1);
    const s = series[0]!;
    expect(s.canonical_title).toBe('Vinland Saga');
    expect(s.type).toBe('manga');
    expect(s.publication_status).toBe('ongoing'); // is_ongoing=1
    expect(s.reading_status).toBe('active'); // status != 'dropped'
    expect(s.total_volumes_known).toBeNull();
    expect(s.cover_url).toBe('https://img/vs.jpg');
    expect(s.genres).toBe('["Action","Historical"]');
    expect(s.notes).toBe('great art');

    const volumes = db.prepare('SELECT * FROM volumes WHERE series_id = ? ORDER BY volume_number').all(s.id as number) as Record<string, unknown>[];
    expect(volumes.length).toBe(5); // max(owned=5, read=3, 1) = 5
    expect(volumes.map((v) => v.volume_number)).toEqual([1, 2, 3, 4, 5]);

    const copies = db.prepare(
      `SELECT c.* FROM copies c JOIN volumes v ON v.id = c.volume_id WHERE v.series_id = ? ORDER BY v.volume_number`,
    ).all(s.id as number) as Record<string, unknown>[];
    expect(copies.length).toBe(5);
    expect(copies.every((c) => c.owned === 1)).toBe(true);
    expect(copies.map((c) => c.read_status)).toEqual(['read', 'read', 'read', 'unread', 'unread']);
    // series-level rating lands on volume #1's copy only
    expect(copies[0]!.rating).toBe(4);
    expect(copies.slice(1).every((c) => c.rating === null)).toBe(true);
    // finished_date is null here (still reading), so no read_date is set on any copy
    expect(copies.every((c) => c.read_date === null)).toBe(true);

    db.close();
  });

  it('backfills a completed, dropped manga: finished_date lands on the highest READ volume Copy.read_date', () => {
    const db = dbThroughV12();
    db.prepare(
      `INSERT INTO mangas (title, status, is_series, is_ongoing, owned_volume, read_volume, total_volumes, created_at, finished_date)
       VALUES ('Sample Saga', 'dropped', 1, 0, 4, 4, 4, 1700000000, '2026-03-15')`,
    ).run();

    migrate(db);

    const s = db.prepare('SELECT * FROM series').get() as Record<string, unknown>;
    expect(s.publication_status).toBe('completed'); // is_ongoing=0
    expect(s.reading_status).toBe('dropped');

    const copies = db.prepare(
      `SELECT c.* FROM copies c JOIN volumes v ON v.id = c.volume_id WHERE v.series_id = ? ORDER BY v.volume_number`,
    ).all(s.id as number) as Record<string, unknown>[];
    expect(copies.length).toBe(4);
    expect(copies.every((c) => c.read_status === 'read')).toBe(true);
    // only the highest read volume (vol 4, since read_volume=4) carries the old finished_date
    expect(copies[3]!.read_date).toBe('2026-03-15');
    expect(copies.slice(0, 3).every((c) => c.read_date === null)).toBe(true);

    db.close();
  });

  it('backfills a book into a Series(type=book, totalVolumesKnown=1) + exactly one Volume (volume_number NULL) + one Copy', () => {
    const db = dbThroughV12();
    db.prepare(
      `INSERT INTO books (title, author, status, total_pages, current_page, started_date, finished_date, rating, notes, source_hash, created_at)
       VALUES ('Dune', 'Frank Herbert', 'finished', 600, 600, '2026-01-01', '2026-01-20', 5, 'reread candidate', NULL, 1700000000)`,
    ).run();

    migrate(db);

    const series = db.prepare("SELECT * FROM series WHERE type = 'book'").all() as Record<string, unknown>[];
    expect(series.length).toBe(1);
    const s = series[0]!;
    expect(s.canonical_title).toBe('Dune');
    expect(s.total_volumes_known).toBe(1);
    expect(s.publication_status).toBe('completed');
    expect(s.reading_status).toBe('active');
    expect(s.notes).toBe('reread candidate');

    const volumes = db.prepare('SELECT * FROM volumes WHERE series_id = ?').all(s.id as number) as Record<string, unknown>[];
    expect(volumes.length).toBe(1);
    expect(volumes[0]!.volume_number).toBeNull();
    expect(volumes[0]!.page_count).toBe(600);

    const copies = db.prepare('SELECT * FROM copies WHERE volume_id = ?').all(volumes[0]!.id as number) as Record<string, unknown>[];
    expect(copies.length).toBe(1);
    expect(copies[0]!.read_status).toBe('read'); // book.status 'finished' -> 'read'
    expect(copies[0]!.read_date).toBe('2026-01-20');
    expect(copies[0]!.rating).toBe(5);

    db.close();
  });

  it('maps every book.status per the documented table: finished→read, reading→reading, dnf→dnf, backlog→unread', () => {
    const db = dbThroughV12();
    const insert = db.prepare(
      `INSERT INTO books (title, status, created_at) VALUES (?, ?, 0)`,
    );
    insert.run('B-finished', 'finished');
    insert.run('B-reading', 'reading');
    insert.run('B-dnf', 'dnf');
    insert.run('B-backlog', 'backlog');

    migrate(db);

    const rows = db.prepare(
      `SELECT s.canonical_title AS title, c.read_status FROM series s
       JOIN volumes v ON v.series_id = s.id
       JOIN copies c ON c.volume_id = v.id
       WHERE s.type = 'book' ORDER BY s.canonical_title`,
    ).all() as { title: string; read_status: string }[];

    expect(rows).toEqual([
      { title: 'B-backlog', read_status: 'unread' },
      { title: 'B-dnf', read_status: 'dnf' },
      { title: 'B-finished', read_status: 'read' },
      { title: 'B-reading', read_status: 'reading' },
    ]);

    db.close();
  });

  it('books and mangas are dropped after the backfill; the Repository sees only Series rows', async () => {
    const db = dbThroughV12();
    db.prepare(`INSERT INTO mangas (title, status, is_series, is_ongoing, created_at) VALUES ('M', 'reading', 1, 1, 0)`).run();
    db.prepare(`INSERT INTO books (title, status, created_at) VALUES ('B', 'backlog', 0)`).run();

    migrate(db);

    const tableNames = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(tableNames).not.toContain('mangas');
    expect(tableNames).not.toContain('books');

    const repo = new SqliteRepository(db);
    const all = await repo.listSeries();
    expect(all.map((s) => s.canonicalTitle).sort()).toEqual(['B', 'M']);

    db.close();
  });
});

describe('migrator — v14: series.author (additive ALTER)', () => {
  /** A scratch DB migrated only through v13, so the series table exists WITHOUT the author column. */
  function dbThroughV13() {
    const db = openDatabase(':memory:');
    migrate(
      db,
      MIGRATIONS.filter((m) => m.version <= 13),
    );
    return db;
  }

  it('applies v14 and adds the author column to series', () => {
    const db = dbThroughV13();
    const before = (db.prepare('PRAGMA table_info(series)').all() as { name: string }[]).map((c) => c.name);
    expect(before).not.toContain('author'); // v13 rebuild dropped it

    const { applied } = migrate(db); // apply v14 (and anything after)
    expect(applied).toContain(14);

    const after = (db.prepare('PRAGMA table_info(series)').all() as { name: string }[]).map((c) => c.name);
    expect(after).toContain('author');

    db.close();
  });

  it('is ADDITIVE: a series row seeded before v14 SURVIVES with author IS NULL (a rebuild would have dropped it)', () => {
    const db = dbThroughV13();
    db.prepare(
      `INSERT INTO series (canonical_title, type, publication_status, reading_status, created_at)
       VALUES ('Sample Saga', 'manga', 'ongoing', 'active', 1700000000)`,
    ).run();

    migrate(db); // apply v14

    const rows = db.prepare('SELECT canonical_title, author FROM series').all() as { canonical_title: string; author: string | null }[];
    expect(rows.length).toBe(1); // the pre-existing row was NOT dropped
    expect(rows[0]!.canonical_title).toBe('Sample Saga');
    expect(rows[0]!.author).toBeNull(); // additive ADD COLUMN → existing row gets NULL

    db.close();
  });
});

describe('migrator — v17: gameplans.source_hash is no longer GLOBALLY unique', () => {
  /** A scratch DB migrated only through v16, so gameplans.source_hash still carries the old UNIQUE. */
  function dbThroughV16() {
    const db = openDatabase(':memory:');
    migrate(
      db,
      MIGRATIONS.filter((m) => m.version <= 16),
    );
    return db;
  }

  it('a duplicate source_hash across two rows is REJECTED before v17, ALLOWED after', () => {
    const db = dbThroughV16();
    const insert = () =>
      db
        .prepare(`INSERT INTO gameplans (title, source, source_hash, created_at) VALUES ('GP', 'cli_import', 'samehash', 1700000000)`)
        .run();
    insert();
    expect(insert).toThrow(/UNIQUE constraint failed/);

    migrate(db, MIGRATIONS.filter((m) => m.version <= 17)); // apply v17 (v21 would drop gameplans)
    expect(insert).not.toThrow(); // a superseded plan's hash can now be re-imported as a new row

    const rows = db.prepare('SELECT COUNT(*) AS n FROM gameplans WHERE source_hash = ?').get('samehash') as { n: number };
    expect(rows.n).toBe(2);

    db.close();
  });

  it('is ADDITIVE for existing rows: a gameplan seeded before v17 SURVIVES unchanged (a lossy rebuild would have dropped it)', () => {
    const db = dbThroughV16();
    db.prepare(
      `INSERT INTO gameplans (start_date, title, exam_from, exam_to, note, source, source_hash, created_at)
       VALUES ('2026-07-27', 'Sample Plan', '2026-08-24', '2026-09-08', 'a note', 'cli_import', 'abc123', 1700000000)`,
    ).run();

    migrate(db, MIGRATIONS.filter((m) => m.version <= 17)); // apply v17 (v21 would drop gameplans)

    const rows = db.prepare('SELECT * FROM gameplans').all() as Record<string, unknown>[];
    expect(rows.length).toBe(1);
    expect(rows[0]!.title).toBe('Sample Plan');
    expect(rows[0]!.exam_from).toBe('2026-08-24');
    expect(rows[0]!.source_hash).toBe('abc123');

    db.close();
  });

  it('does NOT cascade-delete gameplan_subjects/phases/weeks/tasks (the real regression: DROP TABLE gameplans while foreign_keys=ON cascades into any live child)', () => {
    const db = dbThroughV16();
    const planId = Number(
      db
        .prepare(`INSERT INTO gameplans (start_date, title, exam_from, exam_to, note, source, source_hash, created_at) VALUES (NULL, 'GP', NULL, NULL, NULL, 'cli_import', 'h1', 1700000000)`)
        .run().lastInsertRowid,
    );
    db.prepare(`INSERT INTO gameplan_subjects (plan_id, subject_key, name, icon, weight, exam_type, exam_date, order_index) VALUES (?, 'ds', 'Data Structures', NULL, NULL, NULL, '2026-09-07', 0)`).run(planId);
    db.prepare(`INSERT INTO gameplan_phases (plan_id, phase_key, title, goal, order_index) VALUES (?, 'f1', 'Fundament', NULL, 0)`).run(planId);
    db.prepare(`INSERT INTO gameplan_weeks (plan_id, week_key, label, from_date, to_date, phase_key, focus, order_index) VALUES (?, 'w1', 'Week 1', '2026-07-09', '2026-07-15', 'f1', '[]', 0)`).run(planId);
    const taskId = Number(
      db
        .prepare(`INSERT INTO gameplan_tasks (plan_id, task_key, phase_key, week_key, subject_key, title, type, est_hours, priority, exam_ref, study_ref, acceptance, depends_on, done, done_at, order_index) VALUES (?, 't1', 'f1', 'w1', 'ds', 'Recursie', 'drill', 1.5, 'hoog', NULL, NULL, NULL, '[]', 1, 1700000500, 0)`)
        .run(planId).lastInsertRowid,
    );

    migrate(db, MIGRATIONS.filter((m) => m.version <= 17)); // apply v17 (v21 would drop gameplans)

    expect((db.prepare('SELECT COUNT(*) AS n FROM gameplan_subjects WHERE plan_id = ?').get(planId) as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS n FROM gameplan_phases WHERE plan_id = ?').get(planId) as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS n FROM gameplan_weeks WHERE plan_id = ?').get(planId) as { n: number }).n).toBe(1);
    const task = db.prepare('SELECT * FROM gameplan_tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    expect(task).toBeDefined();
    expect(task!.done).toBe(1);
    expect(task!.done_at).toBe(1700000500);

    // FK integrity + cascade behaviour must survive the rebuild too.
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.prepare('DELETE FROM gameplans WHERE id = ?').run(planId);
    expect((db.prepare('SELECT COUNT(*) AS n FROM gameplan_tasks WHERE plan_id = ?').get(planId) as { n: number }).n).toBe(0);

    db.close();
  });
});
