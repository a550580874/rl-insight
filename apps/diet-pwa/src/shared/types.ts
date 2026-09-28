/**
 * Shared domain types used by both the React client and the Cloudflare Worker.
 * This module must stay free of DOM- and Worker-specific APIs so it can be
 * imported from the browser bundle, the Worker and the unit tests.
 */

/** Food role drives how the optimizer is allowed to use a food. */
export type FoodRole = 'carb' | 'protein' | 'fat' | 'vegetable' | 'mixed';

export const FOOD_ROLES: readonly FoodRole[] = ['carb', 'protein', 'fat', 'vegetable', 'mixed'];

export const FOOD_CATEGORIES = [
  '主食',
  '肉类',
  '蛋类',
  '奶类',
  '水果',
  '蔬菜',
  '坚果',
  '油脂',
  '补剂',
  '其他',
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export interface Food {
  id: number;
  name: string;
  category: string;
  role: FoodRole;
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  enabled: boolean;
  minGrams: number;
  maxGrams: number;
  stepGrams: number;
  /** Optional display unit, e.g. 个 for eggs. Underlying maths always uses grams. */
  unitLabel: string | null;
  /** Grams per display unit, e.g. 50 for one egg. */
  unitGrams: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields a user may create/update through the API. */
export interface FoodInput {
  name: string;
  category: string;
  role: FoodRole;
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  enabled: boolean;
  minGrams: number;
  maxGrams: number;
  stepGrams: number;
  unitLabel: string | null;
  unitGrams: number | null;
}

export type MealKey = 'breakfast' | 'lunch' | 'dinner';

/** The post-workout supplement is a separate module, not a fourth meal. */
export type ModuleKey = MealKey | 'postWorkout';

export const MEAL_KEYS: readonly MealKey[] = ['breakfast', 'lunch', 'dinner'];
export const MODULE_KEYS: readonly ModuleKey[] = [...MEAL_KEYS, 'postWorkout'];

export type TrainingAfterMeal = MealKey;

export interface MacroTargets {
  carbs: number;
  protein: number;
  fat: number;
}

export interface MacroTotals extends MacroTargets {
  calories: number;
}

export interface MealItem {
  foodId: number;
  grams: number;
  locked: boolean;
}

export type MealPlan = Record<ModuleKey, MealItem[]>;

export interface DailyRecord {
  date: string;
  weightKg: number;
  trainingDay: boolean;
  trainingAfterMeal: TrainingAfterMeal;
  targetCalories: number;
  /** true when the user overrode the suggested calories for this date. */
  calorieTargetManual: boolean;
  targetCarbs: number;
  targetProtein: number;
  targetFat: number;
  actualCalories: number;
  actualCarbs: number;
  actualProtein: number;
  actualFat: number;
}

export interface DailyRecordWithPlan extends DailyRecord {
  plan: MealPlan;
}

export interface Settings {
  currentWeightKg: number;
  baseWeightKg: number;
  baseCalories: number;
  /** Suggested calories for the current weight (1900 x weight / 70, rounded). */
  suggestedCalories: number;
  /** User editable default calorie target used for newly created days. */
  defaultCalories: number;
  defaultTrainingDay: boolean;
  defaultTrainingAfterMeal: TrainingAfterMeal;
}

export interface SettingsInput {
  currentWeightKg: number;
  baseWeightKg: number;
  baseCalories: number;
  defaultCalories: number;
  defaultTrainingDay: boolean;
  defaultTrainingAfterMeal: TrainingAfterMeal;
}

/** Computed per-module result returned by the meal plan service. */
export interface ModuleResult {
  key: ModuleKey;
  target: MacroTargets;
  actual: MacroTotals;
  error: MacroTargets;
  items: ComputedMealItem[];
}

export interface ComputedMealItem {
  foodId: number;
  name: string;
  role: FoodRole;
  grams: number;
  locked: boolean;
  unitLabel: string | null;
  unitGrams: number | null;
  /** units = grams / unitGrams when a display unit exists. */
  units: number | null;
  macros: MacroTotals;
}

export interface DayPlanResult {
  date: string;
  weightKg: number;
  trainingDay: boolean;
  trainingAfterMeal: TrainingAfterMeal;
  dailyTarget: MacroTargets;
  dailyTargetCalories: number;
  macroTargetCalories: number;
  calorieDelta: number;
  targetCalories: number;
  modules: Record<ModuleKey, ModuleResult>;
  totals: MacroTotals;
  remaining: MacroTotals;
}

export interface AuthStatus {
  pinConfigured: boolean;
  authenticated: boolean;
}

export interface ApiError {
  error: string;
  message: string;
}
