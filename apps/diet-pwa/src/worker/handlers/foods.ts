import { FOOD_ROLES, type FoodInput } from '../../shared/types';
import { resolveServingNutrition } from '../../shared/nutrition/serving';
import { createFood, deleteFood, listFoods, updateFood } from '../db';
import type { Ctx } from '../env';
import { HttpError, booleanValue, finiteNumber, json, oneOf, optionalNumber, optionalString, readJson, requiredString } from '../http';

const LIMITS = {
  macro: { min: 0, max: 100 },
  calories: { min: 0, max: 1000 },
  grams: { min: 0, max: 5000 },
  step: { min: 1, max: 1000 },
  /** One serving: heavy enough for a 1 kg box, fine enough for 0.5 勺. */
  servingStep: { min: 0.25, max: 100 },
  perServingCalories: { min: 0, max: 20000 },
  perServingMacro: { min: 0, max: 2000 },
} as const;

export function parseFoodInput(value: unknown): FoodInput {
  const body = value as Record<string, unknown>;
  if (typeof body !== 'object' || body === null) {
    throw new HttpError(400, 'invalid_body', '食物数据格式不正确');
  }

  const minGrams = finiteNumber(body.minGrams ?? 0, 'minGrams', LIMITS.grams);
  const maxGrams = finiteNumber(body.maxGrams ?? 500, 'maxGrams', LIMITS.grams);
  if (maxGrams < minGrams) {
    throw new HttpError(400, 'invalid_field', 'maxGrams 不能小于 minGrams');
  }

  const name = requiredString(body.name, 'name', 40);
  const kcalPer100g = finiteNumber(body.kcalPer100g, 'kcalPer100g', LIMITS.calories);
  const proteinPer100g = finiteNumber(body.proteinPer100g, 'proteinPer100g', LIMITS.macro);
  const fatPer100g = finiteNumber(body.fatPer100g, 'fatPer100g', LIMITS.macro);
  const carbsPer100g = finiteNumber(body.carbsPer100g, 'carbsPer100g', LIMITS.macro);

  const servingEnabled = booleanValue(body.servingEnabled, false);
  const unitLabel = optionalString(body.unitLabel, 8);
  const unitGrams = optionalNumber(body.unitGrams, 'unitGrams', { min: 0.1, max: 5000 });

  if (servingEnabled && !unitLabel) {
    throw new HttpError(400, 'invalid_field', '启用按份时必须填写份单位（如 个 / 片 / 勺）');
  }

  const explicit = {
    kcalPerServing: optionalNumber(body.kcalPerServing, 'kcalPerServing', LIMITS.perServingCalories),
    proteinPerServing: optionalNumber(body.proteinPerServing, 'proteinPerServing', LIMITS.perServingMacro),
    fatPerServing: optionalNumber(body.fatPerServing, 'fatPerServing', LIMITS.perServingMacro),
    carbsPerServing: optionalNumber(body.carbsPerServing, 'carbsPerServing', LIMITS.perServingMacro),
  };

  // The per-serving numbers are resolved here, once, so the stored food carries
  // exactly one authoritative per-serving value (see shared/nutrition/serving.ts).
  const resolved = resolveServingNutrition({
    servingEnabled,
    unitGrams,
    kcalPer100g,
    proteinPer100g,
    fatPer100g,
    carbsPer100g,
    ...explicit,
  });

  if (servingEnabled && Object.values(resolved).every((macro) => macro === null)) {
    throw new HttpError(400, 'invalid_field', '启用按份时需要填写每份营养，或填写每份重量以便按每100g自动换算');
  }

  return {
    name,
    category: requiredString(body.category, 'category', 20),
    role: oneOf(body.role, FOOD_ROLES, 'role'),
    kcalPer100g,
    proteinPer100g,
    fatPer100g,
    carbsPer100g,
    enabled: booleanValue(body.enabled, true),
    minGrams,
    maxGrams,
    stepGrams: finiteNumber(body.stepGrams ?? 5, 'stepGrams', LIMITS.step),
    servingEnabled,
    unitLabel,
    unitGrams,
    ...resolved,
    servingStep: finiteNumber(body.servingStep ?? 1, 'servingStep', LIMITS.servingStep),
  };
}

export async function listFoodsHandler(ctx: Ctx): Promise<Response> {
  return json({ foods: await listFoods(ctx.db) });
}

export async function createFoodHandler(ctx: Ctx): Promise<Response> {
  const input = parseFoodInput(await readJson<unknown>(ctx.request));
  try {
    return json({ food: await createFood(ctx.db, input) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw new HttpError(409, 'duplicate_food', `食物「${input.name}」已存在`);
    }
    throw error;
  }
}

export async function updateFoodHandler(ctx: Ctx): Promise<Response> {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid_id', '食物 id 不正确');

  const input = parseFoodInput(await readJson<unknown>(ctx.request));
  try {
    const food = await updateFood(ctx.db, id, input);
    if (!food) throw new HttpError(404, 'not_found', '食物不存在');
    return json({ food });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw new HttpError(409, 'duplicate_food', `食物「${input.name}」已存在`);
    }
    throw error;
  }
}

export async function deleteFoodHandler(ctx: Ctx): Promise<Response> {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'invalid_id', '食物 id 不正确');
  await deleteFood(ctx.db, id);
  return json({ ok: true });
}
