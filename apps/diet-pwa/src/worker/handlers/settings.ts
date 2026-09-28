import type { SettingsInput } from '../../shared/types';
import { getSettings, saveSettings } from '../db';
import type { Ctx } from '../env';
import { booleanValue, finiteNumber, json, oneOf, readJson } from '../http';

const WEIGHT = { min: 20, max: 400 } as const;
const CALORIES = { min: 500, max: 8000 } as const;
const MEALS = ['breakfast', 'lunch', 'dinner'] as const;

export function parseSettingsInput(value: unknown): SettingsInput {
  const body = value as Record<string, unknown>;
  return {
    currentWeightKg: finiteNumber(body.currentWeightKg, 'currentWeightKg', WEIGHT),
    baseWeightKg: finiteNumber(body.baseWeightKg, 'baseWeightKg', WEIGHT),
    baseCalories: finiteNumber(body.baseCalories, 'baseCalories', CALORIES),
    defaultCalories: finiteNumber(body.defaultCalories, 'defaultCalories', CALORIES),
    defaultTrainingDay: booleanValue(body.defaultTrainingDay, true),
    defaultTrainingAfterMeal: oneOf(body.defaultTrainingAfterMeal, MEALS, 'defaultTrainingAfterMeal'),
  };
}

export async function getSettingsHandler(ctx: Ctx): Promise<Response> {
  return json({ settings: await getSettings(ctx.db) });
}

export async function updateSettingsHandler(ctx: Ctx): Promise<Response> {
  const input = parseSettingsInput(await readJson<unknown>(ctx.request));
  return json({ settings: await saveSettings(ctx.db, input) });
}
