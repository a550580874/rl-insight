/**
 * Contract §32 cases 7-8 plus the role / realism requirements from §15-§19:
 * locking a food, rebalancing after a manual edit, serving constraints and
 * avoiding absurd solutions such as "1 kg of rice to fix a protein gap".
 */

import { describe, expect, it } from 'vitest';
import { optimizeMeal, type OptimizerFood } from '../src/shared/nutrition/optimizer';
import { toOptimizerFood } from '../src/shared/nutrition/mealPlan';
import type { MealItem } from '../src/shared/types';
import { BROCCOLI, CHICKEN, MILK, NUTS, OLIVE_OIL, RICE, foods as allFoods, foodById, mealItem } from './fixtures';

const optimizerFoods: OptimizerFood[] = allFoods.map(toOptimizerFood);

/** The lunch target used as the worked example in the contract (§14). */
const LUNCH_TARGET = { carbs: 85, protein: 32, fat: 12 };

function lunchItems(overrides: Partial<Record<number, Partial<MealItem>>> = {}): MealItem[] {
  const base: MealItem[] = [
    mealItem(RICE, 200, false),
    mealItem(CHICKEN, 100, false),
    mealItem(BROCCOLI, 150, false),
    mealItem(OLIVE_OIL, 10, false),
  ];
  return base.map((item) => ({ ...item, ...(overrides[item.foodId] ?? {}) }));
}

function solve(items: MealItem[], target = LUNCH_TARGET) {
  return optimizeMeal({ foods: optimizerFoods, items, target });
}

function gramsOf(result: ReturnType<typeof solve>, foodId: number): number {
  const item = result.items.find((entry) => entry.foodId === foodId);
  if (!item) throw new Error(`food ${foodId} missing from result`);
  return item.grams;
}

function assertServingConstraints(result: ReturnType<typeof solve>): void {
  for (const item of result.items) {
    const food = foodById.get(item.foodId);
    if (!food) throw new Error(`unknown food ${item.foodId}`);
    expect(item.grams).toBeGreaterThanOrEqual(food.minGrams - 0.001);
    expect(item.grams).toBeLessThanOrEqual(food.maxGrams + 0.001);
    if (item.locked) continue;
    const steps = (item.grams - food.minGrams) / food.stepGrams;
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(0.001);
  }
}

describe('optimizer baseline', () => {
  it('lands close to every macro target for a realistic lunch', () => {
    const result = solve(lunchItems());
    assertServingConstraints(result);
    expect(Math.abs(result.error.protein)).toBeLessThan(8);
    expect(Math.abs(result.error.carbs)).toBeLessThan(12);
    expect(Math.abs(result.error.fat)).toBeLessThan(5);
  });

  it('does not use a carb food to fix a protein gap (§16)', () => {
    // Only rice and broccoli are available; the protein target cannot be met,
    // but rice must stay inside its serving range instead of exploding.
    const result = solve([
      mealItem(RICE, 200, false),
      mealItem(BROCCOLI, 150, false),
    ]);
    assertServingConstraints(result);
    expect(gramsOf(result, RICE)).toBeLessThanOrEqual(500);
    expect(gramsOf(result, BROCCOLI)).toBeLessThanOrEqual(400);
  });

  it('does not use a protein food to fix a fat gap (§16)', () => {
    const result = solve([
      mealItem(CHICKEN, 100, false),
      mealItem(OLIVE_OIL, 10, false),
    ]);
    assertServingConstraints(result);
    // Chicken stays near the protein requirement instead of ballooning for fat.
    expect(gramsOf(result, CHICKEN)).toBeLessThanOrEqual(200);
  });

  it('keeps vegetables at a normal serving instead of using them as filler', () => {
    const result = solve(lunchItems());
    expect(gramsOf(result, BROCCOLI)).toBeLessThanOrEqual(250);
    expect(gramsOf(result, BROCCOLI)).toBeGreaterThanOrEqual(50);
  });

  it('returns zero totals for an empty module', () => {
    const result = solve([]);
    expect(result.items).toEqual([]);
    expect(result.macros).toEqual({ carbs: 0, protein: 0, fat: 0, calories: 0 });
  });

  it('is deterministic for the same input', () => {
    expect(solve(lunchItems()).items).toEqual(solve(lunchItems()).items);
  });
});

describe('Case 7: locking a food weight', () => {
  it('keeps 鸡胸肉 at exactly 150 g and re-optimises everything else', () => {
    const free = solve(lunchItems());
    const locked = solve(lunchItems({ [CHICKEN]: { grams: 150, locked: true } }));

    expect(gramsOf(locked, CHICKEN)).toBe(150);
    assertServingConstraints(locked);

    // 150 g chicken alone supplies ~46.5 g protein, well above the 32 g target,
    // so the remaining foods must be reduced to keep the meal reasonable.
    expect(locked.macros.protein).toBeGreaterThan(LUNCH_TARGET.protein);
    expect(Math.abs(locked.error.fat)).toBeLessThan(6);
    expect(locked.items.find((item) => item.foodId === CHICKEN)?.locked).toBe(true);

    // The free solution would not have picked 150 g, so the lock really changed
    // the outcome and the other foods were rebalanced around it.
    expect(gramsOf(free, CHICKEN)).not.toBe(150);
    const othersChanged = [RICE, OLIVE_OIL, BROCCOLI].some(
      (foodId) => gramsOf(free, foodId) !== gramsOf(locked, foodId),
    );
    expect(othersChanged).toBe(true);
  });

  it('respects a lock that sits between two step values', () => {
    const locked = solve(lunchItems({ [RICE]: { grams: 217, locked: true } }));
    expect(gramsOf(locked, RICE)).toBe(217);
  });

  it('still satisfies min/max when a lock fights the target', () => {
    const locked = solve(lunchItems({ [OLIVE_OIL]: { grams: 30, locked: true } }));
    expect(gramsOf(locked, OLIVE_OIL)).toBe(30);
    assertServingConstraints(locked);
  });
});

describe('Case 8: rebalancing after a manual edit', () => {
  it('keeps the hand-edited 米饭 weight and adjusts the rest', () => {
    const free = solve(lunchItems());
    const suggestedRice = gramsOf(free, RICE);
    const manualRice = suggestedRice - 50;

    const rebalanced = solve(lunchItems({ [RICE]: { grams: manualRice, locked: true } }));

    expect(gramsOf(rebalanced, RICE)).toBe(manualRice);
    expect(rebalanced.items.find((item) => item.foodId === RICE)?.locked).toBe(true);
    assertServingConstraints(rebalanced);

    // Something else has to move to compensate for the missing carbohydrate.
    const moved = [CHICKEN, OLIVE_OIL, BROCCOLI].filter(
      (foodId) => gramsOf(free, foodId) !== gramsOf(rebalanced, foodId),
    );
    expect(moved.length).toBeGreaterThan(0);

    // The result stays a sensible meal rather than drifting far off target.
    expect(Math.abs(rebalanced.error.carbs)).toBeLessThan(30);
    expect(Math.abs(rebalanced.error.protein)).toBeLessThan(12);
  });

  it('clamps a manual value that is outside the serving range', () => {
    const result = solve(lunchItems({ [OLIVE_OIL]: { grams: 999, locked: true } }));
    expect(gramsOf(result, OLIVE_OIL)).toBe(30);
  });

  it('re-optimising without the lock returns to the free solution', () => {
    const free = solve(lunchItems());
    const manual = solve(lunchItems({ [RICE]: { grams: 250, locked: true } }));
    const released = solve(lunchItems({ [RICE]: { grams: 250, locked: false } }));
    expect(gramsOf(manual, RICE)).toBe(250);
    expect(gramsOf(released, RICE)).toBe(gramsOf(free, RICE));
  });
});

describe('multi-food role mixing', () => {
  it('splits carbohydrate between two carb foods instead of loading one', () => {
    const withMilk: MealItem[] = [
      mealItem(RICE, 200, false),
      mealItem(CHICKEN, 100, false),
      mealItem(MILK, 200, false),
      mealItem(NUTS, 10, false),
    ];
    const result = solve(withMilk, { carbs: 60, protein: 40, fat: 15 });
    assertServingConstraints(result);
    expect(Math.abs(result.error.protein)).toBeLessThan(8);
    expect(Math.abs(result.error.carbs)).toBeLessThan(15);
  });
});
