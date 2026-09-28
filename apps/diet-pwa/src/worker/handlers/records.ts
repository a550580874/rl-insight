import { MODULE_KEYS, QUANTITY_TYPES, type Food, type MacroTotals, type MealItem, type MealPlan, type ModuleKey, type QuantityType, type TrainingAfterMeal } from '../../shared/types';
import { planMacros } from '../../shared/nutrition/mealPlan';
import { effectiveGrams, hasServingNutrition } from '../../shared/nutrition/serving';
import { computeDayTargets, startingCaloriesFor } from '../../shared/nutrition/targets';
import { getFoodsByIds, getRecord, getSettings, listRecords, saveRecord } from '../db';
import type { Ctx } from '../env';
import { HttpError, booleanValue, finiteNumber, isoDate, json, oneOf, readJson } from '../http';

const WEIGHT = { min: 20, max: 400 } as const;
const CALORIES = { min: 500, max: 8000 } as const;
const GRAMS = { min: 0, max: 5000 } as const;
const SERVINGS = { min: 0, max: 1000 } as const;
const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
const MAX_ITEMS_PER_MODULE = 30;

function zeroTotals(): MacroTotals {
  return { carbs: 0, protein: 0, fat: 0, calories: 0 };
}

/** Validate and normalise the meal plan sent by the client. */
export function parsePlan(value: unknown): MealPlan {
  const plan: MealPlan = { breakfast: [], lunch: [], dinner: [], postWorkout: [] };
  if (value === null || value === undefined) return plan;
  if (typeof value !== 'object') throw new HttpError(400, 'invalid_plan', 'plan 格式不正确');

  const source = value as Record<string, unknown>;
  for (const key of MODULE_KEYS as readonly ModuleKey[]) {
    const raw = source[key];
    if (raw === undefined || raw === null) continue;
    if (!Array.isArray(raw)) throw new HttpError(400, 'invalid_plan', `${key} 必须是数组`);
    if (raw.length > MAX_ITEMS_PER_MODULE) {
      throw new HttpError(400, 'invalid_plan', `每餐最多 ${MAX_ITEMS_PER_MODULE} 种食物`);
    }

    const seen = new Set<number>();
    const items: MealItem[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) throw new HttpError(400, 'invalid_plan', '餐次条目格式不正确');
      const item = entry as Record<string, unknown>;
      const foodId = finiteNumber(item.foodId, `${key}.foodId`, { min: 1, max: 1_000_000_000 });
      if (!Number.isInteger(foodId)) throw new HttpError(400, 'invalid_plan', 'foodId 必须是整数');
      if (seen.has(foodId)) throw new HttpError(400, 'invalid_plan', '同一餐中不能重复添加同一种食物');
      seen.add(foodId);
      // A payload without quantityType is a client written before 按份 existed
      // and is grams, which is also the column default.
      const quantityType: QuantityType =
        item.quantityType === undefined || item.quantityType === null
          ? 'grams'
          : oneOf(item.quantityType, QUANTITY_TYPES, `${key}.quantityType`);
      items.push({
        foodId,
        grams: finiteNumber(item.grams ?? 0, `${key}.grams`, GRAMS),
        quantityType,
        servings:
          quantityType === 'servings' ? finiteNumber(item.servings ?? 0, `${key}.servings`, SERVINGS) : 0,
        locked: booleanValue(item.locked, false),
      });
    }
    plan[key] = items;
  }
  return plan;
}

/**
 * Re-check every 按份 item against the food it points at and re-derive its
 * effective grams. The client is never trusted for either.
 */
export function resolvePlanQuantities(plan: MealPlan, foods: readonly Food[]): MealPlan {
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const resolved: MealPlan = { breakfast: [], lunch: [], dinner: [], postWorkout: [] };

  for (const key of MODULE_KEYS as readonly ModuleKey[]) {
    resolved[key] = plan[key].map((item) => {
      const food = foodById.get(item.foodId);
      if (!food) throw new HttpError(400, 'unknown_food', '计划中包含不存在的食物，请先刷新食物库');
      if (item.quantityType !== 'servings') return { ...item, servings: 0 };
      if (!hasServingNutrition(food)) {
        throw new HttpError(400, 'serving_not_supported', `食物「${food.name}」没有启用按份，请改用重量`);
      }
      if (item.servings <= 0) {
        throw new HttpError(400, 'invalid_plan', `「${food.name}」的份数必须大于 0`);
      }
      // grams stays the effective weight so the optimizer and the history keep
      // working; the user's original serving count is stored next to it.
      return { ...item, grams: effectiveGrams(food, item) };
    });
  }
  return resolved;
}

export async function getRecordHandler(ctx: Ctx): Promise<Response> {
  const date = isoDate(ctx.params.date);
  return json({ record: await getRecord(ctx.db, date) });
}

export async function listRecordsHandler(ctx: Ctx): Promise<Response> {
  const daysParam = ctx.url.searchParams.get('days');
  const from = ctx.url.searchParams.get('from');
  const to = ctx.url.searchParams.get('to');
  const limit = daysParam ? Number(daysParam) : 30;

  const records = await listRecords(ctx.db, {
    ...(from ? { from: isoDate(from, 'from') } : {}),
    ...(to ? { to: isoDate(to, 'to') } : {}),
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 366) : 30,
  });
  return json({ records });
}

export async function putRecordHandler(ctx: Ctx): Promise<Response> {
  const date = isoDate(ctx.params.date);
  const body = await readJson<Record<string, unknown>>(ctx.request);

  const weightKg = finiteNumber(body.weightKg, 'weightKg', WEIGHT);
  const trainingDay = booleanValue(body.trainingDay, true);
  const trainingAfterMeal: TrainingAfterMeal = oneOf(body.trainingAfterMeal ?? 'lunch', MEALS, 'trainingAfterMeal');
  const plan = parsePlan(body.plan);

  const foodIds = [...new Set(MODULE_KEYS.flatMap((key) => plan[key].map((item) => item.foodId)))];
  const foods = await getFoodsByIds(ctx.db, foodIds);
  if (foods.length !== foodIds.length) {
    throw new HttpError(400, 'unknown_food', '计划中包含不存在的食物，请先刷新食物库');
  }
  const quantities = resolvePlanQuantities(plan, foods);

  const postWorkout = trainingDay
    ? planMacros({ breakfast: [], lunch: [], dinner: [], postWorkout: quantities.postWorkout }, foods, true)
    : zeroTotals();

  // The client normally sends the day target it computed. When it does not
  // (API use, imports), fall back to the user's stored profile so the result
  // matches the settings page instead of the shipped 1900 kcal / 70 kg defaults.
  const targetCalories =
    body.targetCalories === undefined || body.targetCalories === null
      ? startingCaloriesFor(weightKg, await getSettings(ctx.db))
      : finiteNumber(body.targetCalories, 'targetCalories', CALORIES);

  const dayTargets = computeDayTargets({ weightKg, trainingDay, targetCalories, postWorkout });
  const actual = planMacros(quantities, foods, trainingDay);

  const saved = await saveRecord(ctx.db, {
    date,
    weightKg,
    trainingDay,
    trainingAfterMeal,
    targetCalories,
    calorieTargetManual: booleanValue(body.calorieTargetManual, false),
    targetCarbs: dayTargets.daily.carbs,
    targetProtein: dayTargets.daily.protein,
    targetFat: dayTargets.daily.fat,
    actualCalories: actual.calories,
    actualCarbs: actual.carbs,
    actualProtein: actual.protein,
    actualFat: actual.fat,
    plan: quantities,
  });

  return json({ record: saved });
}

export async function copyRecordHandler(ctx: Ctx): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(ctx.request);
  const from = isoDate(body.from, 'from');
  const to = isoDate(body.to, 'to');
  if (from === to) throw new HttpError(400, 'invalid_field', '来源和目标日期不能相同');

  const source = await getRecord(ctx.db, from);
  if (!source) throw new HttpError(404, 'not_found', `没有找到 ${from} 的记录`);

  const saved = await saveRecord(ctx.db, {
    date: to,
    weightKg: source.weightKg,
    trainingDay: source.trainingDay,
    trainingAfterMeal: source.trainingAfterMeal,
    targetCalories: source.targetCalories,
    calorieTargetManual: source.calorieTargetManual,
    targetCarbs: source.targetCarbs,
    targetProtein: source.targetProtein,
    targetFat: source.targetFat,
    actualCalories: source.actualCalories,
    actualCarbs: source.actualCarbs,
    actualProtein: source.actualProtein,
    actualFat: source.actualFat,
    plan: source.plan,
  });

  return json({ record: saved });
}
