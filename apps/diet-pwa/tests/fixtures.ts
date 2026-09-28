/**
 * Test fixtures mirroring the seeded food library (migrations/0002_seed_foods.sql)
 * so the algorithm tests run against the same numbers the app ships with.
 */

import type { Food, FoodInput, FoodRole, MealItem, QuantityType } from '../src/shared/types';

interface FoodSeed {
  id: number;
  name: string;
  category: string;
  role: FoodRole;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  min?: number;
  max?: number;
  step?: number;
  unitLabel?: string | null;
  unitGrams?: number | null;
  servingEnabled?: boolean;
  kcalPerServing?: number | null;
  proteinPerServing?: number | null;
  fatPerServing?: number | null;
  carbsPerServing?: number | null;
  servingStep?: number;
}

function makeFood(seed: FoodSeed): Food {
  return {
    id: seed.id,
    name: seed.name,
    category: seed.category,
    role: seed.role,
    kcalPer100g: seed.kcal,
    proteinPer100g: seed.protein,
    fatPer100g: seed.fat,
    carbsPer100g: seed.carbs,
    enabled: true,
    minGrams: seed.min ?? 0,
    maxGrams: seed.max ?? 500,
    stepGrams: seed.step ?? 5,
    servingEnabled: seed.servingEnabled ?? false,
    unitLabel: seed.unitLabel ?? null,
    unitGrams: seed.unitGrams ?? null,
    kcalPerServing: seed.kcalPerServing ?? null,
    proteinPerServing: seed.proteinPerServing ?? null,
    fatPerServing: seed.fatPerServing ?? null,
    carbsPerServing: seed.carbsPerServing ?? null,
    servingStep: seed.servingStep ?? 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

/** A grams-mode meal item, the pre-按份 shape. */
export function mealItem(foodId: number, grams: number, locked = false): MealItem {
  return { foodId, grams, quantityType: 'grams', servings: 0, locked };
}

/** A 按份 meal item: `servings` of the food, with its effective weight. */
export function servingItem(foodId: number, servings: number, grams: number, locked = false): MealItem {
  return { foodId, grams, quantityType: 'servings', servings, locked };
}

/** Re-typed helper for tests that build items with a dynamic quantity mode. */
export function quantityItem(
  foodId: number,
  quantityType: QuantityType,
  value: number,
  grams: number,
  locked = false,
): MealItem {
  return quantityType === 'servings' ? servingItem(foodId, value, grams, locked) : mealItem(foodId, grams, locked);
}

export const CHICKEN = 1;
export const EGG = 2;
export const MILK = 3;
export const PROTEIN_POWDER = 4;
export const RICE = 10;
export const OATS = 11;
export const SWEET_POTATO = 12;
export const BANANA = 13;
export const OLIVE_OIL = 20;
export const NUTS = 21;
export const BROCCOLI = 30;

/** 按份 foods: the same library, plus an explicit serving definition. */
export const EGG_SERVING = 40;
export const BANANA_SERVING = 41;
/** Serving with a weight: 1 勺 = 30 g. */
export const POWDER_SERVING = 42;
/** Serving without a weight: the packaging only knows 1 盒. */
export const BOXED_MILK_SERVING = 43;

export const foods: Food[] = [
  makeFood({ id: CHICKEN, name: '鸡胸肉', category: '肉类', role: 'protein', kcal: 165, protein: 31, fat: 3.6, carbs: 0, min: 50, max: 300, step: 10 }),
  makeFood({ id: EGG, name: '鸡蛋', category: '蛋类', role: 'mixed', kcal: 143, protein: 12.6, fat: 9.5, carbs: 0.7, min: 50, max: 300, step: 50, unitLabel: '个', unitGrams: 50 }),
  makeFood({ id: MILK, name: '牛奶', category: '奶类', role: 'mixed', kcal: 61, protein: 3.2, fat: 3.3, carbs: 4.8, min: 100, max: 500, step: 50, unitLabel: 'ml', unitGrams: 1 }),
  makeFood({ id: PROTEIN_POWDER, name: '蛋白粉', category: '补剂', role: 'protein', kcal: 400, protein: 80, fat: 5, carbs: 8, min: 0, max: 100, step: 5 }),
  makeFood({ id: RICE, name: '熟米饭', category: '主食', role: 'carb', kcal: 130, protein: 2.7, fat: 0.3, carbs: 28.1, min: 50, max: 500, step: 10 }),
  makeFood({ id: OATS, name: '燕麦', category: '主食', role: 'carb', kcal: 389, protein: 16.9, fat: 6.9, carbs: 66.3, min: 20, max: 150, step: 5 }),
  makeFood({ id: SWEET_POTATO, name: '红薯', category: '主食', role: 'carb', kcal: 86, protein: 1.6, fat: 0.1, carbs: 20.1, min: 50, max: 500, step: 10 }),
  makeFood({ id: BANANA, name: '香蕉', category: '水果', role: 'carb', kcal: 89, protein: 1.1, fat: 0.3, carbs: 22.8, min: 50, max: 400, step: 10 }),
  makeFood({ id: OLIVE_OIL, name: '橄榄油', category: '油脂', role: 'fat', kcal: 884, protein: 0, fat: 100, carbs: 0, min: 0, max: 30, step: 5 }),
  makeFood({ id: NUTS, name: '坚果', category: '坚果', role: 'fat', kcal: 607, protein: 20, fat: 54, carbs: 21, min: 0, max: 60, step: 5 }),
  makeFood({ id: BROCCOLI, name: '西兰花', category: '蔬菜', role: 'vegetable', kcal: 34, protein: 2.8, fat: 0.4, carbs: 6.6, min: 50, max: 400, step: 10 }),

  // 鸡蛋 × 个: 1 份 = 1 个 ≈ 50 g = 72 kcal / 6.3P / 4.8F / 0.4C.
  makeFood({
    id: EGG_SERVING, name: '鸡蛋（按份）', category: '蛋类', role: 'mixed',
    kcal: 144, protein: 12.6, fat: 9.6, carbs: 0.8, min: 0, max: 300, step: 50,
    servingEnabled: true, unitLabel: '个', unitGrams: 50,
    kcalPerServing: 72, proteinPerServing: 6.3, fatPerServing: 4.8, carbsPerServing: 0.4, servingStep: 1,
  }),
  makeFood({
    id: BANANA_SERVING, name: '香蕉（按份）', category: '水果', role: 'carb',
    kcal: 89, protein: 1.1, fat: 0.3, carbs: 22.8, min: 0, max: 400, step: 10,
    servingEnabled: true, unitLabel: '根', unitGrams: 120,
    kcalPerServing: 106.8, proteinPerServing: 1.3, fatPerServing: 0.4, carbsPerServing: 27.4, servingStep: 1,
  }),
  makeFood({
    id: POWDER_SERVING, name: '蛋白粉（按份）', category: '补剂', role: 'protein',
    kcal: 400, protein: 80, fat: 5, carbs: 8, min: 0, max: 200, step: 5,
    servingEnabled: true, unitLabel: '勺', unitGrams: 30,
    kcalPerServing: 120, proteinPerServing: 24, fatPerServing: 1.5, carbsPerServing: 2.4, servingStep: 0.5,
  }),
  // No serving weight: only the per-box nutrition is known.
  makeFood({
    id: BOXED_MILK_SERVING, name: '盒装牛奶（按份）', category: '奶类', role: 'mixed',
    kcal: 61, protein: 3.2, fat: 3.3, carbs: 4.8, min: 0, max: 500, step: 50,
    servingEnabled: true, unitLabel: '盒', unitGrams: null,
    kcalPerServing: 250, proteinPerServing: 13, fatPerServing: 13.5, carbsPerServing: 19.7, servingStep: 1,
  }),
];

export const foodById = new Map(foods.map((food) => [food.id, food]));

export function foodInput(overrides: Partial<FoodInput> & { name: string }): FoodInput {
  return {
    category: '其他',
    role: 'mixed',
    kcalPer100g: 100,
    proteinPer100g: 5,
    fatPer100g: 5,
    carbsPer100g: 10,
    enabled: true,
    minGrams: 0,
    maxGrams: 300,
    stepGrams: 5,
    servingEnabled: false,
    unitLabel: null,
    unitGrams: null,
    kcalPerServing: null,
    proteinPerServing: null,
    fatPerServing: null,
    carbsPerServing: null,
    servingStep: 1,
    ...overrides,
  };
}
