/**
 * D1 data access layer.
 *
 * Every core entity (food library, settings, daily records, meal items,
 * credentials, sessions) is persisted through this module. Route handlers and
 * the nutrition code never talk to D1 directly, which keeps SQL in one place.
 */

import type {
  DailyRecord,
  DailyRecordWithPlan,
  Food,
  FoodInput,
  MealItem,
  MealPlan,
  ModuleKey,
  Settings,
  SettingsInput,
  TrainingAfterMeal,
} from '../shared/types';
import { MODULE_KEYS } from '../shared/types';
import { computeSuggestedCalories } from '../shared/nutrition/targets';

export interface D1ResultLike {
  success: boolean;
}

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<D1ResultLike>;
}

export interface Database {
  prepare(query: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<unknown[]>;
}

/** One row of the `foods` table, as D1 returns it. */
export interface FoodRow {
  id: number;
  name: string;
  category: string;
  role: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  enabled: number;
  min_grams: number;
  max_grams: number;
  step_grams: number;
  serving_enabled: number;
  unit_label: string | null;
  unit_grams: number | null;
  kcal_per_serving: number | null;
  protein_per_serving: number | null;
  fat_per_serving: number | null;
  carbs_per_serving: number | null;
  serving_step: number;
  created_at: string;
  updated_at: string;
}

interface SettingsRow {
  current_weight_kg: number;
  base_weight_kg: number;
  base_calories: number;
  default_calories: number;
  default_training_day: number;
  default_training_after_meal: string;
}

interface DailyRecordRow {
  id: number;
  date: string;
  weight_kg: number;
  training_day: number;
  training_after_meal: string;
  target_calories: number;
  calorie_target_manual: number;
  target_carbs: number;
  target_protein: number;
  target_fat: number;
  actual_calories: number;
  actual_carbs: number;
  actual_protein: number;
  actual_fat: number;
}

/** One row of the `meal_items` table, as D1 returns it. */
export interface MealItemRow {
  module: string;
  food_id: number;
  grams: number;
  quantity_type: string;
  servings: number;
  locked: number;
  sort_order: number;
}

export function mapFoodRow(row: FoodRow): Food {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    role: row.role as Food['role'],
    kcalPer100g: row.kcal_per_100g,
    proteinPer100g: row.protein_per_100g,
    fatPer100g: row.fat_per_100g,
    carbsPer100g: row.carbs_per_100g,
    enabled: row.enabled === 1,
    minGrams: row.min_grams,
    maxGrams: row.max_grams,
    stepGrams: row.step_grams,
    servingEnabled: row.serving_enabled === 1,
    unitLabel: row.unit_label,
    unitGrams: row.unit_grams,
    kcalPerServing: row.kcal_per_serving,
    proteinPerServing: row.protein_per_serving,
    fatPerServing: row.fat_per_serving,
    carbsPerServing: row.carbs_per_serving,
    servingStep: row.serving_step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecord(row: DailyRecordRow): DailyRecord {
  return {
    date: row.date,
    weightKg: row.weight_kg,
    trainingDay: row.training_day === 1,
    trainingAfterMeal: row.training_after_meal as TrainingAfterMeal,
    targetCalories: row.target_calories,
    calorieTargetManual: row.calorie_target_manual === 1,
    targetCarbs: row.target_carbs,
    targetProtein: row.target_protein,
    targetFat: row.target_fat,
    actualCalories: row.actual_calories,
    actualCarbs: row.actual_carbs,
    actualProtein: row.actual_protein,
    actualFat: row.actual_fat,
  };
}

function emptyPlan(): MealPlan {
  return { breakfast: [], lunch: [], dinner: [], postWorkout: [] };
}

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

const FOOD_COLUMNS = `id, name, category, role, kcal_per_100g, protein_per_100g, fat_per_100g,
  carbs_per_100g, enabled, min_grams, max_grams, step_grams, serving_enabled, unit_label, unit_grams,
  kcal_per_serving, protein_per_serving, fat_per_serving, carbs_per_serving, serving_step,
  created_at, updated_at`;

const FOOD_WRITE_COLUMNS = `name, category, role, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
  enabled, min_grams, max_grams, step_grams, serving_enabled, unit_label, unit_grams,
  kcal_per_serving, protein_per_serving, fat_per_serving, carbs_per_serving, serving_step`;

/** Bind order must match FOOD_WRITE_COLUMNS. */
function foodWriteValues(input: FoodInput): unknown[] {
  return [
    input.name,
    input.category,
    input.role,
    input.kcalPer100g,
    input.proteinPer100g,
    input.fatPer100g,
    input.carbsPer100g,
    input.enabled ? 1 : 0,
    input.minGrams,
    input.maxGrams,
    input.stepGrams,
    input.servingEnabled ? 1 : 0,
    input.unitLabel,
    input.unitGrams,
    input.kcalPerServing,
    input.proteinPerServing,
    input.fatPerServing,
    input.carbsPerServing,
    input.servingStep,
  ];
}

export async function listFoods(db: Database): Promise<Food[]> {
  const { results } = await db
    .prepare(`SELECT ${FOOD_COLUMNS} FROM foods ORDER BY sort_order ASC, id ASC`)
    .all<FoodRow>();
  return results.map(mapFoodRow);
}

export async function getFood(db: Database, id: number): Promise<Food | null> {
  const row = await db.prepare(`SELECT ${FOOD_COLUMNS} FROM foods WHERE id = ?`).bind(id).first<FoodRow>();
  return row ? mapFoodRow(row) : null;
}

export async function getFoodsByIds(db: Database, ids: readonly number[]): Promise<Food[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT ${FOOD_COLUMNS} FROM foods WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<FoodRow>();
  return results.map(mapFoodRow);
}

export async function createFood(db: Database, input: FoodInput): Promise<Food> {
  const placeholders = FOOD_WRITE_COLUMNS.split(',').map(() => '?').join(', ');
  const row = await db
    .prepare(
      `INSERT INTO foods (${FOOD_WRITE_COLUMNS}, is_seed, sort_order)
       VALUES (${placeholders}, 0, 500)
       RETURNING ${FOOD_COLUMNS}`,
    )
    .bind(...foodWriteValues(input))
    .first<FoodRow>();

  if (!row) throw new Error('Failed to create food');
  return mapFoodRow(row);
}

export async function updateFood(db: Database, id: number, input: FoodInput): Promise<Food | null> {
  const assignments = FOOD_WRITE_COLUMNS.split(',')
    .map((column) => `${column.trim()} = ?`)
    .join(', ');
  const row = await db
    .prepare(
      `UPDATE foods SET ${assignments}, updated_at = datetime('now')
       WHERE id = ?
       RETURNING ${FOOD_COLUMNS}`,
    )
    .bind(...foodWriteValues(input), id)
    .first<FoodRow>();
  return row ? mapFoodRow(row) : null;
}

export async function deleteFood(db: Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM foods WHERE id = ?').bind(id).run();
  return result.success;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(db: Database): Promise<Settings> {
  const row = await db
    .prepare(
      `SELECT current_weight_kg, base_weight_kg, base_calories, default_calories,
              default_training_day, default_training_after_meal
       FROM settings WHERE id = 1`,
    )
    .first<SettingsRow>();

  const currentWeightKg = row?.current_weight_kg ?? 70;
  const baseWeightKg = row?.base_weight_kg ?? 70;
  const baseCalories = row?.base_calories ?? 1900;

  return {
    currentWeightKg,
    baseWeightKg,
    baseCalories,
    suggestedCalories: computeSuggestedCalories(currentWeightKg, baseCalories, baseWeightKg),
    defaultCalories: row?.default_calories ?? computeSuggestedCalories(currentWeightKg, baseCalories, baseWeightKg),
    defaultTrainingDay: (row?.default_training_day ?? 1) === 1,
    defaultTrainingAfterMeal: (row?.default_training_after_meal ?? 'lunch') as TrainingAfterMeal,
  };
}

export async function saveSettings(db: Database, input: SettingsInput): Promise<Settings> {
  await db
    .prepare(
      `INSERT INTO settings (id, current_weight_kg, base_weight_kg, base_calories, default_calories,
        default_training_day, default_training_after_meal, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         current_weight_kg = excluded.current_weight_kg,
         base_weight_kg = excluded.base_weight_kg,
         base_calories = excluded.base_calories,
         default_calories = excluded.default_calories,
         default_training_day = excluded.default_training_day,
         default_training_after_meal = excluded.default_training_after_meal,
         updated_at = datetime('now')`,
    )
    .bind(
      input.currentWeightKg,
      input.baseWeightKg,
      input.baseCalories,
      input.defaultCalories,
      input.defaultTrainingDay ? 1 : 0,
      input.defaultTrainingAfterMeal,
    )
    .run();

  return getSettings(db);
}

// ---------------------------------------------------------------------------
// Daily records
// ---------------------------------------------------------------------------

/**
 * Turn a `meal_items` row back into a plan item. Rows written before 按份
 * existed get 'grams' from the migration default, so old days keep loading.
 */
export function mapMealItemRow(row: MealItemRow): MealItem {
  return {
    foodId: row.food_id,
    grams: row.grams,
    quantityType: row.quantity_type === 'servings' ? 'servings' : 'grams',
    servings: row.servings,
    locked: row.locked === 1,
  };
}

async function loadPlan(db: Database, recordId: number): Promise<MealPlan> {
  const plan = emptyPlan();
  const { results } = await db
    .prepare(
      `SELECT module, food_id, grams, quantity_type, servings, locked, sort_order FROM meal_items
       WHERE record_id = ? ORDER BY module ASC, sort_order ASC, id ASC`,
    )
    .bind(recordId)
    .all<MealItemRow>();

  for (const row of results) {
    const key = row.module as ModuleKey;
    if (!MODULE_KEYS.includes(key)) continue;
    plan[key].push(mapMealItemRow(row));
  }
  return plan;
}

export async function getRecord(db: Database, date: string): Promise<DailyRecordWithPlan | null> {
  const row = await db
    .prepare(
      `SELECT id, date, weight_kg, training_day, training_after_meal, target_calories, calorie_target_manual,
              target_carbs, target_protein, target_fat, actual_calories, actual_carbs, actual_protein, actual_fat
       FROM daily_records WHERE date = ?`,
    )
    .bind(date)
    .first<DailyRecordRow>();

  if (!row) return null;
  return { ...mapRecord(row), plan: await loadPlan(db, row.id) };
}

export async function listRecords(
  db: Database,
  options: { from?: string; to?: string; limit?: number } = {},
): Promise<DailyRecord[]> {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  if (options.from) {
    clauses.push('date >= ?');
    bindings.push(options.from);
  }
  if (options.to) {
    clauses.push('date <= ?');
    bindings.push(options.to);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 366);
  bindings.push(limit);

  const { results } = await db
    .prepare(
      `SELECT id, date, weight_kg, training_day, training_after_meal, target_calories, calorie_target_manual,
              target_carbs, target_protein, target_fat, actual_calories, actual_carbs, actual_protein, actual_fat
       FROM daily_records ${where} ORDER BY date DESC LIMIT ?`,
    )
    .bind(...bindings)
    .all<DailyRecordRow>();

  return results.map(mapRecord);
}

export interface SaveRecordInput extends Omit<DailyRecord, 'date'> {
  date: string;
  plan: MealPlan;
}

export async function saveRecord(db: Database, input: SaveRecordInput): Promise<DailyRecordWithPlan> {
  await db
    .prepare(
      `INSERT INTO daily_records (date, weight_kg, training_day, training_after_meal, target_calories,
        calorie_target_manual, target_carbs, target_protein, target_fat,
        actual_calories, actual_carbs, actual_protein, actual_fat, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET
         weight_kg = excluded.weight_kg,
         training_day = excluded.training_day,
         training_after_meal = excluded.training_after_meal,
         target_calories = excluded.target_calories,
         calorie_target_manual = excluded.calorie_target_manual,
         target_carbs = excluded.target_carbs,
         target_protein = excluded.target_protein,
         target_fat = excluded.target_fat,
         actual_calories = excluded.actual_calories,
         actual_carbs = excluded.actual_carbs,
         actual_protein = excluded.actual_protein,
         actual_fat = excluded.actual_fat,
         updated_at = datetime('now')`,
    )
    .bind(
      input.date,
      input.weightKg,
      input.trainingDay ? 1 : 0,
      input.trainingAfterMeal,
      input.targetCalories,
      input.calorieTargetManual ? 1 : 0,
      input.targetCarbs,
      input.targetProtein,
      input.targetFat,
      input.actualCalories,
      input.actualCarbs,
      input.actualProtein,
      input.actualFat,
    )
    .run();

  const record = await db.prepare('SELECT id FROM daily_records WHERE date = ?').bind(input.date).first<{ id: number }>();
  if (!record) throw new Error('Failed to persist daily record');

  const statements: PreparedStatement[] = [db.prepare('DELETE FROM meal_items WHERE record_id = ?').bind(record.id)];
  for (const key of MODULE_KEYS) {
    input.plan[key].forEach((item, index) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO meal_items (record_id, module, food_id, grams, quantity_type, servings, locked, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(record_id, module, food_id) DO UPDATE SET
               grams = excluded.grams, quantity_type = excluded.quantity_type, servings = excluded.servings,
               locked = excluded.locked, sort_order = excluded.sort_order,
               updated_at = datetime('now')`,
          )
          .bind(
            record.id,
            key,
            item.foodId,
            item.grams,
            item.quantityType,
            item.servings,
            item.locked ? 1 : 0,
            index,
          ),
      );
    });
  }
  await db.batch(statements);

  const saved = await getRecord(db, input.date);
  if (!saved) throw new Error('Failed to reload saved record');
  return saved;
}

export async function saveCalorieTarget(
  db: Database,
  date: string,
  targetCalories: number,
  manual: boolean,
): Promise<DailyRecordWithPlan | null> {
  const result = await db
    .prepare(
      `UPDATE daily_records SET target_calories = ?, calorie_target_manual = ?, updated_at = datetime('now')
       WHERE date = ?`,
    )
    .bind(targetCalories, manual ? 1 : 0, date)
    .run();
  if (!result.success) return null;
  return getRecord(db, date);
}

export async function deleteRecord(db: Database, date: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM daily_records WHERE date = ?').bind(date).run();
  return result.success;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface CredentialRow {
  pin_hash: string;
  pin_salt: string;
  iterations: number;
  failed_attempts: number;
  locked_until: string | null;
}

export async function getCredentials(db: Database): Promise<CredentialRow | null> {
  return db
    .prepare('SELECT pin_hash, pin_salt, iterations, failed_attempts, locked_until FROM auth_credentials WHERE id = 1')
    .first<CredentialRow>();
}

export async function setCredentials(db: Database, pinHash: string, salt: string, iterations: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO auth_credentials (id, pin_hash, pin_salt, iterations, failed_attempts, locked_until, updated_at)
       VALUES (1, ?, ?, ?, 0, NULL, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         pin_hash = excluded.pin_hash,
         pin_salt = excluded.pin_salt,
         iterations = excluded.iterations,
         failed_attempts = 0,
         locked_until = NULL,
         updated_at = datetime('now')`,
    )
    .bind(pinHash, salt, iterations)
    .run();
}

export async function registerFailedAttempt(db: Database, lockUntil: string | null): Promise<void> {
  if (lockUntil) {
    await db
      .prepare(
        `UPDATE auth_credentials SET failed_attempts = 0, locked_until = ?, updated_at = datetime('now') WHERE id = 1`,
      )
      .bind(lockUntil)
      .run();
    return;
  }
  await db
    .prepare(`UPDATE auth_credentials SET failed_attempts = failed_attempts + 1, updated_at = datetime('now') WHERE id = 1`)
    .run();
}

export async function clearFailedAttempts(db: Database): Promise<void> {
  await db
    .prepare('UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL WHERE id = 1')
    .run();
}

export async function createSession(db: Database, tokenHash: string, expiresAt: string): Promise<void> {
  await db.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)').bind(tokenHash, expiresAt).run();
}

export async function findValidSession(db: Database, tokenHash: string): Promise<{ id: number } | null> {
  const row = await db
    .prepare(`SELECT id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')`)
    .bind(tokenHash)
    .first<{ id: number }>();
  return row ?? null;
}

export async function touchSession(db: Database, id: number): Promise<void> {
  await db.prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?`).bind(id).run();
}

export async function deleteSession(db: Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function purgeExpiredSessions(db: Database): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();
}
