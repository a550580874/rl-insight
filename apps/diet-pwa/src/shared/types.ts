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
  /**
   * true when the food can also be used 按份 (2 个鸡蛋 instead of 100 g). The
   * per-100g numbers stay valid either way; this only adds a second way to
   * express the amount.
   */
  servingEnabled: boolean;
  /**
   * Serving unit name, e.g. 个 / 根 / 片 / 勺 / 盒. Free text — nothing in the
   * code special cases a particular unit. With `servingEnabled: false` it is the
   * legacy display unit of the per-100g food.
   */
  unitLabel: string | null;
  /** Grams per serving, e.g. 50 for one egg. Optional: packaging may only know 1 盒. */
  unitGrams: number | null;
  /** Per-serving macros. Null when the food is not managed 按份. */
  kcalPerServing: number | null;
  proteinPerServing: number | null;
  fatPerServing: number | null;
  carbsPerServing: number | null;
  /** Serving increment used by the ± buttons, e.g. 1 for 个, 0.5 for 勺. */
  servingStep: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields a user may create/update through the API.
 *
 * The per-serving macros may be omitted: the Worker then derives them from the
 * per-100g numbers and `unitGrams` (see `resolveServingNutrition`), so the
 * stored food always carries one authoritative per-serving value.
 */
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
  servingEnabled: boolean;
  unitLabel: string | null;
  unitGrams: number | null;
  kcalPerServing: number | null;
  proteinPerServing: number | null;
  fatPerServing: number | null;
  carbsPerServing: number | null;
  servingStep: number;
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

/**
 * How a meal item expresses its amount. Stored explicitly so a saved plan is
 * never mis-read: 2 个鸡蛋 must not come back as 100 g.
 */
export type QuantityType = 'grams' | 'servings';

export const QUANTITY_TYPES: readonly QuantityType[] = ['grams', 'servings'];

export interface MealItem {
  foodId: number;
  /**
   * Effective weight in grams. For a `servings` item this is
   * servings x serving weight (0 when the serving weight is unknown), so the
   * optimizer and the history totals keep working unchanged.
   */
  grams: number;
  /** 'grams' (default / legacy) or 'servings'. */
  quantityType: QuantityType;
  /** The serving count the user typed; 0 in grams mode. */
  servings: number;
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
  quantityType: QuantityType;
  /** Serving count when the item is managed 按份, otherwise 0. */
  servings: number;
  /** true when the user may switch this item between 重量 and 份. */
  servingEnabled: boolean;
  servingStep: number;
  unitLabel: string | null;
  unitGrams: number | null;
  /** units = servings 按份, or grams / unitGrams for a legacy display unit. */
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
