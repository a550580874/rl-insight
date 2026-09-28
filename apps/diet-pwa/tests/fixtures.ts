/**
 * Test fixtures mirroring the seeded food library (migrations/0002_seed_foods.sql)
 * so the algorithm tests run against the same numbers the app ships with.
 */

import type { Food, FoodInput, FoodRole } from '../src/shared/types';

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
    unitLabel: seed.unitLabel ?? null,
    unitGrams: seed.unitGrams ?? null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
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
    unitLabel: null,
    unitGrams: null,
    ...overrides,
  };
}
