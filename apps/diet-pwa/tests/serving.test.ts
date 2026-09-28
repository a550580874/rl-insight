/**
 * MING-21 "按份管理" (per-serving food management) contract.
 *
 * Cases 1-8 of the task, plus the API validation rules that back them:
 *
 *   1. the per-100g mode is untouched,
 *   2. 按份 nutrition = servings x per-serving,
 *   3. a serving weight derives the per-serving numbers from per 100 g,
 *   4. foods without any serving data keep working,
 *   5. a saved 2 个鸡蛋 row survives a reload as 2 个 (not 100 g),
 *   6. daily totals add grams and servings items together,
 *   7. food CRUD stores and updates the serving configuration,
 *   8. serving_enabled = false leaves the existing behaviour alone.
 */

import { describe, expect, it } from 'vitest';
import { parseFoodInput } from '../src/worker/handlers/foods';
import { parsePlan, resolvePlanQuantities } from '../src/worker/handlers/records';
import { mapFoodRow, mapMealItemRow } from '../src/worker/db';
import { HttpError } from '../src/worker/http';
import { computeDayPlan, planMacros, toOptimizerFood } from '../src/shared/nutrition/mealPlan';
import { optimizeMeal } from '../src/shared/nutrition/optimizer';
import {
  calculateFoodNutrition,
  effectiveGrams,
  hasServingNutrition,
  resolveServingNutrition,
  servingsForGrams,
} from '../src/shared/nutrition/serving';
import type { Food, MealPlan } from '../src/shared/types';
import {
  BANANA_SERVING,
  BOXED_MILK_SERVING,
  EGG,
  EGG_SERVING,
  OATS,
  POWDER_SERVING,
  RICE,
  foodById,
  foodInput,
  foods,
  mealItem,
  servingItem,
} from './fixtures';

function food(id: number): Food {
  const found = foodById.get(id);
  if (!found) throw new Error(`missing fixture ${id}`);
  return found;
}

describe('Case 1: the per-100g mode is unchanged', () => {
  it('scales linearly with grams', () => {
    const macros = calculateFoodNutrition(food(EGG), { quantityType: 'grams', grams: 50, servings: 0 });
    // 143 kcal / 100 g x 50 g = 71.5 kcal, 12.6 P -> 6.3 P
    expect(macros.calories).toBeCloseTo(71.5, 1);
    expect(macros.protein).toBeCloseTo(6.3, 1);
    expect(macros.fat).toBeCloseTo(4.8, 1);
    expect(macros.carbs).toBeCloseTo(0.4, 1);
  });

  it('keeps an item without an explicit quantity mode in grams', () => {
    // `grams` only: the shape every pre-按份 client sends.
    const macros = calculateFoodNutrition(food(RICE), { grams: 250 });
    expect(macros.carbs).toBeCloseTo(70.3, 1);
    expect(macros.calories).toBeCloseTo(325, 1);
  });

  it('matches the day plan totals for a 100 g plan', () => {
    const plan: MealPlan = { breakfast: [], lunch: [mealItem(RICE, 250, true)], dinner: [], postWorkout: [] };
    const macros = planMacros(plan, foods, true);
    expect(macros.carbs).toBeCloseTo(70.3, 1);
  });
});

describe('Case 2: 按份 nutrition = servings x per-serving', () => {
  const egg = food(EGG_SERVING);

  it('1 个鸡蛋 = 72 kcal / 6.3P / 4.8F / 0.4C', () => {
    const macros = calculateFoodNutrition(egg, { quantityType: 'servings', servings: 1, grams: 50 });
    expect(macros).toEqual({ calories: 72, protein: 6.3, fat: 4.8, carbs: 0.4 });
  });

  it('2 个鸡蛋 doubles it', () => {
    const macros = calculateFoodNutrition(egg, { quantityType: 'servings', servings: 2, grams: 100 });
    expect(macros).toEqual({ calories: 144, protein: 12.6, fat: 9.6, carbs: 0.8 });
  });

  it('does not drift from the serving count no matter what grams says', () => {
    const wrongGrams = calculateFoodNutrition(egg, { quantityType: 'servings', servings: 2, grams: 999 });
    expect(wrongGrams.calories).toBe(144);
  });

  it('keeps the serving weight as the effective weight', () => {
    expect(effectiveGrams(egg, { servings: 2 })).toBe(100);
  });

  it('supports a half-serving step', () => {
    const powder = food(POWDER_SERVING);
    expect(powder.servingStep).toBe(0.5);
    expect(calculateFoodNutrition(powder, { quantityType: 'servings', servings: 1.5, grams: 45 }).protein).toBe(36);
  });
});

describe('Case 3: a serving weight derives the per-serving numbers', () => {
  it('derives 72 kcal from 144 kcal / 100 g and a 50 g serving', () => {
    const resolved = resolveServingNutrition({
      servingEnabled: true,
      unitGrams: 50,
      kcalPer100g: 144,
      proteinPer100g: 12.6,
      fatPer100g: 9.6,
      carbsPer100g: 0.8,
      kcalPerServing: null,
      proteinPerServing: null,
      fatPerServing: null,
      carbsPerServing: null,
    });
    expect(resolved).toEqual({ kcalPerServing: 72, proteinPerServing: 6.3, fatPerServing: 4.8, carbsPerServing: 0.4 });
  });

  it('lets an explicit value win over the derived one', () => {
    const resolved = resolveServingNutrition({
      servingEnabled: true,
      unitGrams: 50,
      kcalPer100g: 144,
      proteinPer100g: 12.6,
      fatPer100g: 9.6,
      carbsPer100g: 0.8,
      // A packaged box that says 250 kcal even though the weight suggests 240.
      kcalPerServing: 250,
      proteinPerServing: null,
      fatPerServing: null,
      carbsPerServing: null,
    });
    expect(resolved.kcalPerServing).toBe(250);
    expect(resolved.proteinPerServing).toBe(6.3);
  });

  it('derives nothing when the serving weight is unknown', () => {
    const resolved = resolveServingNutrition({
      servingEnabled: true,
      unitGrams: null,
      kcalPer100g: 144,
      proteinPer100g: 12.6,
      fatPer100g: 9.6,
      carbsPer100g: 0.8,
      kcalPerServing: null,
      proteinPerServing: null,
      fatPerServing: null,
      carbsPerServing: null,
    });
    expect(resolved).toEqual({ kcalPerServing: null, proteinPerServing: null, fatPerServing: null, carbsPerServing: null });
  });

  it('is wired into food writes: omit the per-serving numbers to have them derived', () => {
    const input = parseFoodInput({
      name: '鸡蛋（自动换算）',
      category: '蛋类',
      role: 'mixed',
      kcalPer100g: 144,
      proteinPer100g: 12.6,
      fatPer100g: 9.6,
      carbsPer100g: 0.8,
      servingEnabled: true,
      unitLabel: '个',
      unitGrams: 50,
    });
    expect(input.servingEnabled).toBe(true);
    expect(input.kcalPerServing).toBe(72);
    expect(input.proteinPerServing).toBe(6.3);
  });
});

describe('switching 重量 <-> 份 keeps the same amount', () => {
  it('turns 100 g of a 50 g serving into 2 个, not 1', () => {
    expect(servingsForGrams(food(EGG_SERVING), 100, 1)).toBe(2);
  });

  it('snaps to the food serving step', () => {
    // 100 g of 30 g scoops, 0.5 step: 3.33 -> 3.5 勺.
    expect(servingsForGrams(food(POWDER_SERVING), 100, 0.5)).toBe(3.5);
    // 90 g is exactly 3 scoops.
    expect(servingsForGrams(food(POWDER_SERVING), 90, 0.5)).toBe(3);
  });

  it('never returns zero servings for a positive weight', () => {
    expect(servingsForGrams(food(EGG_SERVING), 5, 1)).toBe(1);
  });

  it('returns 0 when there is nothing to convert with', () => {
    expect(servingsForGrams(food(BOXED_MILK_SERVING), 100, 1)).toBe(0);
    expect(servingsForGrams(food(EGG_SERVING), 0, 1)).toBe(0);
    expect(servingsForGrams(food(EGG), 100, 1)).toBe(0);
  });

  it('round-trips through grams without drifting', () => {
    const egg = food(EGG_SERVING);
    const servings = servingsForGrams(egg, 150, 1);
    expect(servings).toBe(3);
    expect(effectiveGrams(egg, { servings })).toBe(150);
  });
});

describe('Case 4: foods without serving data keep working', () => {
  it('treats a legacy display unit as display-only', () => {
    const legacyEgg = food(EGG);
    expect(legacyEgg.servingEnabled).toBe(false);
    expect(hasServingNutrition(legacyEgg)).toBe(false);
    // 100 g of the legacy egg is still 143 kcal from per-100g, not 2 x anything.
    expect(calculateFoodNutrition(legacyEgg, { grams: 100 }).calories).toBe(143);
  });

  it('falls back to grams when a client claims servings on a non-serving food', () => {
    const macros = calculateFoodNutrition(food(EGG), { quantityType: 'servings', servings: 2, grams: 100 });
    expect(macros.calories).toBe(143);
  });

  it('shows the legacy derived unit count in the day plan', () => {
    const plan: MealPlan = { breakfast: [mealItem(EGG, 100, true)], lunch: [], dinner: [], postWorkout: [] };
    const result = computeDayPlan({
      date: '2026-09-28',
      weightKg: 70,
      trainingDay: false,
      trainingAfterMeal: 'lunch',
      targetCalories: 1900,
      plan,
      foods,
    });
    const egg = result.modules.breakfast.items[0];
    expect(egg?.quantityType).toBe('grams');
    expect(egg?.units).toBe(2);
    expect(egg?.unitLabel).toBe('个');
    expect(egg?.grams).toBe(100);
  });
});

describe('Case 5: a saved 2 个鸡蛋 row reloads as 2 个', () => {
  it('parses quantityType + servings out of the API payload', () => {
    const plan = parsePlan({
      breakfast: [{ foodId: EGG_SERVING, grams: 100, quantityType: 'servings', servings: 2, locked: true }],
    });
    expect(plan.breakfast[0]).toEqual({
      foodId: EGG_SERVING,
      grams: 100,
      quantityType: 'servings',
      servings: 2,
      locked: true,
    });
  });

  it('re-derives the effective grams and keeps the user input', () => {
    const plan = parsePlan({
      breakfast: [{ foodId: EGG_SERVING, grams: 0, quantityType: 'servings', servings: 2, locked: false }],
    });
    const resolved = resolvePlanQuantities(plan, foods);
    expect(resolved.breakfast[0]?.grams).toBe(100);
    expect(resolved.breakfast[0]?.servings).toBe(2);
    expect(resolved.breakfast[0]?.quantityType).toBe('servings');
  });

  it('stores and reads the row without turning it into 100 g', () => {
    // What saveRecord writes...
    const row = {
      module: 'breakfast',
      food_id: EGG_SERVING,
      grams: 100,
      quantity_type: 'servings',
      servings: 2,
      locked: 1,
      sort_order: 0,
    };
    expect(mapMealItemRow(row)).toEqual({
      foodId: EGG_SERVING,
      grams: 100,
      quantityType: 'servings',
      servings: 2,
      locked: true,
    });
  });

  it('reads a pre-按份 row back as grams', () => {
    const legacy = mapMealItemRow({
      module: 'lunch',
      food_id: RICE,
      grams: 250,
      quantity_type: 'grams',
      servings: 0,
      locked: 0,
      sort_order: 0,
    });
    expect(legacy.quantityType).toBe('grams');
    expect(legacy.servings).toBe(0);
    expect(legacy.grams).toBe(250);
  });

  it('rejects 按份 on a food that has no serving definition', () => {
    const plan = parsePlan({
      breakfast: [{ foodId: RICE, grams: 0, quantityType: 'servings', servings: 2, locked: false }],
    });
    expect(() => resolvePlanQuantities(plan, foods)).toThrow(HttpError);
  });

  it('rejects a zero serving count', () => {
    const plan = parsePlan({
      breakfast: [{ foodId: EGG_SERVING, grams: 0, quantityType: 'servings', servings: 0, locked: false }],
    });
    expect(() => resolvePlanQuantities(plan, foods)).toThrow(HttpError);
  });

  it('rejects a negative serving count at parse time', () => {
    expect(() =>
      parsePlan({ breakfast: [{ foodId: EGG_SERVING, quantityType: 'servings', servings: -1 }] }),
    ).toThrow(HttpError);
  });

  it('keeps a servings item out of the gram search', () => {
    const optimizerFoods = [toOptimizerFood(food(EGG_SERVING))];
    const result = optimizeMeal({
      foods: optimizerFoods,
      items: [servingItem(EGG_SERVING, 2, 100)],
      target: { carbs: 85, protein: 32, fat: 12 },
    });
    expect(result.items[0]).toEqual({
      foodId: EGG_SERVING,
      grams: 100,
      quantityType: 'servings',
      servings: 2,
      locked: false,
    });
    // 2 eggs contribute exactly their per-serving macros.
    expect(result.macros.calories).toBe(144);
    expect(result.macros.protein).toBeCloseTo(12.6, 1);
  });

  it('counts a 按份 food with no serving weight as a fixed contribution', () => {
    const optimizerFoods = [toOptimizerFood(food(BOXED_MILK_SERVING))];
    const result = optimizeMeal({
      foods: optimizerFoods,
      items: [servingItem(BOXED_MILK_SERVING, 1, 0)],
      target: { carbs: 20, protein: 13, fat: 13.5 },
    });
    expect(result.macros.calories).toBe(250);
    expect(result.macros.protein).toBe(13);
    expect(result.items[0]?.grams).toBe(0);
    expect(result.items[0]?.servings).toBe(1);
  });
});

describe('Case 6: daily totals mix grams and servings', () => {
  function day(plan: MealPlan) {
    return computeDayPlan({
      date: '2026-09-28',
      weightKg: 70,
      trainingDay: false,
      trainingAfterMeal: 'lunch',
      targetCalories: 1900,
      plan,
      foods,
    });
  }

  it('adds 2 个鸡蛋 to 250 g 米饭', () => {
    const plan: MealPlan = {
      breakfast: [servingItem(EGG_SERVING, 2, 100, true)],
      lunch: [mealItem(RICE, 250, true)],
      dinner: [],
      postWorkout: [],
    };
    const meals = day(plan);

    const egg = meals.modules.breakfast.items[0];
    expect(egg?.servings).toBe(2);
    expect(egg?.macros).toEqual({ calories: 144, protein: 12.6, fat: 9.6, carbs: 0.8 });

    const rice = meals.modules.lunch.items[0];
    expect(rice?.quantityType).toBe('grams');
    expect(rice?.macros.carbs).toBeCloseTo(70.3, 1);

    expect(meals.totals.calories).toBeCloseTo(144 + 325, 1);
    expect(meals.totals.protein).toBeCloseTo(12.6 + 6.8, 1);
    expect(meals.totals.carbs).toBeCloseTo(0.8 + 70.3, 1);
    expect(meals.modules.breakfast.actual.calories).toBe(144);
  });

  it('totals a mixed plan the same way for the history summary', () => {
    const plan: MealPlan = {
      breakfast: [servingItem(EGG_SERVING, 2, 100, true), mealItem(OATS, 50, true)],
      lunch: [],
      dinner: [],
      postWorkout: [],
    };
    const macros = planMacros(plan, foods, true);
    // 194.5 from the oats (389 x 0.5) + 144 from the eggs.
    expect(macros.calories).toBeCloseTo(338.5, 1);
  });

  it('counts 按份 supplements in the post-workout module', () => {
    const plan: MealPlan = {
      breakfast: [],
      lunch: [],
      dinner: [],
      postWorkout: [servingItem(BANANA_SERVING, 1, 120), servingItem(POWDER_SERVING, 1, 30)],
    };
    const result = computeDayPlan({
      date: '2026-09-28',
      weightKg: 70,
      trainingDay: true,
      trainingAfterMeal: 'lunch',
      targetCalories: 1900,
      plan,
      foods,
    });
    expect(result.modules.postWorkout.actual.calories).toBeCloseTo(106.8 + 120, 1);
    expect(result.totals.calories).toBeGreaterThan(226);
  });
});

describe('Case 7: food CRUD stores and updates the serving configuration', () => {
  it('accepts a full 按份 food', () => {
    const input = parseFoodInput({
      name: '鸡蛋',
      category: '蛋类',
      role: 'mixed',
      kcalPer100g: 144,
      proteinPer100g: 12.6,
      fatPer100g: 9.6,
      carbsPer100g: 0.8,
      minGrams: 0,
      maxGrams: 300,
      stepGrams: 50,
      servingEnabled: true,
      unitLabel: '个',
      unitGrams: 50,
      kcalPerServing: 72,
      proteinPerServing: 6.3,
      fatPerServing: 4.8,
      carbsPerServing: 0.4,
      servingStep: 1,
    });
    expect(input).toMatchObject({
      servingEnabled: true,
      unitLabel: '个',
      unitGrams: 50,
      kcalPerServing: 72,
      proteinPerServing: 6.3,
      fatPerServing: 4.8,
      carbsPerServing: 0.4,
      servingStep: 1,
    });
  });

  it('accepts a custom unit name instead of hard-coding 个', () => {
    for (const unit of ['个', '根', '片', '勺', '盒', '杯', '包', '份', '把']) {
      const input = parseFoodInput({
        name: `食物-${unit}`,
        category: '其他',
        role: 'mixed',
        kcalPer100g: 100,
        proteinPer100g: 5,
        fatPer100g: 5,
        carbsPer100g: 10,
        servingEnabled: true,
        unitLabel: unit,
        kcalPerServing: 100,
      });
      expect(input.unitLabel).toBe(unit);
    }
  });

  it('round-trips through the D1 row shape', () => {
    const stored = mapFoodRow({
      id: 7,
      name: '鸡蛋',
      category: '蛋类',
      role: 'mixed',
      kcal_per_100g: 144,
      protein_per_100g: 12.6,
      fat_per_100g: 9.6,
      carbs_per_100g: 0.8,
      enabled: 1,
      min_grams: 0,
      max_grams: 300,
      step_grams: 50,
      serving_enabled: 1,
      unit_label: '个',
      unit_grams: 50,
      kcal_per_serving: 72,
      protein_per_serving: 6.3,
      fat_per_serving: 4.8,
      carbs_per_serving: 0.4,
      serving_step: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(stored.servingEnabled).toBe(true);
    expect(stored.unitLabel).toBe('个');
    expect(calculateFoodNutrition(stored, { quantityType: 'servings', servings: 2 }).calories).toBe(144);
  });

  it('clears the per-serving numbers when 按份 is switched off', () => {
    const input = parseFoodInput({
      name: '鸡蛋',
      category: '蛋类',
      role: 'mixed',
      kcalPer100g: 144,
      proteinPer100g: 12.6,
      fatPer100g: 9.6,
      carbsPer100g: 0.8,
      servingEnabled: false,
      // A stale value from a previous save must not survive.
      unitLabel: '个',
      unitGrams: 50,
      kcalPerServing: 72,
      proteinPerServing: 6.3,
      fatPerServing: 4.8,
      carbsPerServing: 0.4,
    });
    expect(input.servingEnabled).toBe(false);
    expect(input.kcalPerServing).toBeNull();
    expect(input.proteinPerServing).toBeNull();
    expect(input.fatPerServing).toBeNull();
    expect(input.carbsPerServing).toBeNull();
    // The legacy display unit is kept, so the old UI still shows 个.
    expect(input.unitLabel).toBe('个');
    expect(input.unitGrams).toBe(50);
  });

  it('rejects 按份 without a unit name', () => {
    expect(() =>
      parseFoodInput({
        name: '鸡蛋',
        category: '蛋类',
        role: 'mixed',
        kcalPer100g: 144,
        proteinPer100g: 12.6,
        fatPer100g: 9.6,
        carbsPer100g: 0.8,
        servingEnabled: true,
        unitLabel: null,
        kcalPerServing: 72,
      }),
    ).toThrow(HttpError);
  });

  it('rejects 按份 with neither per-serving nutrition nor a serving weight', () => {
    expect(() =>
      parseFoodInput({
        name: '鸡蛋',
        category: '蛋类',
        role: 'mixed',
        kcalPer100g: 144,
        proteinPer100g: 12.6,
        fatPer100g: 9.6,
        carbsPer100g: 0.8,
        servingEnabled: true,
        unitLabel: '个',
        unitGrams: null,
      }),
    ).toThrow(HttpError);
  });

  it('rejects a negative per-serving value', () => {
    expect(() =>
      parseFoodInput({
        name: '鸡蛋',
        category: '蛋类',
        role: 'mixed',
        kcalPer100g: 144,
        proteinPer100g: 12.6,
        fatPer100g: 9.6,
        carbsPer100g: 0.8,
        servingEnabled: true,
        unitLabel: '个',
        kcalPerServing: -1,
      }),
    ).toThrow(HttpError);
  });

  it('rejects a non-positive serving weight when one is given', () => {
    expect(() =>
      parseFoodInput({
        name: '鸡蛋',
        category: '蛋类',
        role: 'mixed',
        kcalPer100g: 144,
        proteinPer100g: 12.6,
        fatPer100g: 9.6,
        carbsPer100g: 0.8,
        servingEnabled: true,
        unitLabel: '个',
        unitGrams: 0,
        kcalPerServing: 72,
      }),
    ).toThrow(HttpError);
  });
});

describe('Case 8: serving_enabled = false changes nothing', () => {
  it('accepts a legacy payload byte-for-byte', () => {
    const legacy = {
      name: '熟米饭（旧客户端）',
      category: '主食',
      role: 'carb',
      kcalPer100g: 130,
      proteinPer100g: 2.7,
      fatPer100g: 0.3,
      carbsPer100g: 28.1,
      enabled: true,
      minGrams: 50,
      maxGrams: 500,
      stepGrams: 10,
      unitLabel: null,
      unitGrams: null,
    };
    const input = parseFoodInput(legacy);
    expect(input.servingEnabled).toBe(false);
    expect(input.servingStep).toBe(1);
    expect(input.servingEnabled).toBe(false);
    expect(input.kcalPerServing).toBeNull();
  });

  it('treats a legacy payload without the serving fields at all as grams', () => {
    const plan = parsePlan({
      lunch: [{ foodId: RICE, grams: 250, locked: true }],
    });
    expect(plan.lunch[0]).toEqual({ foodId: RICE, grams: 250, quantityType: 'grams', servings: 0, locked: true });
  });

  it('leaves the optimizer result for an all-grams plan identical', () => {
    const plan: MealPlan = {
      breakfast: [],
      lunch: [mealItem(RICE, 200), mealItem(EGG, 100, true)],
      dinner: [],
      postWorkout: [],
    };
    const foodsWithServingOff = [food(RICE), food(EGG)];
    const result = computeDayPlan({
      date: '2026-09-28',
      weightKg: 70,
      trainingDay: false,
      trainingAfterMeal: 'lunch',
      targetCalories: 1900,
      plan,
      foods: foodsWithServingOff,
    });
    for (const item of result.modules.lunch.items) {
      expect(item.quantityType).toBe('grams');
      expect(item.servings).toBe(0);
      expect(item.macros.calories).toBeGreaterThan(0);
    }
  });
});

describe('every food fixture stays internally consistent', () => {
  it('only marks a food as 按份 when it really has serving data', () => {
    for (const item of foods) {
      if (item.servingEnabled) {
        expect(item.unitLabel).not.toBeNull();
        expect(hasServingNutrition(item)).toBe(true);
      } else {
        expect(item.kcalPerServing).toBeNull();
        expect(item.proteinPerServing).toBeNull();
      }
    }
  });

  it('exposes a built builder for a legacy payload', () => {
    expect(foodInput({ name: 'x' }).servingEnabled).toBe(false);
  });
});
