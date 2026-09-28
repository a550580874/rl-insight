/**
 * Contract §32 cases 5-6: the post-workout module (banana + protein powder)
 * must count towards the daily totals, plus the surrounding day-plan plumbing.
 */

import { describe, expect, it } from 'vitest';
import { computeDayPlan, normalizePlan, optimizePreWorkoutCarbs, planMacros } from '../src/shared/nutrition/mealPlan';
import type { MealPlan } from '../src/shared/types';
import { BANANA, BROCCOLI, CHICKEN, EGG, MILK, OATS, OLIVE_OIL, PROTEIN_POWDER, RICE, SWEET_POTATO, foods } from './fixtures';

function basePlan(): MealPlan {
  return {
    breakfast: [
      { foodId: OATS, grams: 80, locked: false },
      { foodId: EGG, grams: 100, locked: false },
      { foodId: MILK, grams: 250, locked: false },
    ],
    lunch: [
      { foodId: RICE, grams: 280, locked: false },
      { foodId: CHICKEN, grams: 120, locked: false },
      { foodId: BROCCOLI, grams: 150, locked: false },
      { foodId: OLIVE_OIL, grams: 10, locked: false },
    ],
    dinner: [
      { foodId: SWEET_POTATO, grams: 100, locked: false },
      { foodId: CHICKEN, grams: 120, locked: false },
      { foodId: BROCCOLI, grams: 150, locked: false },
      { foodId: OLIVE_OIL, grams: 10, locked: false },
    ],
    postWorkout: [],
  };
}

function day(plan: MealPlan, trainingDay = true) {
  return computeDayPlan({
    date: '2026-09-28',
    weightKg: 70,
    trainingDay,
    trainingAfterMeal: 'lunch',
    targetCalories: 1900,
    plan,
    foods,
  });
}

function mealTargetCarbs(result: ReturnType<typeof day>): number {
  return (
    result.modules.breakfast.target.carbs + result.modules.lunch.target.carbs + result.modules.dinner.target.carbs
  );
}

function mealTargetProtein(result: ReturnType<typeof day>): number {
  return (
    result.modules.breakfast.target.protein +
    result.modules.lunch.target.protein +
    result.modules.dinner.target.protein
  );
}

describe('Case 5: post-workout banana counts towards the daily carbohydrate total', () => {
  it('subtracts the banana carbohydrate from the meal budgets', () => {
    const without = day(basePlan());
    const planWithBanana = basePlan();
    planWithBanana.postWorkout = [{ foodId: BANANA, grams: 120, locked: false }];
    const withBanana = day(planWithBanana);

    // 120 g banana x 22.8 g carbs / 100 g = 27.36 -> 27.4 g
    expect(withBanana.modules.postWorkout.actual.carbs).toBeCloseTo(27.4, 1);
    expect(mealTargetCarbs(without) - mealTargetCarbs(withBanana)).toBeCloseTo(27.4, 1);
  });

  it('still reaches the full daily carbohydrate target', () => {
    const planWithBanana = basePlan();
    planWithBanana.postWorkout = [{ foodId: BANANA, grams: 120, locked: false }];
    const result = day(planWithBanana);

    expect(result.dailyTarget).toEqual({ carbs: 210, protein: 112, fat: 42 });
    expect(Math.abs(result.totals.carbs - 210)).toBeLessThan(12);
    // The banana is part of the day, not a free extra.
    expect(result.totals.carbs).toBeGreaterThan(result.modules.breakfast.actual.carbs);
    expect(result.modules.postWorkout.actual.carbs).toBeGreaterThan(0);
  });

  it('follows the banana weight the user actually edits', () => {
    const heavy = basePlan();
    heavy.postWorkout = [{ foodId: BANANA, grams: 200, locked: false }];
    const result = day(heavy);
    expect(result.modules.postWorkout.actual.carbs).toBeCloseTo(45.6, 1);
    expect(mealTargetCarbs(result)).toBeLessThan(mealTargetCarbs(day(basePlan())));
  });
});

describe('Case 6: post-workout protein powder counts towards the daily protein total', () => {
  it('subtracts the powder protein from the meal budgets', () => {
    const without = day(basePlan());
    const planWithPowder = basePlan();
    planWithPowder.postWorkout = [{ foodId: PROTEIN_POWDER, grams: 30, locked: false }];
    const withPowder = day(planWithPowder);

    // 30 g of the sample powder at 80 g protein / 100 g = 24 g
    expect(withPowder.modules.postWorkout.actual.protein).toBeCloseTo(24, 1);
    expect(mealTargetProtein(without) - mealTargetProtein(withPowder)).toBeCloseTo(24, 1);
  });

  it('counts banana and powder together for both macros', () => {
    const full = basePlan();
    full.postWorkout = [
      { foodId: BANANA, grams: 120, locked: false },
      { foodId: PROTEIN_POWDER, grams: 30, locked: false },
    ];
    const result = day(full);

    expect(result.modules.postWorkout.actual.protein).toBeCloseTo(25.3, 1);
    expect(result.modules.postWorkout.actual.carbs).toBeCloseTo(29.8, 1);
    // Daily totals include the whole post-workout module.
    expect(result.totals.protein).toBeGreaterThan(100);
    expect(Math.abs(result.totals.protein - 112)).toBeLessThan(12);
  });

  it('hides the post-workout module on rest days', () => {
    const plan = basePlan();
    plan.postWorkout = [
      { foodId: BANANA, grams: 120, locked: false },
      { foodId: PROTEIN_POWDER, grams: 30, locked: false },
    ];
    const result = day(plan, false);

    expect(result.modules.postWorkout.items).toEqual([]);
    expect(result.modules.postWorkout.actual.calories).toBe(0);
    // Rest-day budget without the supplements subtracted.
    expect(mealTargetCarbs(result)).toBe(160);
  });
});

describe('day plan assembly', () => {
  it('reports the daily totals as the sum of the four modules', () => {
    const plan = basePlan();
    plan.postWorkout = [
      { foodId: BANANA, grams: 120, locked: false },
      { foodId: PROTEIN_POWDER, grams: 30, locked: false },
    ];
    const result = day(plan);
    const sumC = [result.modules.breakfast, result.modules.lunch, result.modules.dinner, result.modules.postWorkout]
      .reduce((total, module) => total + module.actual.carbs, 0);
    expect(result.totals.carbs).toBeCloseTo(sumC, 1);
  });

  it('shows both the macro energy and the calorie target', () => {
    const result = day(basePlan());
    expect(result.macroTargetCalories).toBe(1666);
    expect(result.targetCalories).toBe(1900);
    expect(result.calorieDelta).toBe(234);
  });

  it('reports remaining macros that can go negative when over target', () => {
    const result = day(basePlan());
    expect(result.remaining.calories).toBeCloseTo(1900 - result.totals.calories, 1);
  });

  it('displays 鸡蛋 in units while keeping grams underneath', () => {
    const plan = basePlan();
    plan.breakfast = [{ foodId: EGG, grams: 100, locked: true }];
    plan.lunch = [];
    plan.dinner = [];
    const result = day(plan);
    const egg = result.modules.breakfast.items[0];
    expect(egg?.grams).toBe(100);
    expect(egg?.units).toBe(2);
    expect(egg?.unitLabel).toBe('个');
    // The 4 eggs worth of macros are still grams based.
    expect(egg?.macros.protein).toBeCloseTo(12.6, 1);
  });

  it('normalises a partial plan coming from the API', () => {
    const plan = normalizePlan({ breakfast: [{ foodId: RICE, grams: 100, locked: false }] });
    expect(plan.lunch).toEqual([]);
    expect(plan.postWorkout).toEqual([]);
    expect(plan.breakfast).toHaveLength(1);
  });

  it('computes plan macros without optimising', () => {
    const plan = basePlan();
    plan.postWorkout = [{ foodId: BANANA, grams: 100, locked: false }];

    const expectedCarbs = [plan.breakfast, plan.lunch, plan.dinner, plan.postWorkout]
      .flat()
      .reduce((total, item) => {
        const food = foods.find((candidate) => candidate.id === item.foodId);
        return total + ((food?.carbsPer100g ?? 0) * item.grams) / 100;
      }, 0);

    const macros = planMacros(plan, foods, true);
    expect(macros.carbs).toBeCloseTo(Math.round(expectedCarbs * 10) / 10, 1);
    // Rest day ignores the post-workout module.
    expect(planMacros(plan, foods, false).carbs).toBeLessThan(macros.carbs);
  });
});

describe('"optimise pre-workout carbs" moves carbohydrate without creating any', () => {
  it('moves carbs from lunch to dinner when training after dinner', () => {
    const result = day(basePlan());
    const moved = optimizePreWorkoutCarbs(result.modules, 'dinner', 20);
    expect(moved.lunch.carbs).toBeCloseTo(result.modules.lunch.target.carbs - 20, 1);
    expect(moved.dinner.carbs).toBeCloseTo(result.modules.dinner.target.carbs + 20, 1);
  });

  it('never changes the daily carbohydrate total', () => {
    const result = day(basePlan());
    const before =
      result.modules.breakfast.target.carbs + result.modules.lunch.target.carbs + result.modules.dinner.target.carbs;
    for (const after of ['breakfast', 'lunch', 'dinner'] as const) {
      const moved = optimizePreWorkoutCarbs(result.modules, after, 20);
      const total = moved.breakfast.carbs + moved.lunch.carbs + moved.dinner.carbs;
      expect(total).toBeCloseTo(before, 1);
    }
  });

  it('cannot move more carbohydrate than the source meal has', () => {
    const result = day(basePlan());
    const moved = optimizePreWorkoutCarbs(result.modules, 'dinner', 9999);
    expect(moved.lunch.carbs).toBe(0);
    expect(moved.dinner.carbs).toBeCloseTo(result.modules.dinner.target.carbs + result.modules.lunch.target.carbs, 1);
  });
});
