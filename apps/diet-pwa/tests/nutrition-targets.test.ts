/**
 * Contract §32 cases 1-4: daily macro targets per body weight / training status
 * and the carbohydrate split across meals.
 */

import { describe, expect, it } from 'vitest';
import { NUTRITION_CONFIG } from '../src/shared/nutrition/config';
import {
  computeDailyTargets,
  computeDayTargets,
  computeDefaultCalories,
  computeMealTargets,
} from '../src/shared/nutrition/targets';

const noPostWorkout = { carbs: 0, protein: 0, fat: 0 };

describe('daily macro targets', () => {
  it('Case 1: 70 kg training day -> 210C / 112P / 42F', () => {
    const daily = computeDailyTargets(70, true);
    expect(daily).toEqual({ carbs: 210, protein: 112, fat: 42 });
  });

  it('Case 2: 60 kg training day -> 180C / 96P / 36F', () => {
    const daily = computeDailyTargets(60, true);
    expect(daily).toEqual({ carbs: 180, protein: 96, fat: 36 });
  });

  it('Case 3: 70 kg rest day -> 160C / 112P / 45-50F', () => {
    const daily = computeDailyTargets(70, false);
    expect(daily.carbs).toBe(160);
    expect(daily.protein).toBe(112);
    expect(daily.fat).toBeGreaterThanOrEqual(45);
    expect(daily.fat).toBeLessThanOrEqual(50);
  });

  it('scales the rest-day carb reference instead of hard coding 160 g', () => {
    // restCarbs = 160 x weight / 70, so 90 kg must not still be 160 g.
    expect(computeDailyTargets(90, false).carbs).toBeCloseTo((160 * 90) / 70, 1);
    expect(computeDailyTargets(50, false).carbs).toBeCloseTo((160 * 50) / 70, 1);
  });

  it('suggests calories from body weight (1900 kcal at 70 kg)', () => {
    expect(computeDefaultCalories(70)).toBe(1900);
    expect(computeDefaultCalories(60)).toBe(1629);
    expect(computeDefaultCalories(80)).toBe(2171);
  });
});

describe('carbohydrate meal split', () => {
  it('Case 4: dinner keeps about 20 g of carbohydrate on a training day', () => {
    const daily = computeDailyTargets(70, true);
    const meals = computeMealTargets(daily, true, { carbs: 30, protein: 25, fat: 2 });
    expect(meals.dinner.carbs).toBe(NUTRITION_CONFIG.carbAllocation.dinnerCarbsGrams);
    expect(meals.breakfast.carbs).toBe(75);
    expect(meals.lunch.carbs).toBe(85);
  });

  it('Case 4: dinner keeps about 20 g of carbohydrate on a rest day too', () => {
    const daily = computeDailyTargets(70, false);
    const meals = computeMealTargets(daily, false, noPostWorkout);
    expect(meals.dinner.carbs).toBe(20);
    expect(meals.breakfast.carbs).toBe(65);
    expect(meals.lunch.carbs).toBe(75);
  });

  it('concentrates carbohydrate in breakfast and lunch, never evenly', () => {
    const meals = computeMealTargets(computeDailyTargets(80, true), true, noPostWorkout);
    expect(meals.breakfast.carbs).toBeGreaterThan(meals.dinner.carbs * 2);
    expect(meals.lunch.carbs).toBeGreaterThan(meals.dinner.carbs * 2);
    // dinner stays at the fixed reference regardless of body weight
    expect(meals.dinner.carbs).toBe(20);
  });

  it('keeps the meal targets summing to the daily carbohydrate budget', () => {
    for (const weight of [55, 70, 85, 100]) {
      for (const trainingDay of [true, false]) {
        const daily = computeDailyTargets(weight, trainingDay);
        const post = trainingDay ? { carbs: 30, protein: 25, fat: 2 } : noPostWorkout;
        const meals = computeMealTargets(daily, trainingDay, post);
        const sum =
          meals.breakfast.carbs + meals.lunch.carbs + meals.dinner.carbs + (trainingDay ? meals.postWorkout.carbs : 0);
        expect(sum).toBeCloseTo(daily.carbs, 1);
      }
    }
  });

  it('splits protein and fat across the three meals without losing any', () => {
    const daily = computeDailyTargets(70, true);
    const post = { carbs: 30, protein: 25, fat: 2 };
    const meals = computeMealTargets(daily, true, post);
    const protein = meals.breakfast.protein + meals.lunch.protein + meals.dinner.protein + meals.postWorkout.protein;
    const fat = meals.breakfast.fat + meals.lunch.fat + meals.dinner.fat + meals.postWorkout.fat;
    expect(protein).toBeCloseTo(daily.protein, 1);
    expect(fat).toBeCloseTo(daily.fat, 1);
  });
});

describe('macro energy vs calorie target', () => {
  it('reports both numbers instead of forcing them to be equal', () => {
    const day = computeDayTargets({
      weightKg: 70,
      trainingDay: true,
      targetCalories: 1900,
      postWorkout: noPostWorkout,
    });
    // 210*4 + 112*4 + 42*9 = 1666 kcal from macros vs a 1900 kcal target.
    expect(day.macroCalories).toBe(1666);
    expect(day.targetCalories).toBe(1900);
    expect(day.calorieDelta).toBe(234);
    expect(day.calorieMismatch).toBe(true);
  });

  it('does not flag a small mismatch', () => {
    const day = computeDayTargets({
      weightKg: 70,
      trainingDay: true,
      targetCalories: 1700,
      postWorkout: noPostWorkout,
    });
    expect(day.calorieMismatch).toBe(false);
  });
});
