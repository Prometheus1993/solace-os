/**
 * The full normalized schema, as ordered forward-only migrations.
 *
 * Raw export data lands here; the conventions engine (backend/core) produces
 * the *corrected* derived columns (weight_kg_normalized, real_load_kg,
 * corrected_temperature_c, ...). Each conversion rule is applied in one place (the
 * conventions engine) and persisted as the corrected columns next to the raw ones.
 */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const INITIAL = `
-- Single-row athlete config. Peak/comeback loads stored as JSON.
CREATE TABLE athlete_config (
  id                            INTEGER PRIMARY KEY CHECK (id = 1),
  age                           INTEGER NOT NULL,
  height_cm                     REAL,
  height_confirmed              INTEGER NOT NULL DEFAULT 0,
  max_hr                        INTEGER NOT NULL,
  resting_hr_baseline           REAL NOT NULL,
  hrv_baseline_ms               REAL NOT NULL,
  sleep_need_minutes            INTEGER NOT NULL,
  hevy_convention_start         TEXT NOT NULL,
  hevy_total_weight_switch_date TEXT NOT NULL,
  units_logged_in               TEXT NOT NULL CHECK (units_logged_in IN ('kg','lbs')),
  home_lat                      REAL,
  home_lon                      REAL,
  peak_loads_json               TEXT NOT NULL,
  comeback_loads_json           TEXT NOT NULL,
  updated_at                    INTEGER NOT NULL
);

CREATE TABLE shoes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  model             TEXT NOT NULL,
  prior_counted_km  REAL NOT NULL,
  notes             TEXT
);

CREATE TABLE runs (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file_hash         TEXT NOT NULL UNIQUE,
  start_time_utc           INTEGER NOT NULL,
  start_time_local         TEXT NOT NULL,
  sport                    TEXT NOT NULL,
  total_distance_m         REAL NOT NULL,
  total_duration_s         REAL NOT NULL,
  avg_hr_bpm               REAL,
  max_hr_bpm               REAL,
  avg_enhanced_speed_mps   REAL,
  avg_cadence              REAL,
  avg_power_w              REAL,
  start_lat_deg            REAL,
  start_lon_deg            REAL,
  elevation_gain_m         REAL,
  temperature_source       TEXT NOT NULL DEFAULT 'none' CHECK (temperature_source IN ('fit','weather','none')),
  corrected_temperature_c  REAL,
  shoe_id                  INTEGER REFERENCES shoes(id)
);

CREATE TABLE run_samples (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  t_offset_s          INTEGER NOT NULL,
  heart_rate_bpm      REAL,
  enhanced_speed_mps  REAL,
  speed_mps           REAL,
  cadence             REAL,
  power_w             REAL,
  lat_deg             REAL,
  lon_deg             REAL,
  altitude_m          REAL,
  distance_m          REAL,
  temperature_c       REAL
);
CREATE INDEX idx_run_samples_run ON run_samples(run_id);

CREATE TABLE run_laps (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  lap_index        INTEGER NOT NULL,
  start_time_utc   INTEGER NOT NULL,
  total_distance_m REAL NOT NULL,
  total_duration_s REAL NOT NULL,
  avg_hr_bpm       REAL,
  max_hr_bpm       REAL,
  avg_speed_mps    REAL
);
CREATE INDEX idx_run_laps_run ON run_laps(run_id);

CREATE TABLE strength_sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source_row_hash     TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  start_time_utc      INTEGER NOT NULL,
  pre_2022            INTEGER NOT NULL DEFAULT 0,
  logging_convention  TEXT NOT NULL CHECK (logging_convention IN ('one_dumbbell_plus_bar','total_weight'))
);

CREATE TABLE strength_sets (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id           INTEGER NOT NULL REFERENCES strength_sessions(id) ON DELETE CASCADE,
  exercise_title_raw   TEXT NOT NULL,
  exercise_name        TEXT NOT NULL,
  equipment            TEXT NOT NULL CHECK (equipment IN ('barbell','dumbbell','machine','cable','other')),
  superset_id          TEXT,
  set_index            INTEGER,
  set_type             TEXT NOT NULL,
  raw_weight           REAL,
  raw_weight_unit      TEXT NOT NULL CHECK (raw_weight_unit IN ('kg','lbs')),
  reps                 REAL,
  rpe                  REAL,
  distance_miles       REAL,
  duration_seconds     REAL,
  weight_kg_normalized REAL,
  real_load_kg         REAL,
  correction_applied   TEXT,
  excluded_from_trend  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_strength_sets_session ON strength_sets(session_id);

CREATE TABLE weight_points (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  weight_kg     REAL NOT NULL,
  body_fat_pct  REAL,
  source        TEXT NOT NULL CHECK (source IN ('manual','screenshot')),
  notes         TEXT
);
CREATE INDEX idx_weight_points_date ON weight_points(date);

CREATE TABLE recovery_days (
  date              TEXT PRIMARY KEY,
  sleep_score       REAL,
  hrv_overnight_ms  REAL,
  resting_hr_bpm    REAL,
  body_battery      REAL,
  source            TEXT NOT NULL CHECK (source IN ('garmin_csv','manual'))
);

CREATE TABLE weather_cache (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  lat_2dp                REAL NOT NULL,
  lon_2dp                REAL NOT NULL,
  date                   TEXT NOT NULL,
  hour                   INTEGER NOT NULL,
  temperature_2m_c       REAL NOT NULL,
  relative_humidity_pct  REAL,
  apparent_temperature_c REAL,
  UNIQUE (lat_2dp, lon_2dp, date, hour)
);

CREATE TABLE conversion_audit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type     TEXT NOT NULL,
  entity_id       INTEGER NOT NULL,
  conversion_type TEXT NOT NULL,
  input_value     REAL,
  output_value    REAL,
  rule_reference  TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_conversion_audit_entity ON conversion_audit(entity_type, entity_id);

CREATE TABLE stat_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  stat        TEXT NOT NULL CHECK (stat IN ('STAMINA','STRENGTH','LEANNESS')),
  date        TEXT NOT NULL,
  value       REAL NOT NULL,
  level       INTEGER NOT NULL,
  confidence  TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  trigger     TEXT NOT NULL,
  inputs_json TEXT NOT NULL
);
CREATE INDEX idx_stat_history_stat ON stat_history(stat, date);
`;

// plan tables (dropped in v21)
const TRAINING_PLANS = `
CREATE TABLE training_plans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start_date TEXT NOT NULL,
  week_end_date   TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT,
  source          TEXT NOT NULL CHECK (source IN ('cli_import','seed')),
  source_hash     TEXT UNIQUE,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_training_plans_week ON training_plans(week_start_date);

CREATE TABLE plan_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id        INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  day_label      TEXT,
  type           TEXT NOT NULL CHECK (type IN ('easy_run','tempo_run','long_run','strength','rest','mobility','cross')),
  title          TEXT NOT NULL,
  target_km      REAL,
  target_hr_low  INTEGER,
  target_hr_high INTEGER,
  zone           INTEGER,
  detail         TEXT NOT NULL,
  order_in_day   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_plan_sessions_plan ON plan_sessions(plan_id, date);
`;

// v3: recovery_days source enum extended (table rebuild)
const RECOVERY_SOURCE_GARMIN_MCP = `
CREATE TABLE recovery_days_new (
  date              TEXT PRIMARY KEY,
  sleep_score       REAL,
  hrv_overnight_ms  REAL,
  resting_hr_bpm    REAL,
  body_battery      REAL,
  source            TEXT NOT NULL CHECK (source IN ('garmin_csv','manual','garmin_mcp'))
);
INSERT INTO recovery_days_new (date, sleep_score, hrv_overnight_ms, resting_hr_bpm, body_battery, source)
  SELECT date, sleep_score, hrv_overnight_ms, resting_hr_bpm, body_battery, source FROM recovery_days;
DROP TABLE recovery_days;
ALTER TABLE recovery_days_new RENAME TO recovery_days;
`;

// v4: life-sim tables (some dropped in v21)
const LIFE_SIM_MODULES = `
CREATE TABLE books (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  author        TEXT,
  status        TEXT NOT NULL CHECK (status IN ('backlog','reading','finished','dnf')),
  total_pages   INTEGER,
  current_page  INTEGER,
  started_date  TEXT,
  finished_date TEXT,
  rating        INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  notes         TEXT,
  source_hash   TEXT UNIQUE,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_books_status ON books(status);

CREATE TABLE games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  platform        TEXT,
  status          TEXT NOT NULL CHECK (status IN ('backlog','playing','completed','dropped')),
  trophies_total  INTEGER,
  trophies_earned INTEGER,
  platinum        INTEGER NOT NULL DEFAULT 0,
  started_date    TEXT,
  completed_date  TEXT,
  rating          INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  notes           TEXT,
  source_hash     TEXT UNIQUE,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_games_status ON games(status);

CREATE TABLE exams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  course     TEXT NOT NULL,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('exam','resit')),
  exam_date  TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('scheduled','passed','failed_resit')),
  grade      REAL CHECK (grade IS NULL OR (grade BETWEEN 1 AND 10)),
  credits    REAL,
  notes      TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_exams_date ON exams(exam_date);
`;

// v5: study tables (dropped in v21)
const STUDY_MODULES = `
CREATE TABLE study_plans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start_date TEXT NOT NULL,
  week_end_date   TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT,
  source          TEXT NOT NULL CHECK (source IN ('cli_import','seed')),
  source_hash     TEXT UNIQUE,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_study_plans_week ON study_plans(week_start_date);

CREATE TABLE study_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id        INTEGER NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  day_label      TEXT,
  type           TEXT NOT NULL CHECK (type IN ('review','practice','past_exam','summary','memorize','rest')),
  course         TEXT NOT NULL,
  title          TEXT NOT NULL,
  target_minutes INTEGER,
  detail         TEXT NOT NULL,
  order_in_day   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_study_sessions_plan ON study_sessions(plan_id, date);

CREATE TABLE study_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  course     TEXT NOT NULL,
  minutes    INTEGER NOT NULL,
  notes      TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_study_logs_date ON study_logs(date);
`;

// v6: manga table (replaced in v13)
const MANGA_MODULE = `
CREATE TABLE mangas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  author         TEXT,
  status         TEXT NOT NULL CHECK (status IN ('backlog','reading','ongoing','finished','dropped')),
  is_series      INTEGER NOT NULL DEFAULT 1,
  current_volume INTEGER,
  total_volumes  INTEGER,
  rating         INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  started_date   TEXT,
  finished_date  TEXT,
  notes          TEXT,
  source_hash    TEXT UNIQUE,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_mangas_status ON mangas(status);
`;

// v7: exams grade scale widened to 0-20 (table rebuild)
const EXAM_GRADE_SCALE_20 = `
CREATE TABLE exams_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  course     TEXT NOT NULL,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('exam','resit')),
  exam_date  TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('scheduled','passed','failed_resit')),
  grade      REAL CHECK (grade IS NULL OR (grade BETWEEN 0 AND 20)),
  credits    REAL,
  notes      TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO exams_new (id, course, title, kind, exam_date, status, grade, credits, notes, created_at)
  SELECT id, course, title, kind, exam_date, status, grade, credits, notes, created_at FROM exams;
DROP TABLE exams;
ALTER TABLE exams_new RENAME TO exams;
CREATE INDEX idx_exams_date ON exams(exam_date);
`;

// v8: exam model consolidated (table rebuild)
const EXAM_CONSOLIDATE_RESITS = `
CREATE TABLE exams_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course      TEXT NOT NULL,
  exam_date   TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('scheduled','pending','graded')),
  grade       REAL CHECK (grade IS NULL OR (grade BETWEEN 0 AND 20)),
  resit_date  TEXT,
  resit_grade REAL CHECK (resit_grade IS NULL OR (resit_grade BETWEEN 0 AND 20)),
  credits     REAL,
  notes       TEXT,
  created_at  INTEGER NOT NULL
);
INSERT INTO exams_new (id, course, exam_date, status, grade, resit_date, resit_grade, credits, notes, created_at)
  SELECT id, course, exam_date,
    CASE status WHEN 'scheduled' THEN 'scheduled' ELSE 'graded' END,
    grade, NULL, NULL, credits, notes, created_at FROM exams;
DROP TABLE exams;
ALTER TABLE exams_new RENAME TO exams;
CREATE INDEX idx_exams_date ON exams(exam_date);
`;

// v9: gameplan tables (dropped in v21)
const GAMEPLAN_MODULE = `
CREATE TABLE gameplans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date  TEXT,
  title       TEXT NOT NULL,
  exam_from   TEXT,
  exam_to     TEXT,
  note        TEXT,
  source      TEXT NOT NULL CHECK (source IN ('cli_import','seed')),
  source_hash TEXT UNIQUE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE gameplan_subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES gameplans(id) ON DELETE CASCADE,
  subject_key TEXT NOT NULL,
  name        TEXT NOT NULL,
  icon        TEXT,
  weight      TEXT,
  exam_type   TEXT,
  exam_date   TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_gameplan_subjects_plan ON gameplan_subjects(plan_id);

CREATE TABLE gameplan_phases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES gameplans(id) ON DELETE CASCADE,
  phase_key   TEXT NOT NULL,
  title       TEXT NOT NULL,
  goal        TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_gameplan_phases_plan ON gameplan_phases(plan_id);

CREATE TABLE gameplan_weeks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES gameplans(id) ON DELETE CASCADE,
  week_key    TEXT NOT NULL,
  label       TEXT NOT NULL,
  from_date   TEXT NOT NULL,
  to_date     TEXT NOT NULL,
  phase_key   TEXT,
  focus       TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_gameplan_weeks_plan ON gameplan_weeks(plan_id);

CREATE TABLE gameplan_tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES gameplans(id) ON DELETE CASCADE,
  task_key    TEXT NOT NULL,
  phase_key   TEXT,
  week_key    TEXT,
  subject_key TEXT,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('drill','theorie','bouw-app','mock','herhaling','checklist')),
  est_hours   REAL,
  priority    TEXT CHECK (priority IS NULL OR priority IN ('hoog','midden','laag')),
  exam_ref    TEXT,
  study_ref   TEXT,
  acceptance  TEXT,
  depends_on  TEXT NOT NULL DEFAULT '[]',
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_gameplan_tasks_plan ON gameplan_tasks(plan_id);
`;

// v10: ai_cache (dropped in v21)
const AI_CACHE = `
CREATE TABLE ai_cache (
  kind       TEXT NOT NULL,
  cache_key  TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, cache_key)
);
`;

// v11: manga model simplified (table rebuild)
const MANGA_SIMPLIFY = `
CREATE TABLE mangas_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  author         TEXT,
  status         TEXT NOT NULL CHECK (status IN ('backlog','reading','dropped')),
  is_series      INTEGER NOT NULL DEFAULT 1,
  is_ongoing     INTEGER NOT NULL DEFAULT 0,
  owned_volume   INTEGER,
  read_volume    INTEGER,
  total_volumes  INTEGER,
  rating         INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  started_date   TEXT,
  finished_date  TEXT,
  notes          TEXT,
  cover_url      TEXT,
  source_hash    TEXT UNIQUE,
  created_at     INTEGER NOT NULL
);
INSERT INTO mangas_new (id, title, author, status, is_series, is_ongoing, owned_volume, read_volume, total_volumes, rating, started_date, finished_date, notes, cover_url, source_hash, created_at)
SELECT id, title, author,
  CASE status WHEN 'dropped' THEN 'dropped' WHEN 'backlog' THEN 'backlog' ELSE 'reading' END,
  is_series,
  CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END,
  current_volume,
  current_volume,
  total_volumes, rating, started_date, finished_date, notes,
  NULL,
  source_hash, created_at
FROM mangas;
DROP TABLE mangas;
ALTER TABLE mangas_new RENAME TO mangas;
CREATE INDEX idx_mangas_status ON mangas(status);
`;

// v13: books + mangas replaced by Series/Volume/Copy/Purchase/PurchaseItem
const SERIES_VOLUME_COPY_PURCHASE = `
CREATE TABLE series (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_title      TEXT NOT NULL,
  alt_titles           TEXT NOT NULL DEFAULT '[]',
  type                 TEXT NOT NULL CHECK (type IN ('manga','book','LN')),
  anilist_id           INTEGER,
  mangadex_id          TEXT,
  mangaupdates_id      TEXT,
  mal_id               INTEGER,
  publication_status   TEXT NOT NULL DEFAULT 'ongoing' CHECK (publication_status IN ('ongoing','completed','hiatus')),
  reading_status       TEXT NOT NULL DEFAULT 'active' CHECK (reading_status IN ('active','dropped')),
  total_volumes_known  INTEGER,
  english_publisher    TEXT,
  reading_direction    TEXT CHECK (reading_direction IS NULL OR reading_direction IN ('ltr','rtl')),
  cover_url            TEXT,
  genres               TEXT NOT NULL DEFAULT '[]',
  notes                TEXT,
  source_hash          TEXT UNIQUE,
  created_at           INTEGER NOT NULL
);
CREATE INDEX idx_series_type ON series(type);

CREATE TABLE volumes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id        INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  volume_number    REAL,
  title            TEXT,
  isbn13           TEXT,
  isbn10           TEXT,
  publisher        TEXT,
  release_date_en  TEXT,
  release_date_jp  TEXT,
  page_count       INTEGER,
  cover_url        TEXT,
  cover_source     TEXT,
  format           TEXT NOT NULL DEFAULT 'single' CHECK (format IN ('single','omnibus','digital')),
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_volumes_series ON volumes(series_id, volume_number);

CREATE TABLE purchases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT,
  source      TEXT,
  total_price INTEGER,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  type        TEXT NOT NULL DEFAULT 'single' CHECK (type IN ('single','box')),
  estimated   INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_purchases_date ON purchases(date);

CREATE TABLE copies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  volume_id     INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
  owned         INTEGER NOT NULL DEFAULT 1,
  acquired_date TEXT,
  condition     TEXT,
  read_status   TEXT NOT NULL DEFAULT 'unread' CHECK (read_status IN ('unread','reading','read','dnf')),
  read_date     TEXT,
  rating        INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  notes         TEXT,
  purchase_id   INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_copies_volume ON copies(volume_id);
CREATE INDEX idx_copies_purchase ON copies(purchase_id);

CREATE TABLE purchase_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id     INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  volume_id       INTEGER NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
  allocated_price INTEGER
);
CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_volume ON purchase_items(volume_id);

-- ── Backfill: mangas → Series(type='manga') + synthetic Volume/Copy rows ──
INSERT INTO series (canonical_title, alt_titles, type, publication_status, reading_status, total_volumes_known, cover_url, genres, notes, source_hash, created_at)
SELECT title, '[]', 'manga',
  CASE WHEN is_ongoing = 1 THEN 'ongoing' ELSE 'completed' END,
  CASE WHEN status = 'dropped' THEN 'dropped' ELSE 'active' END,
  total_volumes, cover_url, COALESCE(genres, '[]'), notes, source_hash, created_at
FROM mangas ORDER BY id;

CREATE TEMP TABLE manga_series_map AS
SELECT m.id AS manga_id, s.id AS series_id FROM
  (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM mangas) m
JOIN (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM series WHERE type = 'manga') s
ON m.rn = s.rn;

WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq LIMIT 10000)
INSERT INTO volumes (series_id, volume_number, format, created_at)
SELECT map.series_id, seq.n, 'single', m.created_at
FROM mangas m
JOIN manga_series_map map ON map.manga_id = m.id
JOIN seq ON seq.n <= max(COALESCE(m.owned_volume, 0), COALESCE(m.read_volume, 0), 1);

INSERT INTO copies (volume_id, owned, read_status, rating, read_date, created_at)
SELECT v.id, 1,
  CASE WHEN v.volume_number <= COALESCE(m.read_volume, 0) THEN 'read' ELSE 'unread' END,
  CASE WHEN v.volume_number = 1 THEN m.rating ELSE NULL END,
  CASE WHEN m.read_volume IS NOT NULL AND v.volume_number = m.read_volume THEN m.finished_date ELSE NULL END,
  m.created_at
FROM volumes v
JOIN manga_series_map map ON map.series_id = v.series_id
JOIN mangas m ON m.id = map.manga_id;

-- ── Backfill: books → Series(type='book') + exactly one Volume/Copy (no per-volume concept) ──
INSERT INTO series (canonical_title, alt_titles, type, publication_status, reading_status, total_volumes_known, genres, notes, source_hash, created_at)
SELECT title, '[]', 'book', 'completed', 'active', 1, '[]', notes, source_hash, created_at
FROM books ORDER BY id;

CREATE TEMP TABLE book_series_map AS
SELECT b.id AS book_id, s.id AS series_id FROM
  (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM books) b
JOIN (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM series WHERE type = 'book') s
ON b.rn = s.rn;

INSERT INTO volumes (series_id, volume_number, page_count, format, created_at)
SELECT map.series_id, NULL, b.total_pages, 'single', b.created_at
FROM books b JOIN book_series_map map ON map.book_id = b.id;

INSERT INTO copies (volume_id, owned, read_status, read_date, rating, created_at)
SELECT v.id, 1,
  CASE b.status WHEN 'finished' THEN 'read' WHEN 'reading' THEN 'reading' WHEN 'dnf' THEN 'dnf' ELSE 'unread' END,
  b.finished_date, b.rating, b.created_at
FROM volumes v
JOIN book_series_map map ON map.series_id = v.series_id
JOIN books b ON b.id = map.book_id;

DROP TABLE manga_series_map;
DROP TABLE book_series_map;
DROP TABLE mangas;
DROP TABLE books;
`;

// v15: games columns (table dropped in v21)
const GAMES_PSN_SYNC = `
ALTER TABLE games ADD COLUMN np_communication_id TEXT;
ALTER TABLE games ADD COLUMN playtime_minutes    INTEGER;
ALTER TABLE games ADD COLUMN first_played        TEXT;
ALTER TABLE games ADD COLUMN last_played         TEXT;
CREATE UNIQUE INDEX idx_games_np_comm ON games(np_communication_id) WHERE np_communication_id IS NOT NULL;
`;

// v16: gameplan task column (table dropped in v21)
const GAMEPLAN_STUDY_URL = `
ALTER TABLE gameplan_tasks ADD COLUMN study_url TEXT;
`;

// v17: gameplans rebuild (tables dropped in v21)
const GAMEPLAN_SOURCE_HASH_NOT_UNIQUE = `
CREATE TABLE gameplans_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date  TEXT,
  title       TEXT NOT NULL,
  exam_from   TEXT,
  exam_to     TEXT,
  note        TEXT,
  source      TEXT NOT NULL CHECK (source IN ('cli_import','seed')),
  source_hash TEXT,
  created_at  INTEGER NOT NULL
);
INSERT INTO gameplans_new (id, start_date, title, exam_from, exam_to, note, source, source_hash, created_at)
  SELECT id, start_date, title, exam_from, exam_to, note, source, source_hash, created_at FROM gameplans;

CREATE TABLE gameplan_subjects_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES gameplans_new(id) ON DELETE CASCADE,
  subject_key TEXT NOT NULL,
  name        TEXT NOT NULL,
  icon        TEXT,
  weight      TEXT,
  exam_type   TEXT,
  exam_date   TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);
INSERT INTO gameplan_subjects_new (id, plan_id, subject_key, name, icon, weight, exam_type, exam_date, order_index)
  SELECT id, plan_id, subject_key, name, icon, weight, exam_type, exam_date, order_index FROM gameplan_subjects;

CREATE TABLE gameplan_phases_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES gameplans_new(id) ON DELETE CASCADE,
  phase_key   TEXT NOT NULL,
  title       TEXT NOT NULL,
  goal        TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);
INSERT INTO gameplan_phases_new (id, plan_id, phase_key, title, goal, order_index)
  SELECT id, plan_id, phase_key, title, goal, order_index FROM gameplan_phases;

CREATE TABLE gameplan_weeks_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES gameplans_new(id) ON DELETE CASCADE,
  week_key    TEXT NOT NULL,
  label       TEXT NOT NULL,
  from_date   TEXT NOT NULL,
  to_date     TEXT NOT NULL,
  phase_key   TEXT,
  focus       TEXT NOT NULL DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0
);
INSERT INTO gameplan_weeks_new (id, plan_id, week_key, label, from_date, to_date, phase_key, focus, order_index)
  SELECT id, plan_id, week_key, label, from_date, to_date, phase_key, focus, order_index FROM gameplan_weeks;

CREATE TABLE gameplan_tasks_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES gameplans_new(id) ON DELETE CASCADE,
  task_key    TEXT NOT NULL,
  phase_key   TEXT,
  week_key    TEXT,
  subject_key TEXT,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('drill','theorie','bouw-app','mock','herhaling','checklist')),
  est_hours   REAL,
  priority    TEXT CHECK (priority IS NULL OR priority IN ('hoog','midden','laag')),
  exam_ref    TEXT,
  study_ref   TEXT,
  study_url   TEXT,
  acceptance  TEXT,
  depends_on  TEXT NOT NULL DEFAULT '[]',
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0
);
INSERT INTO gameplan_tasks_new (id, plan_id, task_key, phase_key, week_key, subject_key, title, type, est_hours, priority, exam_ref, study_ref, study_url, acceptance, depends_on, done, done_at, order_index)
  SELECT id, plan_id, task_key, phase_key, week_key, subject_key, title, type, est_hours, priority, exam_ref, study_ref, study_url, acceptance, depends_on, done, done_at, order_index FROM gameplan_tasks;

-- Drop CHILDREN first (order among them doesn't matter — none reference each other), THEN the
-- parent, so no ON DELETE CASCADE ever fires against live data.
DROP TABLE gameplan_tasks;
DROP TABLE gameplan_weeks;
DROP TABLE gameplan_phases;
DROP TABLE gameplan_subjects;
DROP TABLE gameplans;

ALTER TABLE gameplans_new RENAME TO gameplans;
ALTER TABLE gameplan_subjects_new RENAME TO gameplan_subjects;
ALTER TABLE gameplan_phases_new RENAME TO gameplan_phases;
ALTER TABLE gameplan_weeks_new RENAME TO gameplan_weeks;
ALTER TABLE gameplan_tasks_new RENAME TO gameplan_tasks;

CREATE INDEX idx_gameplan_subjects_plan ON gameplan_subjects(plan_id);
CREATE INDEX idx_gameplan_phases_plan ON gameplan_phases(plan_id);
CREATE INDEX idx_gameplan_weeks_plan ON gameplan_weeks(plan_id);
CREATE INDEX idx_gameplan_tasks_plan ON gameplan_tasks(plan_id);
`;

// v18: exams.deliberated flag
const EXAM_DELIBERATED = `
ALTER TABLE exams ADD COLUMN deliberated INTEGER NOT NULL DEFAULT 0;
`;

// v19: school_tasks table
const SCHOOL_TASKS = `
CREATE TABLE school_tasks (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','company_visit','other')),
  deadline   TEXT NOT NULL,
  course     TEXT,
  notes      TEXT,
  done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  done_date  TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_school_tasks_deadline ON school_tasks(deadline);
`;

// v20: editable goal columns on athlete_config
const ATHLETE_GOALS = `
ALTER TABLE athlete_config ADD COLUMN goal_weight_kg REAL;
ALTER TABLE athlete_config ADD COLUMN goal_body_fat_pct REAL;
ALTER TABLE athlete_config ADD COLUMN goal_pace_min_per_km REAL;
ALTER TABLE athlete_config ADD COLUMN goal_weekly_km REAL;
`;

// v21: drop dead tables and legacy athlete_config columns
const DROP_DEAD_TABLES = `
DROP TABLE IF EXISTS gameplan_tasks;
DROP TABLE IF EXISTS gameplan_weeks;
DROP TABLE IF EXISTS gameplan_phases;
DROP TABLE IF EXISTS gameplan_subjects;
DROP TABLE IF EXISTS gameplans;
DROP TABLE IF EXISTS study_sessions;
DROP TABLE IF EXISTS study_logs;
DROP TABLE IF EXISTS study_plans;
DROP TABLE IF EXISTS ai_cache;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS plan_sessions;
DROP TABLE IF EXISTS training_plans;
DROP TABLE IF EXISTS conversion_audit;
ALTER TABLE athlete_config DROP COLUMN sleep_need_minutes;
ALTER TABLE athlete_config DROP COLUMN units_logged_in;
ALTER TABLE athlete_config DROP COLUMN comeback_loads_json;
`;

// v22: settings key/value table
const APP_SETTINGS = `
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'initial_schema', sql: INITIAL },
  { version: 2, name: 'training_plans', sql: TRAINING_PLANS },
  { version: 3, name: 'recovery_source_garmin_mcp', sql: RECOVERY_SOURCE_GARMIN_MCP },
  { version: 4, name: 'life_sim_modules', sql: LIFE_SIM_MODULES },
  { version: 5, name: 'study_modules', sql: STUDY_MODULES },
  { version: 6, name: 'manga_module', sql: MANGA_MODULE },
  { version: 7, name: 'exam_grade_scale_20', sql: EXAM_GRADE_SCALE_20 },
  { version: 8, name: 'exam_consolidate_resits', sql: EXAM_CONSOLIDATE_RESITS },
  { version: 9, name: 'gameplan_module', sql: GAMEPLAN_MODULE },
  { version: 10, name: 'ai_cache', sql: AI_CACHE },
  { version: 11, name: 'manga_simplify', sql: MANGA_SIMPLIFY },
  // v12: manga genres column
  { version: 12, name: 'manga_genres', sql: 'ALTER TABLE mangas ADD COLUMN genres TEXT;' },
  { version: 13, name: 'series_volume_copy_purchase', sql: SERIES_VOLUME_COPY_PURCHASE },
  // v14: series author column
  { version: 14, name: 'series_author', sql: 'ALTER TABLE series ADD COLUMN author TEXT;' },
  // v15: games columns (table dropped in v21)
  { version: 15, name: 'games_psn_sync', sql: GAMES_PSN_SYNC },
  { version: 16, name: 'gameplan_study_url', sql: GAMEPLAN_STUDY_URL },
  { version: 17, name: 'gameplan_source_hash_not_unique', sql: GAMEPLAN_SOURCE_HASH_NOT_UNIQUE },
  { version: 18, name: 'exam_deliberated', sql: EXAM_DELIBERATED },
  { version: 19, name: 'school_tasks', sql: SCHOOL_TASKS },
  { version: 20, name: 'athlete_goals', sql: ATHLETE_GOALS },
  { version: 21, name: 'drop_dead_tables', sql: DROP_DEAD_TABLES },
  { version: 22, name: 'app_settings', sql: APP_SETTINGS },
];
