/**
 * Meal weight optimizer.
 *
 * Given a meal's macro targets and the foods the user picked for that meal,
 * decide how many grams of each food to eat.
 *
 * Approach: constrained weighted least squares.
 *   - The objective is the weighted, scale-normalised squared error over
 *     carbs / protein / fat / calories, with the contract's priority order
 *     (protein > carbs > fat > calories) expressed as weights.
 *   - Each food is optimised one at a time along its own axis. Because the
 *     objective is quadratic in a single food's grams, the exact 1-D optimum
 *     has a closed form; we snap it to the food's step grid, clamp it to its
 *     min/max and compare it against a small neighbourhood of alternatives
 *     (see `searchOffsets`) using the *full* objective.
 *   - The full objective adds two penalty terms that keep the result realistic:
 *       * role guards: a `protein` food may not silently become the main carb
 *         source, a `fat` food may not become the main protein source, etc.
 *       * anchors: `vegetable` foods are pulled back to a normal serving so the
 *         optimizer does not "solve" a macro gap with a pile of broccoli.
 *   - Locked foods are removed from the search space and simply contribute a
 *     fixed amount, so "lock chicken at 150 g" and "rebalance after a manual
 *     edit" reduce to the same code path.
 *   - 按份 foods (see `serving.ts`) are treated the same way: the user's serving
 *     count is a decision, so the item contributes its exact per-serving macros
 *     and the remaining foods are rebalanced around it. A 按份 food therefore
 *     never has its grams silently rewritten, with or without a serving weight.
 */

import type { FoodRole, MacroTargets, MacroTotals, MealItem, QuantityType } from '../types';
import { KCAL_PER_GRAM, NUTRITION_CONFIG, type NutritionConfig, type OptimizerConfig } from './config';
import { effectiveGrams, calculateFoodNutrition, hasServingNutrition, type NutritionSource } from './serving';
import { round1, round2 } from './targets';

export interface OptimizerFood extends NutritionSource {
  id: number;
  name: string;
  role: FoodRole;
  minGrams: number;
  maxGrams: number;
  stepGrams: number;
}

export interface OptimizeRequest {
  foods: readonly OptimizerFood[];
  items: readonly MealItem[];
  target: MacroTargets;
  config?: NutritionConfig;
}

export interface OptimizeResult {
  items: MealItem[];
  macros: MacroTotals;
  target: MacroTotals;
  error: MacroTargets;
  objective: number;
  sweeps: number;
}

interface FoodVector {
  carbs: number;
  protein: number;
  fat: number;
  calories: number;
}

interface Variable {
  food: OptimizerFood;
  grams: number;
  /** The optimizer's own "do not search this" flag (user lock or 按份 item). */
  locked: boolean;
  /** The item as the user saved it, so the 按份 quantity round-trips unchanged. */
  origin: MealItem;
  /**
   * Exact nutrition for a 按份 item. Such an item is a fixed contribution: it has
   * no per-gram vector in the search, so the optimizer can neither inflate nor
   * shrink it. When the serving weight is known this is still derivable from
   * `grams`, but the per-serving numbers stay the single source of truth.
   */
  fixedMacros?: FoodVector;
}

/** Nutrition of one food at a given weight. */
export function foodMacrosAt(food: OptimizerFood, grams: number): FoodVector {
  const factor = grams / 100;
  return {
    carbs: round2(food.carbsPer100g * factor),
    protein: round2(food.proteinPer100g * factor),
    fat: round2(food.fatPer100g * factor),
    calories: round2(food.kcalPer100g * factor),
  };
}

/** Per-gram nutrient vector, used as the linear coefficient in the objective. */
function perGram(food: OptimizerFood): FoodVector {
  return {
    carbs: food.carbsPer100g / 100,
    protein: food.proteinPer100g / 100,
    fat: food.fatPer100g / 100,
    calories: food.kcalPer100g / 100,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Snap a weight onto the food's min + k * step grid. */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  const bounded = clamp(value, min, max);
  if (!Number.isFinite(step) || step <= 0) return round1(bounded);
  const steps = Math.round((bounded - min) / step);
  return round1(clamp(min + steps * step, min, max));
}

export function calorieTargetOf(target: MacroTargets): number {
  return target.carbs * KCAL_PER_GRAM.carbs + target.protein * KCAL_PER_GRAM.protein + target.fat * KCAL_PER_GRAM.fat;
}

function errorScales(target: MacroTargets, calories: number, cfg: OptimizerConfig) {
  return {
    carbs: Math.max(target.carbs, cfg.minErrorScale.carbs),
    protein: Math.max(target.protein, cfg.minErrorScale.protein),
    fat: Math.max(target.fat, cfg.minErrorScale.fat),
    calories: Math.max(calories, cfg.minErrorScale.calories),
  };
}

function sumVectors(vars: readonly Variable[]): FoodVector {
  const total: FoodVector = { carbs: 0, protein: 0, fat: 0, calories: 0 };
  for (const variable of vars) {
    const macros = variable.fixedMacros ?? foodMacrosAt(variable.food, variable.grams);
    total.carbs += macros.carbs;
    total.protein += macros.protein;
    total.fat += macros.fat;
    total.calories += macros.calories;
  }
  return total;
}

/** Normalised, weighted squared macro + calorie error. Lower is better. */
function macroObjective(actual: FoodVector, target: MacroTargets, calories: number, cfg: OptimizerConfig): number {
  const scale = errorScales(target, calories, cfg);
  const w = cfg.priorities;
  return (
    w.carbs * ((actual.carbs - target.carbs) / scale.carbs) ** 2 +
    w.protein * ((actual.protein - target.protein) / scale.protein) ** 2 +
    w.fat * ((actual.fat - target.fat) / scale.fat) ** 2 +
    w.calories * ((actual.calories - calories) / scale.calories) ** 2
  );
}

function shareExcess(value: number, target: number, cap: number): number {
  if (target <= 0 || cap >= 1) return 0;
  const share = value / target;
  const over = share - cap;
  return over > 0 ? over * over : 0;
}

/** Penalty for using a food outside of the role it was classified for. */
function guardPenalty(food: OptimizerFood, grams: number, target: MacroTargets, cfg: OptimizerConfig): number {
  const guard = cfg.roleGuards[food.role];
  const macros = foodMacrosAt(food, grams);
  const penalty =
    shareExcess(macros.carbs, target.carbs, guard.carbsShare) +
    shareExcess(macros.protein, target.protein, guard.proteinShare) +
    shareExcess(macros.fat, target.fat, guard.fatShare);
  return penalty * cfg.roleGuardWeight;
}

/** Pull vegetable-style foods back towards a normal serving. */
function anchorPenalty(food: OptimizerFood, grams: number, cfg: OptimizerConfig): number {
  const guard = cfg.roleGuards[food.role];
  if (guard.anchorWeight <= 0) return 0;
  const anchor = clamp(cfg.anchorGrams, food.minGrams, food.maxGrams);
  const scale = Math.max(anchor, 1);
  return guard.anchorWeight * ((grams - anchor) / scale) ** 2;
}

function anchorGramsFor(food: OptimizerFood, cfg: OptimizerConfig): number {
  return snapToStep(clamp(cfg.anchorGrams, food.minGrams, food.maxGrams), food.minGrams, food.maxGrams, food.stepGrams);
}

/** Total objective = macro fit + role guards + anchors. */
function objective(vars: readonly Variable[], target: MacroTargets, cfg: OptimizerConfig): number {
  const calories = calorieTargetOf(target);
  const totals = sumVectors(vars);
  let value = macroObjective(totals, target, calories, cfg);
  for (const variable of vars) {
    // A fixed contribution has no weight to judge, so no guard / anchor applies.
    if (variable.fixedMacros) continue;
    value += guardPenalty(variable.food, variable.grams, target, cfg);
    value += anchorPenalty(variable.food, variable.grams, cfg);
  }
  return value;
}

/**
 * Exact 1-D least squares optimum for one food, holding every other food fixed.
 *   g* = sum(w_n * a_n * r_n / s_n^2) / sum(w_n * a_n^2 / s_n^2)
 * with a_n the nutrient per gram, r_n the remaining gap and s_n the error scale.
 */
function analyticOptimum(variable: Variable, others: FoodVector, target: MacroTargets, cfg: OptimizerConfig): number {
  const calories = calorieTargetOf(target);
  const scale = errorScales(target, calories, cfg);
  const a = perGram(variable.food);
  const w = cfg.priorities;

  const terms: Array<[number, number, number]> = [
    [w.carbs, a.carbs, target.carbs - others.carbs],
    [w.protein, a.protein, target.protein - others.protein],
    [w.fat, a.fat, target.fat - others.fat],
    [w.calories, a.calories, calories - others.calories],
  ];
  const scales: number[] = [scale.carbs, scale.protein, scale.fat, scale.calories];

  let numerator = 0;
  let denominator = 0;
  terms.forEach(([weight, coefficient, residual], index) => {
    const s = scales[index] ?? 1;
    numerator += (weight * coefficient * residual) / (s * s);
    denominator += (weight * coefficient * coefficient) / (s * s);
  });

  if (denominator <= 0) return variable.grams;
  return numerator / denominator;
}

/** Role-aware starting point so the search begins close to a sane plan. */
function initialGrams(food: OptimizerFood, target: MacroTargets, cfg: NutritionConfig, roleCounts: Map<FoodRole, number>): number {
  const role = food.role;
  if (role === 'vegetable') return anchorGramsFor(food, cfg.optimizer);

  const roleCount = roleCounts.get(role) ?? 1;
  let estimate: number;

  if (role === 'carb' && food.carbsPer100g > 0) {
    estimate = (target.carbs * 100) / food.carbsPer100g / roleCount;
  } else if (role === 'protein' && food.proteinPer100g > 0) {
    estimate = (target.protein * 100) / food.proteinPer100g / roleCount;
  } else if (role === 'fat' && food.fatPer100g > 0) {
    estimate = (target.fat * 100) / food.fatPer100g / roleCount;
  } else {
    estimate = cfg.defaults.servingGramsByRole[role] ?? 100;
  }

  return snapToStep(clamp(estimate, food.minGrams, food.maxGrams), food.minGrams, food.maxGrams, food.stepGrams);
}

function buildCandidates(
  variable: Variable,
  others: FoodVector,
  target: MacroTargets,
  cfg: NutritionConfig,
): number[] {
  const { food } = variable;
  const optimizer = cfg.optimizer;
  const guard = optimizer.roleGuards[food.role];

  const raw = analyticOptimum(variable, others, target, optimizer);
  // Foods with a low macroWeight only move a fraction of the way towards the
  // analytic optimum; their anchor term then keeps them at a normal serving.
  const responsive = variable.grams + guard.macroWeight * (raw - variable.grams);

  const candidates = new Set<number>();
  const push = (value: number) => candidates.add(snapToStep(value, food.minGrams, food.maxGrams, food.stepGrams));

  push(variable.grams);
  push(responsive);
  push(raw);
  push(food.minGrams);
  push(food.maxGrams);
  if (guard.anchorWeight > 0) push(anchorGramsFor(food, optimizer));

  if (food.stepGrams > 0) {
    push(variable.grams + food.stepGrams);
    push(variable.grams - food.stepGrams);
    for (const offset of optimizer.searchOffsets) {
      push(responsive + offset * food.stepGrams);
    }
  }

  return [...candidates];
}

/**
 * Optimise one module (a meal, or the post-workout module).
 * Locked items keep their exact weight and everything else is rebalanced.
 */
export function optimizeMeal(request: OptimizeRequest): OptimizeResult {
  const cfg = request.config ?? NUTRITION_CONFIG;
  const optimizer = cfg.optimizer;
  const foodById = new Map(request.foods.map((food) => [food.id, food]));

  const roleCounts = new Map<FoodRole, number>();
  for (const item of request.items) {
    const food = foodById.get(item.foodId);
    if (!food) continue;
    roleCounts.set(food.role, (roleCounts.get(food.role) ?? 0) + 1);
  }

  const variables: Variable[] = [];
  for (const item of request.items) {
    const food = foodById.get(item.foodId);
    if (!food) continue;

    // 按份 items are a user decision (2 个鸡蛋), not a starting point: they are
    // folded into the totals as a fixed contribution and never enter the gram
    // search, so the optimizer rebalances the remaining foods around them.
    if (item.quantityType === 'servings' && hasServingNutrition(food)) {
      const macros = calculateFoodNutrition(food, item);
      variables.push({
        food,
        grams: effectiveGrams(food, item),
        locked: true,
        origin: item,
        fixedMacros: {
          carbs: round2(macros.carbs),
          protein: round2(macros.protein),
          fat: round2(macros.fat),
          calories: round2(macros.calories),
        },
      });
      continue;
    }

    const grams = item.locked
      ? round1(clamp(item.grams, food.minGrams, food.maxGrams))
      : initialGrams(food, request.target, cfg, roleCounts);
    variables.push({ food, grams, locked: item.locked, origin: item });
  }

  const free = variables.filter((variable) => !variable.locked && !variable.fixedMacros);
  let current = objective(variables, request.target, optimizer);
  let sweeps = 0;

  for (let sweep = 0; sweep < optimizer.maxSweeps; sweep += 1) {
    sweeps = sweep + 1;
    let improved = false;

    for (const variable of free) {
      const others = sumVectors(variables.filter((candidate) => candidate !== variable));
      const candidates = buildCandidates(variable, others, request.target, cfg);

      let bestGrams = variable.grams;
      let bestValue = current;
      for (const grams of candidates) {
        if (grams === variable.grams) continue;
        const previous = variable.grams;
        variable.grams = grams;
        const value = objective(variables, request.target, optimizer);
        if (value < bestValue - optimizer.convergenceEpsilon) {
          bestValue = value;
          bestGrams = grams;
        }
        variable.grams = previous;
      }

      if (bestGrams !== variable.grams) {
        variable.grams = bestGrams;
        current = bestValue;
        improved = true;
      }
    }

    if (!improved) break;
  }

  const totals = sumVectors(variables);
  const calories = calorieTargetOf(request.target);
  const macros: MacroTotals = {
    carbs: round1(totals.carbs),
    protein: round1(totals.protein),
    fat: round1(totals.fat),
    calories: round1(totals.calories),
  };

  return {
    items: variables.map((variable) => ({
      foodId: variable.food.id,
      grams: round1(variable.grams),
      quantityType: variable.origin.quantityType as QuantityType,
      servings: variable.origin.servings,
      // The user's own lock flag, not the optimizer's internal "do not search".
      locked: variable.origin.locked,
    })),
    macros,
    target: {
      carbs: request.target.carbs,
      protein: request.target.protein,
      fat: request.target.fat,
      calories: round1(calories),
    },
    error: {
      carbs: round1(macros.carbs - request.target.carbs),
      protein: round1(macros.protein - request.target.protein),
      fat: round1(macros.fat - request.target.fat),
    },
    objective: current,
    sweeps,
  };
}
