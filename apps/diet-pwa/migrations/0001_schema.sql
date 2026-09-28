-- MING-22 / diet-pwa schema.
--
-- All core data lives in D1. localStorage is only ever used for throw-away UI
-- state on the client.
--
-- Re-runnable: every statement is guarded with IF NOT EXISTS.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- foods: the editable food library.
-- Nutrition values are common public reference values per 100 g and are meant
-- to be edited by the user; they are not authoritative lab data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS foods (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL UNIQUE,
  category          TEXT    NOT NULL DEFAULT '其他',
  role              TEXT    NOT NULL DEFAULT 'mixed'
                            CHECK (role IN ('carb', 'protein', 'fat', 'vegetable', 'mixed')),
  kcal_per_100g     REAL    NOT NULL DEFAULT 0,
  protein_per_100g  REAL    NOT NULL DEFAULT 0,
  fat_per_100g      REAL    NOT NULL DEFAULT 0,
  carbs_per_100g    REAL    NOT NULL DEFAULT 0,
  enabled           INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  -- Serving constraints used by the optimizer.
  min_grams         REAL    NOT NULL DEFAULT 0,
  max_grams         REAL    NOT NULL DEFAULT 500,
  step_grams        REAL    NOT NULL DEFAULT 5,
  -- Optional display unit (e.g. 鸡蛋 shows 个) - maths always uses grams.
  unit_label        TEXT,
  unit_grams        REAL,
  is_seed           INTEGER NOT NULL DEFAULT 0 CHECK (is_seed IN (0, 1)),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_foods_enabled ON foods (enabled);
CREATE INDEX IF NOT EXISTS idx_foods_role ON foods (role);

-- ---------------------------------------------------------------------------
-- settings: a single row (id = 1) with the user's profile.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id                        INTEGER PRIMARY KEY CHECK (id = 1),
  current_weight_kg         REAL    NOT NULL DEFAULT 70,
  base_weight_kg            REAL    NOT NULL DEFAULT 70,
  base_calories             REAL    NOT NULL DEFAULT 1900,
  default_calories          REAL    NOT NULL DEFAULT 1900,
  default_training_day      INTEGER NOT NULL DEFAULT 1 CHECK (default_training_day IN (0, 1)),
  default_training_after_meal TEXT  NOT NULL DEFAULT 'lunch'
                                    CHECK (default_training_after_meal IN ('breakfast', 'lunch', 'dinner')),
  updated_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- daily_records: one row per calendar day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_records (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  date                  TEXT    NOT NULL UNIQUE,
  weight_kg             REAL    NOT NULL,
  training_day          INTEGER NOT NULL DEFAULT 0 CHECK (training_day IN (0, 1)),
  training_after_meal   TEXT    NOT NULL DEFAULT 'lunch'
                                CHECK (training_after_meal IN ('breakfast', 'lunch', 'dinner')),
  target_calories       REAL    NOT NULL DEFAULT 1900,
  -- 1 when the user manually overrode the suggested calories for that day.
  calorie_target_manual INTEGER NOT NULL DEFAULT 0 CHECK (calorie_target_manual IN (0, 1)),
  target_carbs          REAL    NOT NULL DEFAULT 0,
  target_protein        REAL    NOT NULL DEFAULT 0,
  target_fat            REAL    NOT NULL DEFAULT 0,
  actual_calories       REAL    NOT NULL DEFAULT 0,
  actual_carbs          REAL    NOT NULL DEFAULT 0,
  actual_protein        REAL    NOT NULL DEFAULT 0,
  actual_fat            REAL    NOT NULL DEFAULT 0,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records (date DESC);

-- ---------------------------------------------------------------------------
-- meal_items: the foods chosen for a day, per module, with final grams.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id   INTEGER NOT NULL REFERENCES daily_records (id) ON DELETE CASCADE,
  module      TEXT    NOT NULL
                      CHECK (module IN ('breakfast', 'lunch', 'dinner', 'postWorkout')),
  food_id     INTEGER NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  grams       REAL    NOT NULL DEFAULT 0,
  locked      INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (record_id, module, food_id)
);

CREATE INDEX IF NOT EXISTS idx_meal_items_record ON meal_items (record_id, module, sort_order);

-- ---------------------------------------------------------------------------
-- auth: PIN is only ever stored as a PBKDF2-SHA256 hash with a random salt.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_credentials (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  pin_hash        TEXT    NOT NULL,
  pin_salt        TEXT    NOT NULL,
  algorithm       TEXT    NOT NULL DEFAULT 'PBKDF2-SHA256',
  iterations      INTEGER NOT NULL DEFAULT 210000,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Long lived login: only the SHA-256 hash of the session token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    NOT NULL UNIQUE,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
