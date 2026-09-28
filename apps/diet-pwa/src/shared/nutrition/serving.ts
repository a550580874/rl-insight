/**
 * Per-serving ("按份") support — the one place that knows how much nutrition an
 * amount of food actually carries.
 *
 * A food can be used in two ways and neither replaces the other:
 *
 *   重量 (grams)     nutrition = per100g x grams / 100          [legacy, unchanged]
 *   份   (servings)  nutrition = perServing x servings
 *
 * Source of truth
 * ---------------
 * The database row is the only truth. `resolveServingNutrition()` is called once
 * on every write (POST/PUT /api/foods) and stores the per-serving macros on the
 * food; readers never re-derive them. The rule applied at write time is:
 *
 *   1. an explicitly submitted per-serving value always wins;
 *   2. otherwise, when the serving weight is known (unit_grams > 0), the value is
 *      derived from the per-100g numbers with the same linear formula the grams
 *      mode uses;
 *   3. otherwise the food simply has no per-serving value for that macro.
 *
 * A food with serving enabled must end up with a serving name and at least one
 * usable per-serving value, which the API layer enforces. Because the derived
 * numbers are *stored*, they can be edited afterwards (a box of milk that says
 * 250 kcal while per 100 g would suggest 240 stays at 250) and a food can never
 * report two contradicting values at the same time.
 *
 * UI, Worker and optimizer all call `calculateFoodNutrition()` instead of
 * writing the formula themselves.
 */

import type { MacroTotals, QuantityType } from '../types';
import { round1 } from './targets';

/** The slice of a food the nutrition maths needs. */
export interface NutritionSource {
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  /** true when the food is managed 按份 as well as per 100 g. */
  servingEnabled: boolean;
  /** Weight of one serving (the legacy display unit weight), when known. */
  unitGrams: number | null;
  kcalPerServing: number | null;
  proteinPerServing: number | null;
  fatPerServing: number | null;
  carbsPerServing: number | null;
}

/** Minimal nutrition vector, structurally compatible with `Food`. */
export interface ServingNutritionInput {
  servingEnabled: boolean;
  unitGrams: number | null;
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  kcalPerServing: number | null;
  proteinPerServing: number | null;
  fatPerServing: number | null;
  carbsPerServing: number | null;
}

/** How much of a food the user asked for. */
export interface FoodQuantity {
  quantityType: QuantityType;
  /** Weight in grams; for a 按份 item this is the rounded serving weight. */
  grams: number;
  /** Serving count; 0 in grams mode. */
  servings: number;
}

/** The four per-serving values, or null when the food has none. */
export interface ResolvedServingNutrition {
  kcalPerServing: number | null;
  proteinPerServing: number | null;
  fatPerServing: number | null;
  carbsPerServing: number | null;
}

const MACRO_KEYS = ['kcal', 'protein', 'fat', 'carbs'] as const;

/** Weight of one serving, or null when the food does not declare one. */
export function servingGrams(food: NutritionSource): number | null {
  if (!food.servingEnabled) return null;
  return food.unitGrams !== null && food.unitGrams > 0 ? food.unitGrams : null;
}

/** true when the food really can be used 按份 (enabled and with per-serving data). */
export function hasServingNutrition(food: NutritionSource): boolean {
  if (!food.servingEnabled) return false;
  return (
    food.kcalPerServing !== null ||
    food.proteinPerServing !== null ||
    food.fatPerServing !== null ||
    food.carbsPerServing !== null
  );
}

/** true when `quantity` describes a 按份 amount for this food. */
export function isServingQuantity(food: NutritionSource, quantity: Partial<FoodQuantity>): boolean {
  return quantity.quantityType === 'servings' && hasServingNutrition(food);
}

/** The weight a 按份 amount corresponds to; 0 when the serving weight is unknown. */
export function effectiveGrams(food: NutritionSource, quantity: Partial<FoodQuantity>): number {
  const servings = Math.max(quantity.servings ?? 0, 0);
  const perServing = servingGrams(food);
  if (perServing === null) return 0;
  return round1(servings * perServing);
}

/** Normalise a partial quantity (an API payload, an optimizer item) into a full one. */
export function normalizeQuantity(quantity: Partial<FoodQuantity> | null | undefined): FoodQuantity {
  return {
    quantityType: quantity?.quantityType === 'servings' ? 'servings' : 'grams',
    grams: Math.max(quantity?.grams ?? 0, 0),
    servings: Math.max(quantity?.servings ?? 0, 0),
  };
}

/**
 * The serving count that matches `grams`, snapped to the food's serving step.
 *
 * Used when the user flips an item from 重量 to 份: 100 g of a 50 g serving is
 * 2 个, so the amount survives the switch instead of silently halving. Returns 0
 * when the food has no serving weight to convert with.
 */
export function servingsForGrams(food: NutritionSource, grams: number, step = 1): number {
  const perServing = servingGrams(food);
  const safeStep = step > 0 ? step : 1;
  if (perServing === null || grams <= 0) return 0;
  const snapped = Math.round(grams / perServing / safeStep) * safeStep;
  return Math.max(round1(snapped), safeStep);
}

/**
 * Nutrition of `quantity` of `food` — the single formula used by the UI, the
 * Worker and the optimizer.
 *
 * A 按份 request on a food that has no per-serving data falls back to the grams
 * formula rather than silently reporting zero.
 */
export function calculateFoodNutrition(food: NutritionSource, quantity: Partial<FoodQuantity>): MacroTotals {
  const normalised = normalizeQuantity(quantity);

  if (isServingQuantity(food, normalised)) {
    const factor = normalised.servings;
    return {
      calories: round1((food.kcalPerServing ?? 0) * factor),
      protein: round1((food.proteinPerServing ?? 0) * factor),
      fat: round1((food.fatPerServing ?? 0) * factor),
      carbs: round1((food.carbsPerServing ?? 0) * factor),
    };
  }

  // A 按份 request on a food that has no serving data (or no serving weight)
  // falls back to the gram weight the caller sent rather than reporting zero.
  const weight =
    normalised.quantityType === 'servings' && servingGrams(food) !== null
      ? effectiveGrams(food, normalised)
      : normalised.grams;
  const factor = weight / 100;
  return {
    calories: round1(food.kcalPer100g * factor),
    protein: round1(food.proteinPer100g * factor),
    fat: round1(food.fatPer100g * factor),
    carbs: round1(food.carbsPer100g * factor),
  };
}

/**
 * Resolve the per-serving macros to store for a food.
 *
 * Returns `null` for every value when serving management is off, so disabling
 * 按份 never leaves a stale per-serving number behind.
 */
export function resolveServingNutrition(input: ServingNutritionInput): ResolvedServingNutrition {
  if (!input.servingEnabled) {
    return { kcalPerServing: null, proteinPerServing: null, fatPerServing: null, carbsPerServing: null };
  }

  const per100g: Record<(typeof MACRO_KEYS)[number], number> = {
    kcal: input.kcalPer100g,
    protein: input.proteinPer100g,
    fat: input.fatPer100g,
    carbs: input.carbsPer100g,
  };
  const explicit: Record<(typeof MACRO_KEYS)[number], number | null> = {
    kcal: input.kcalPerServing,
    protein: input.proteinPerServing,
    fat: input.fatPerServing,
    carbs: input.carbsPerServing,
  };

  const weight = input.unitGrams !== null && input.unitGrams > 0 ? input.unitGrams : null;
  const resolved = {} as Record<(typeof MACRO_KEYS)[number], number | null>;

  for (const key of MACRO_KEYS) {
    const given = explicit[key];
    if (given !== null && given !== undefined) {
      resolved[key] = round1(given);
      continue;
    }
    resolved[key] = weight === null ? null : round1((per100g[key] * weight) / 100);
  }

  return {
    kcalPerServing: resolved.kcal,
    proteinPerServing: resolved.protein,
    fatPerServing: resolved.fat,
    carbsPerServing: resolved.carbs,
  };
}
