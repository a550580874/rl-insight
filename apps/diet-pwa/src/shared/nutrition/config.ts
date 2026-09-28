/**
 * Central nutrition configuration.
 *
 * Every tunable number that drives target calculation, meal allocation and the
 * optimizer lives here so that the behaviour can be changed in one place
 * instead of being scattered as magic numbers through the code base.
 *
 * The defaults follow the original product contract:
 *   - reference body weight 70 kg, reference base calories 1900 kcal
 *   - training day  : 3.0 g/kg carbs, 1.6 g/kg protein, 0.6 g/kg fat
 *   - rest day      : 160 g carbs at 70 kg (scaled by weight), 1.6 g/kg protein,
 *                     0.65 g/kg fat
 *   - carbs are concentrated in breakfast and lunch, dinner keeps ~20 g
 *   - the post-workout module (banana + protein powder) is part of the daily total
 */

import type { FoodRole, MacroTargets, MealKey } from '../types';

export const KCAL_PER_GRAM = {
  carbs: 4,
  protein: 4,
  fat: 9,
} as const;

/** Relative optimizer weights. Higher wins when two goals conflict. */
export interface PriorityWeights {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export interface RoleGuard {
  /** Max fraction of the module's carb target this food may contribute. */
  carbsShare: number;
  /** Max fraction of the module's protein target this food may contribute. */
  proteinShare: number;
  /** Max fraction of the module's fat target this food may contribute. */
  fatShare: number;
  /** How strongly the food is pulled back to its default serving. */
  anchorWeight: number;
  /** Relative influence of this role on macro fitting. */
  macroWeight: number;
}

export interface OptimizerConfig {
  /** Priority order from the contract: protein > carbs > fat > calories. */
  priorities: PriorityWeights;
  /** Denominator floor so tiny targets do not blow up the normalised error. */
  minErrorScale: MacroTargets & { calories: number };
  /** Weight of the role-guard penalty term relative to the macro term. */
  roleGuardWeight: number;
  /** Default serving used as the anchor for vegetable-style foods. */
  anchorGrams: number;
  /** Number of coordinate-descent sweeps. */
  maxSweeps: number;
  /** Improvement below this is treated as convergence. */
  convergenceEpsilon: number;
  /** Extra candidate offsets explored around the analytic optimum. */
  searchOffsets: readonly number[];
  roleGuards: Record<FoodRole, RoleGuard>;
}

export interface NutritionConfig {
  referenceWeightKg: number;
  baseCalories: number;
  /** Grams of macro per kg of body weight. */
  macroPerKg: {
    training: MacroTargets;
    rest: Omit<MacroTargets, 'carbs'> & { referenceCarbsGrams: number };
  };
  kcalPerGram: typeof KCAL_PER_GRAM;
  /** How the daily carb budget is spread over the three meals. */
  carbAllocation: {
    /** Dinner keeps roughly this much carbohydrate regardless of body weight. */
    dinnerCarbsGrams: number;
    /** Reference breakfast/lunch carb grams used to derive the split ratio. */
    referenceSplit: {
      training: { breakfast: number; lunch: number };
      rest: { breakfast: number; lunch: number };
    };
  };
  /** Protein / fat split across the three meals (excluding post-workout). */
  macroAllocation: {
    protein: Record<MealKey, number>;
    fat: Record<MealKey, number>;
  };
  postWorkout: {
    /** Default banana serving; the contract suggests a medium banana ~120 g. */
    bananaDefaultGrams: number;
    /** Default protein powder serving; nutrition values remain user editable. */
    proteinPowderDefaultGrams: number;
    /** Food names used to seed the post-workout module. */
    bananaName: string;
    proteinPowderName: string;
  };
  defaults: {
    weightKg: number;
    baseWeightKg: number;
    /** Fallback serving sizes by role when a food has no explicit default. */
    servingGramsByRole: Record<FoodRole, number>;
  };
  /** Warn when |macro energy - calorie target| exceeds this fraction. */
  calorieMismatchWarningRatio: number;
  optimizer: OptimizerConfig;
}

export const NUTRITION_CONFIG: NutritionConfig = {
  referenceWeightKg: 70,
  baseCalories: 1900,

  macroPerKg: {
    training: { carbs: 3.0, protein: 1.6, fat: 0.6 },
    rest: { protein: 1.6, fat: 0.65, referenceCarbsGrams: 160 },
  },

  kcalPerGram: KCAL_PER_GRAM,

  carbAllocation: {
    dinnerCarbsGrams: 20,
    referenceSplit: {
      // 70 kg training day: 210 total - 30 post-workout - 20 dinner = 160 -> 75 / 85
      training: { breakfast: 75, lunch: 85 },
      // 70 kg rest day: 160 total - 20 dinner = 140 -> 65 / 75
      rest: { breakfast: 65, lunch: 75 },
    },
  },

  macroAllocation: {
    protein: { breakfast: 0.3, lunch: 0.32, dinner: 0.38 },
    fat: { breakfast: 0.3, lunch: 0.3, dinner: 0.4 },
  },

  postWorkout: {
    bananaDefaultGrams: 120,
    proteinPowderDefaultGrams: 30,
    bananaName: '香蕉',
    proteinPowderName: '蛋白粉',
  },

  defaults: {
    weightKg: 70,
    baseWeightKg: 70,
    servingGramsByRole: {
      carb: 200,
      protein: 150,
      fat: 10,
      vegetable: 150,
      mixed: 100,
    },
  },

  calorieMismatchWarningRatio: 0.08,

  optimizer: {
    priorities: { protein: 4, carbs: 3, fat: 2, calories: 1 },
    minErrorScale: { carbs: 25, protein: 20, fat: 10, calories: 250 },
    roleGuardWeight: 12,
    anchorGrams: 150,
    maxSweeps: 60,
    convergenceEpsilon: 1e-6,
    searchOffsets: [-2, -1, 1, 2],
    roleGuards: {
      carb: { carbsShare: 1, proteinShare: 0.6, fatShare: 0.45, anchorWeight: 0, macroWeight: 1 },
      protein: { carbsShare: 0.35, proteinShare: 1, fatShare: 0.6, anchorWeight: 0, macroWeight: 1 },
      fat: { carbsShare: 0.25, proteinShare: 0.15, fatShare: 1, anchorWeight: 0, macroWeight: 1 },
      mixed: { carbsShare: 1, proteinShare: 1, fatShare: 1, anchorWeight: 0, macroWeight: 1 },
      vegetable: {
        carbsShare: 0.25,
        proteinShare: 0.25,
        fatShare: 0.25,
        anchorWeight: 1.2,
        macroWeight: 0.15,
      },
    },
  },
};

/** Convenience helper: energy contained in a macro split. */
export function macroCalories(macros: MacroTargets, config = NUTRITION_CONFIG): number {
  return (
    macros.carbs * config.kcalPerGram.carbs +
    macros.protein * config.kcalPerGram.protein +
    macros.fat * config.kcalPerGram.fat
  );
}
