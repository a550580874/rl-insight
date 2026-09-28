/**
 * Target calculation: body weight -> daily macros -> per module macro targets.
 *
 * Pure functions only, so they are trivially unit testable and can run on both
 * the client (instant feedback) and the Worker.
 */

import type { MacroTargets, MealKey } from '../types';
import { NUTRITION_CONFIG, macroCalories, type NutritionConfig } from './config';

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Suggested calorie target for a body weight: baseCalories x weight / baseWeight.
 * 70 kg -> 1900 kcal, 60 kg -> 1629 kcal, 80 kg -> 2171 kcal.
 */
export function computeSuggestedCalories(weightKg: number, baseCalories: number, baseWeightKg: number): number {
  const base = Number.isFinite(baseWeightKg) && baseWeightKg > 0 ? baseWeightKg : NUTRITION_CONFIG.referenceWeightKg;
  const weight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : base;
  return Math.round((baseCalories * weight) / base);
}

/** Suggested calories using the shipped defaults (1900 kcal at 70 kg). */
export function computeDefaultCalories(weightKg: number, config: NutritionConfig = NUTRITION_CONFIG): number {
  return computeSuggestedCalories(weightKg, config.baseCalories, config.referenceWeightKg);
}

/**
 * The part of the user profile that drives calorie targets. `Settings` satisfies
 * this shape, so the same helper can be used by the client, the Worker and the
 * tests without dragging the whole settings object around.
 */
export interface CalorieProfile {
  baseCalories: number;
  baseWeightKg: number;
  /** User editable "当前默认热量目标". */
  defaultCalories: number;
}

/**
 * Suggested calories for the user's own profile: baseCalories x weight / baseWeight.
 *
 * This is what the settings page describes and what the home page must show, so
 * editing 基准体重 / 基准热量 changes the suggestion everywhere instead of only
 * in the settings page.
 */
export function suggestedCaloriesFor(weightKg: number, profile: CalorieProfile): number {
  return computeSuggestedCalories(weightKg, profile.baseCalories, profile.baseWeightKg);
}

/**
 * Calories a brand new day starts with: the user's stored 默认热量目标 when it is
 * set, otherwise the weight based suggestion for this profile.
 *
 * Body weight changes refresh the *suggestion*; they must not silently keep an
 * already persisted day target (contract §3), so this is only used when a day
 * has no record yet.
 */
export function startingCaloriesFor(weightKg: number, profile: CalorieProfile): number {
  const fallback = suggestedCaloriesFor(weightKg, profile);
  return Number.isFinite(profile.defaultCalories) && profile.defaultCalories > 0 ? profile.defaultCalories : fallback;
}

/** Daily macro targets derived from body weight and training status. */
export function computeDailyTargets(
  weightKg: number,
  trainingDay: boolean,
  config: NutritionConfig = NUTRITION_CONFIG,
): MacroTargets {
  const weight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : config.defaults.weightKg;

  if (trainingDay) {
    const perKg = config.macroPerKg.training;
    return {
      carbs: round1(perKg.carbs * weight),
      protein: round1(perKg.protein * weight),
      fat: round1(perKg.fat * weight),
    };
  }

  const rest = config.macroPerKg.rest;
  return {
    carbs: round1((rest.referenceCarbsGrams * weight) / config.referenceWeightKg),
    protein: round1(rest.protein * weight),
    fat: round1(rest.fat * weight),
  };
}

/** Split a scalar total across the three meals while preserving the total. */
export function splitByShares(total: number, shares: Record<MealKey, number>): Record<MealKey, number> {
  const safeTotal = Math.max(total, 0);
  const breakfast = round1(safeTotal * shares.breakfast);
  const lunch = round1(safeTotal * shares.lunch);
  const dinner = round1(safeTotal - breakfast - lunch);
  return { breakfast, lunch, dinner };
}

export interface MealTargetBreakdown {
  breakfast: MacroTargets;
  lunch: MacroTargets;
  dinner: MacroTargets;
  postWorkout: MacroTargets;
}

/**
 * Spread the daily macro budget over breakfast / lunch / dinner and the
 * post-workout module.
 *
 * Carbohydrates are deliberately not averaged: dinner keeps a small fixed
 * amount (~20 g) and the rest goes to breakfast and lunch, in the ratio taken
 * from `carbAllocation.referenceSplit`. The post-workout module (banana +
 * protein powder) is subtracted from the daily budget first so that it really
 * counts towards the daily totals instead of being free calories.
 */
export function computeMealTargets(
  dailyTarget: MacroTargets,
  trainingDay: boolean,
  postWorkout: MacroTargets,
  config: NutritionConfig = NUTRITION_CONFIG,
): MealTargetBreakdown {
  const post: MacroTargets = trainingDay
    ? { carbs: Math.max(postWorkout.carbs, 0), protein: Math.max(postWorkout.protein, 0), fat: Math.max(postWorkout.fat, 0) }
    : { carbs: 0, protein: 0, fat: 0 };

  const referenceSplit = trainingDay ? config.carbAllocation.referenceSplit.training : config.carbAllocation.referenceSplit.rest;
  const referenceSum = referenceSplit.breakfast + referenceSplit.lunch;
  const breakfastShare = referenceSum > 0 ? referenceSplit.breakfast / referenceSum : 0.5;

  const dinnerCarbs = Math.min(config.carbAllocation.dinnerCarbsGrams, dailyTarget.carbs);
  const carbRemaining = Math.max(dailyTarget.carbs - dinnerCarbs - post.carbs, 0);
  const breakfastCarbs = round1(carbRemaining * breakfastShare);
  const lunchCarbs = round1(carbRemaining - breakfastCarbs);

  const proteinRemaining = Math.max(dailyTarget.protein - post.protein, 0);
  const fatRemaining = Math.max(dailyTarget.fat - post.fat, 0);

  const protein = splitByShares(proteinRemaining, config.macroAllocation.protein);
  const fat = splitByShares(fatRemaining, config.macroAllocation.fat);

  return {
    breakfast: { carbs: breakfastCarbs, protein: protein.breakfast, fat: fat.breakfast },
    lunch: { carbs: lunchCarbs, protein: protein.lunch, fat: fat.lunch },
    dinner: { carbs: round1(dinnerCarbs), protein: protein.dinner, fat: fat.dinner },
    postWorkout: post,
  };
}

export interface DayTargets {
  daily: MacroTargets;
  meals: MealTargetBreakdown;
  /** Energy implied by the macro targets. */
  macroCalories: number;
  targetCalories: number;
  /** targetCalories - macroCalories; surfaced to the user when large. */
  calorieDelta: number;
  calorieMismatch: boolean;
}

export function computeDayTargets(params: {
  weightKg: number;
  trainingDay: boolean;
  targetCalories: number;
  postWorkout: MacroTargets;
  config?: NutritionConfig;
}): DayTargets {
  const config = params.config ?? NUTRITION_CONFIG;
  const daily = computeDailyTargets(params.weightKg, params.trainingDay, config);
  const meals = computeMealTargets(daily, params.trainingDay, params.postWorkout, config);
  const macroKcal = macroCalories(daily, config);
  const calorieDelta = round1(params.targetCalories - macroKcal);
  const ratio = macroKcal > 0 ? Math.abs(calorieDelta) / macroKcal : 0;
  return {
    daily,
    meals,
    macroCalories: round1(macroKcal),
    targetCalories: round1(params.targetCalories),
    calorieDelta,
    calorieMismatch: ratio > config.calorieMismatchWarningRatio,
  };
}
