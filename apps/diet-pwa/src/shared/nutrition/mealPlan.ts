/**
 * Day plan service: glues targets, the meal split and the optimizer together.
 *
 * This is the single entry point the UI and the Worker use to turn
 * "these foods, this body weight, training or not" into concrete grams.
 */

import type {
  ComputedMealItem,
  DayPlanResult,
  Food,
  MacroTargets,
  MacroTotals,
  MealItem,
  MealKey,
  MealPlan,
  ModuleKey,
  ModuleResult,
} from '../types';
import { MODULE_KEYS } from '../types';
import { KCAL_PER_GRAM, NUTRITION_CONFIG, macroCalories, type NutritionConfig } from './config';
import { optimizeMeal, type OptimizerFood } from './optimizer';
import { calculateFoodNutrition, effectiveGrams, hasServingNutrition, normalizeQuantity } from './serving';
import { computeDayTargets, round1 } from './targets';

export function toOptimizerFood(food: Food): OptimizerFood {
  return {
    id: food.id,
    name: food.name,
    role: food.role,
    kcalPer100g: food.kcalPer100g,
    proteinPer100g: food.proteinPer100g,
    fatPer100g: food.fatPer100g,
    carbsPer100g: food.carbsPer100g,
    minGrams: food.minGrams,
    maxGrams: food.maxGrams,
    stepGrams: food.stepGrams,
    servingEnabled: food.servingEnabled,
    unitGrams: food.unitGrams,
    kcalPerServing: food.kcalPerServing,
    proteinPerServing: food.proteinPerServing,
    fatPerServing: food.fatPerServing,
    carbsPerServing: food.carbsPerServing,
  };
}

export function emptyPlan(): MealPlan {
  return { breakfast: [], lunch: [], dinner: [], postWorkout: [] };
}

/**
 * Normalise whatever came from the API into a full four-module plan.
 *
 * Every item gets an explicit quantity mode; a payload that only carries grams
 * (any client written before 按份 existed) is treated as grams.
 */
export function normalizePlan(plan: Partial<MealPlan> | null | undefined): MealPlan {
  const result = emptyPlan();
  if (!plan) return result;
  for (const key of MODULE_KEYS) {
    const items = plan[key];
    result[key] = Array.isArray(items)
      ? items.map((item) => {
          const quantity = normalizeQuantity(item);
          return { ...item, ...quantity };
        })
      : [];
  }
  return result;
}

function macrosOfItems(items: readonly MealItem[], foodById: Map<number, Food>): MacroTotals {
  let carbs = 0;
  let protein = 0;
  let fat = 0;
  let calories = 0;
  for (const item of items) {
    const food = foodById.get(item.foodId);
    if (!food) continue;
    // One formula for both modes; the UI and the Worker share it.
    const macros = calculateFoodNutrition(food, item);
    carbs += macros.carbs;
    protein += macros.protein;
    fat += macros.fat;
    calories += macros.calories;
  }
  return {
    carbs: round1(carbs),
    protein: round1(protein),
    fat: round1(fat),
    calories: round1(calories),
  };
}

function zeroTotals(): MacroTotals {
  return { carbs: 0, protein: 0, fat: 0, calories: 0 };
}

function addTotals(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    carbs: round1(a.carbs + b.carbs),
    protein: round1(a.protein + b.protein),
    fat: round1(a.fat + b.fat),
    calories: round1(a.calories + b.calories),
  };
}

function computedItems(
  items: readonly MealItem[],
  optimizedItems: Map<number, MealItem>,
  foodById: Map<number, Food>,
): ComputedMealItem[] {
  const result: ComputedMealItem[] = [];
  for (const item of items) {
    const food = foodById.get(item.foodId);
    if (!food) continue;
    const optimized = optimizedItems.get(item.foodId);
    const quantity = normalizeQuantity(optimized ?? item);
    // 按份 keeps the user's serving count; grams mode keeps the optimized weight.
    const grams =
      quantity.quantityType === 'servings' ? effectiveGrams(food, quantity) : round1(optimized?.grams ?? item.grams);
    const servingEnabled = hasServingNutrition(food);
    const units =
      quantity.quantityType === 'servings'
        ? quantity.servings
        : food.unitGrams && food.unitGrams > 0
          ? round1(grams / food.unitGrams)
          : null;
    result.push({
      foodId: food.id,
      name: food.name,
      role: food.role,
      grams,
      locked: optimized?.locked ?? item.locked,
      quantityType: quantity.quantityType,
      servings: quantity.servings,
      servingEnabled,
      servingStep: food.servingStep,
      unitLabel: food.unitLabel,
      unitGrams: food.unitGrams,
      units,
      macros: calculateFoodNutrition(food, quantity),
    });
  }
  return result;
}

export interface ComputeDayPlanParams {
  date: string;
  weightKg: number;
  trainingDay: boolean;
  trainingAfterMeal: MealKey;
  targetCalories: number;
  plan: MealPlan;
  foods: readonly Food[];
  config?: NutritionConfig;
  /**
   * Optional per-meal target overrides, used by "优化训练前碳水" which moves
   * carbohydrate grams between meals without changing the daily total.
   */
  mealTargetOverrides?: Partial<Record<MealKey, Partial<MacroTargets>>>;
}

/**
 * Compute the full day: targets, optimized grams per module and the daily
 * totals.
 *
 * The post-workout module is intentionally *not* macro-fitted: it is a fixed
 * supplement (banana + protein powder by default) whose weights the user edits
 * directly. Its macros are subtracted from the daily budget before the three
 * meals are split, so it genuinely counts towards the daily totals.
 */
export function computeDayPlan(params: ComputeDayPlanParams): DayPlanResult {
  const config = params.config ?? NUTRITION_CONFIG;
  const foodById = new Map(params.foods.map((food) => [food.id, food]));
  const plan = normalizePlan(params.plan);

  const postWorkoutItems: MealItem[] = params.trainingDay ? plan.postWorkout : [];
  const postWorkoutMacros = macrosOfItems(postWorkoutItems, foodById);

  const dayTargets = computeDayTargets({
    weightKg: params.weightKg,
    trainingDay: params.trainingDay,
    targetCalories: params.targetCalories,
    postWorkout: postWorkoutMacros,
    config,
  });

  const optimizerFoods = params.foods.map(toOptimizerFood);
  const modules = {} as Record<ModuleKey, ModuleResult>;
  let totals = zeroTotals();

  for (const key of MODULE_KEYS) {
    const items = plan[key];

    if (key === 'postWorkout') {
      if (!params.trainingDay) {
        modules.postWorkout = { key, target: zeroTotals(), actual: zeroTotals(), error: zeroTotals(), items: [] };
        continue;
      }
      const fixed = new Map(items.map((item) => [item.foodId, item]));
      const result: ModuleResult = {
        key,
        target: postWorkoutMacros,
        actual: postWorkoutMacros,
        error: zeroTotals(),
        items: computedItems(items, fixed, foodById),
      };
      modules.postWorkout = result;
      totals = addTotals(totals, result.actual);
      continue;
    }

    const override = params.mealTargetOverrides?.[key];
    const target: MacroTargets = override ? { ...dayTargets.meals[key], ...override } : dayTargets.meals[key];
    const optimized = optimizeMeal({ foods: optimizerFoods, items, target, config });
    const optimizedItems = new Map(optimized.items.map((item) => [item.foodId, item]));
    const result: ModuleResult = {
      key,
      target,
      actual: optimized.macros,
      error: optimized.error,
      items: computedItems(items, optimizedItems, foodById),
    };
    modules[key] = result;
    totals = addTotals(totals, result.actual);
  }

  const remaining: MacroTotals = {
    carbs: round1(dayTargets.daily.carbs - totals.carbs),
    protein: round1(dayTargets.daily.protein - totals.protein),
    fat: round1(dayTargets.daily.fat - totals.fat),
    calories: round1(params.targetCalories - totals.calories),
  };

  return {
    date: params.date,
    weightKg: params.weightKg,
    trainingDay: params.trainingDay,
    trainingAfterMeal: params.trainingAfterMeal,
    dailyTarget: dayTargets.daily,
    dailyTargetCalories: params.targetCalories,
    macroTargetCalories: dayTargets.macroCalories,
    calorieDelta: dayTargets.calorieDelta,
    targetCalories: params.targetCalories,
    modules,
    totals,
    remaining,
  };
}

/** Macro totals of a plan without optimizing it (used for history summaries). */
export function planMacros(plan: MealPlan, foods: readonly Food[], trainingDay: boolean): MacroTotals {
  const foodById = new Map(foods.map((food) => [food.id, food]));
  let totals = zeroTotals();
  for (const key of MODULE_KEYS) {
    if (key === 'postWorkout' && !trainingDay) continue;
    totals = addTotals(totals, macrosOfItems(plan[key], foodById));
  }
  return totals;
}

/**
 * "Optimise pre-workout carbs": move carbohydrate grams from one meal to
 * another without changing the daily total.
 */
export function optimizePreWorkoutCarbs(
  modules: Record<MealKey, { target: MacroTargets }>,
  trainingAfterMeal: MealKey,
  moveGrams: number,
): Record<MealKey, MacroTargets> {
  const base: Record<MealKey, MacroTargets> = {
    breakfast: { ...modules.breakfast.target },
    lunch: { ...modules.lunch.target },
    dinner: { ...modules.dinner.target },
  };

  if (trainingAfterMeal === 'dinner') {
    // Dinner stays low carb; shift the remainder up to dinner from lunch.
    const moved = Math.min(Math.max(moveGrams, 0), Math.max(base.lunch.carbs, 0));
    base.lunch = { ...base.lunch, carbs: round1(base.lunch.carbs - moved) };
    base.dinner = { ...base.dinner, carbs: round1(base.dinner.carbs + moved) };
    return base;
  }

  if (trainingAfterMeal === 'lunch') {
    const moved = Math.min(Math.max(moveGrams, 0), Math.max(base.breakfast.carbs, 0));
    base.breakfast = { ...base.breakfast, carbs: round1(base.breakfast.carbs - moved) };
    base.lunch = { ...base.lunch, carbs: round1(base.lunch.carbs + moved) };
    return base;
  }

  return base;
}

/** Energy a macro split represents; exposed for the UI. */
export function energyOf(macros: MacroTargets): number {
  return round1(
    macros.carbs * KCAL_PER_GRAM.carbs + macros.protein * KCAL_PER_GRAM.protein + macros.fat * KCAL_PER_GRAM.fat,
  );
}

export { macroCalories };
