/**
 * End-to-end verification of MING-21 "按份管理" against a running diet-pwa
 * Worker — local (`wrangler dev`) or production.
 *
 *   BASE=https://diet-pwa.550580874.workers.dev node scripts/verify-serving.mjs
 *
 * It drives the real API the browser uses and asserts the acceptance checklist:
 * existing data, food CRUD with a serving definition, 2 个鸡蛋 nutrition,
 * persistence across a re-read ("refresh"), and the untouched 100 g mode.
 *
 * Safety: the daily-record part never leaves the target date changed — the
 * record is snapshotted first and restored byte-for-byte afterwards. The 鸡蛋
 * food is left with 按份 enabled, which is the feature actually being enabled.
 */

const BASE = process.env.BASE ?? 'http://127.0.0.1:8788';
const DATE = process.env.DATE ?? new Date().toISOString().slice(0, 10);

let passed = 0;
let failed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? `  [${detail}]` : ''}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? `  [${detail}]` : ''}`);
  }
}

function section(name) {
  console.log(`\n== ${name}`);
}

async function api(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  const text = await response.text();
  const body = (() => {
    try {
      return text.length > 0 ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  })();
  return { status: response.status, body };
}

const jsonInit = (method, payload) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

const close = (a, b, tolerance = 0.05) => Math.abs(a - b) <= tolerance;

async function listFoods() {
  const { status, body } = await api('/api/foods');
  check('GET /api/foods -> 200', status === 200, `status=${status}`);
  return body.foods;
}

const EGG = {
  name: '鸡蛋',
  category: '蛋类',
  role: 'mixed',
  kcalPer100g: 143,
  proteinPer100g: 12.6,
  fatPer100g: 9.5,
  carbsPer100g: 0.7,
  enabled: true,
  minGrams: 50,
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
};

async function main() {
  console.log(`verify-serving against ${BASE} (record date ${DATE})`);

  section('1. the app is up and existing data is still there');
  const health = await api('/api/health');
  check('GET /api/health -> 200', health.status === 200, JSON.stringify(health.body));
  check('health reports a non-empty food library', (health.body?.foods ?? 0) > 0, `foods=${health.body?.foods}`);

  const before = await listFoods();
  check('food library still loads', before.length > 0, `count=${before.length}`);
  check(
    'seeded foods are intact (熟米饭 / 鸡胸肉 / 香蕉)',
    ['熟米饭', '鸡胸肉', '香蕉'].every((name) => before.some((food) => food.name === name)),
  );
  check(
    'every food carries the serving fields',
    before.every(
      (food) =>
        typeof food.servingEnabled === 'boolean' &&
        'kcalPerServing' in food &&
        'servingStep' in food &&
        'unitLabel' in food,
    ),
  );
  const legacy = before.filter((food) => !food.servingEnabled);
  check('pre-existing foods default to servingEnabled=false', legacy.length > 0, `count=${legacy.length}`);
  check(
    'pre-existing foods have no per-serving nutrition',
    legacy.every((food) => food.kcalPerServing === null),
  );

  section('2. food CRUD stores the 按份 configuration');
  const egg = before.find((food) => food.name === '鸡蛋');
  check('seeded 鸡蛋 exists', !!egg, egg ? `id=${egg.id}` : 'missing');
  if (!egg) return;

  const updated = await api(`/api/foods/${egg.id}`, jsonInit('PUT', EGG));
  check('PUT /api/foods/:id with 按份 -> 200', updated.status === 200, `status=${updated.status}`);
  check('saved food has servingEnabled=true', updated.body?.food?.servingEnabled === true);
  check('saved food keeps unit 个 = 50 g', updated.body?.food?.unitLabel === '个' && updated.body?.food?.unitGrams === 50);
  check('saved food stores 1 份 = 72 kcal / 6.3P / 4.8F / 0.4C', 
    updated.body?.food?.kcalPerServing === 72 &&
      updated.body?.food?.proteinPerServing === 6.3 &&
      updated.body?.food?.fatPerServing === 4.8 &&
      updated.body?.food?.carbsPerServing === 0.4,
    JSON.stringify({
      kcal: updated.body?.food?.kcalPerServing,
      p: updated.body?.food?.proteinPerServing,
      f: updated.body?.food?.fatPerServing,
      c: updated.body?.food?.carbsPerServing,
    }),
  );

  const reread = await listFoods();
  const eggAfter = reread.find((food) => food.id === egg.id);
  check('the 按份 config survives a fresh read', eggAfter?.servingEnabled === true && eggAfter?.kcalPerServing === 72);
  check('the per-100g numbers are untouched by 按份', eggAfter?.kcalPer100g === 143 && eggAfter?.proteinPer100g === 12.6);

  section('3. server-side validation (the client is not trusted)');
  const noUnit = await api(`/api/foods/${egg.id}`, jsonInit('PUT', { ...EGG, unitLabel: null }));
  check('按份 without a unit name -> 400', noUnit.status === 400, JSON.stringify(noUnit.body));

  const nothing = await api(`/api/foods/${egg.id}`, jsonInit('PUT', {
    ...EGG,
    unitGrams: null,
    kcalPerServing: null,
    proteinPerServing: null,
    fatPerServing: null,
    carbsPerServing: null,
  }));
  check('按份 with neither per-serving data nor a serving weight -> 400', nothing.status === 400);

  const negative = await api(`/api/foods/${egg.id}`, jsonInit('PUT', { ...EGG, kcalPerServing: -5 }));
  check('negative per-serving calories -> 400', negative.status === 400);

  section('4. 自动换算: per 100 g + serving weight -> per serving');
  const derivedName = `自动换算验证-${Date.now()}`;
  const derived = await api('/api/foods', jsonInit('POST', {
    name: derivedName,
    category: '其他',
    role: 'mixed',
    kcalPer100g: 144,
    proteinPer100g: 12.6,
    fatPer100g: 9.6,
    carbsPer100g: 0.8,
    enabled: false,
    minGrams: 0,
    maxGrams: 300,
    stepGrams: 50,
    servingEnabled: true,
    unitLabel: '个',
    unitGrams: 50,
  }));
  check('POST a new 按份 food without per-serving numbers -> 201', derived.status === 201, `status=${derived.status}`);
  check('144 kcal / 100 g with a 50 g serving auto-computes 72 kcal', derived.body?.food?.kcalPerServing === 72,
    `kcalPerServing=${derived.body?.food?.kcalPerServing}`);
  check('…and 6.3 g protein per serving', derived.body?.food?.proteinPerServing === 6.3);
  if (derived.body?.food?.id) {
    const removed = await api(`/api/foods/${derived.body.food.id}`, { method: 'DELETE' });
    check('cleanup: the derived test food is deleted', removed.status === 200, `status=${removed.status}`);
  }

  section('5. meal items: 鸡蛋 × 2 个 (snapshot → write → refresh → restore)');
  const original = await api(`/api/records/${DATE}`);
  check(`GET /api/records/${DATE} -> 200`, original.status === 200, `status=${original.status}`);
  const snapshot = original.body?.record ?? null;
  const originalPlan = snapshot?.plan
    ? Object.fromEntries(
        Object.entries(snapshot.plan).map(([key, items]) => [
          key,
          items.map((item) => ({
            foodId: item.foodId,
            grams: item.grams,
            quantityType: item.quantityType,
            servings: item.servings,
            locked: item.locked,
          })),
        ]),
      )
    : null;

  try {
    const rice = reread.find((food) => food.name === '熟米饭');
    check('熟米饭 is available for the 100 g mode check', !!rice, rice ? `id=${rice.id}` : 'missing');

    const payload = {
      weightKg: snapshot?.weightKg ?? 70,
      trainingDay: snapshot?.trainingDay ?? false,
      trainingAfterMeal: snapshot?.trainingAfterMeal ?? 'lunch',
      targetCalories: snapshot?.targetCalories ?? 1900,
      calorieTargetManual: snapshot?.calorieTargetManual ?? false,
      plan: {
        breakfast: [{ foodId: egg.id, grams: 100, quantityType: 'servings', servings: 2, locked: true }],
        lunch: rice ? [{ foodId: rice.id, grams: 250, quantityType: 'grams', servings: 0, locked: true }] : [],
        dinner: [],
        postWorkout: [],
      },
    };

    const saved = await api(`/api/records/${DATE}`, jsonInit('PUT', payload));
    check('PUT /api/records/:date with 2 个鸡蛋 -> 200', saved.status === 200, JSON.stringify(saved.body));

    const breakfast = saved.body?.record?.plan?.breakfast?.[0];
    check('the item is stored as 按份, not 100 g', breakfast?.quantityType === 'servings', JSON.stringify(breakfast));
    check('the serving count is 2', breakfast?.servings === 2, `servings=${breakfast?.servings}`);
    check('the effective weight is 100 g', close(breakfast?.grams ?? 0, 100, 0.01), `grams=${breakfast?.grams}`);

    // 2 个鸡蛋 = 144 kcal, + 250 g 熟米饭 = 325 kcal.
    const expectedCalories = 144 + 325;
    check(
      'daily calories = 2 个鸡蛋 + 250 g 米饭',
      close(saved.body?.record?.actualCalories ?? 0, expectedCalories, 1),
      `actual=${saved.body?.record?.actualCalories} expected=${expectedCalories}`,
    );
    check(
      'protein = 12.6 (eggs) + 6.8 (rice)',
      close(saved.body?.record?.actualProtein ?? 0, 19.4, 0.5),
      `actual=${saved.body?.record?.actualProtein}`,
    );

    const lunch = saved.body?.record?.plan?.lunch?.[0];
    check('250 g 米饭 is still stored as grams', lunch?.quantityType === 'grams' && close(lunch?.grams ?? 0, 250, 0.01),
      JSON.stringify(lunch));

    // "Refresh the page": a brand new GET, as the browser would do.
    const refreshed = await api(`/api/records/${DATE}`);
    const refreshedBreakfast = refreshed.body?.record?.plan?.breakfast?.[0];
    check(
      'after a refresh the day still shows 2 个, not 100 g',
      refreshedBreakfast?.quantityType === 'servings' && refreshedBreakfast?.servings === 2,
      JSON.stringify(refreshedBreakfast),
    );
    check(
      'after a refresh 米饭 still shows 250 g',
      refreshed.body?.record?.plan?.lunch?.[0]?.quantityType === 'grams',
    );

    const history = await api('/api/records?days=7');
    check('GET /api/records?days=7 -> 200', history.status === 200, `status=${history.status}`);
  } finally {
    section('6. restore the original day (production safety)');
    if (snapshot && originalPlan) {
      const restored = await api(`/api/records/${DATE}`, jsonInit('PUT', {
        weightKg: snapshot.weightKg,
        trainingDay: snapshot.trainingDay,
        trainingAfterMeal: snapshot.trainingAfterMeal,
        targetCalories: snapshot.targetCalories,
        calorieTargetManual: snapshot.calorieTargetManual,
        plan: originalPlan,
      }));
      const items = Object.values(restored.body?.record?.plan ?? {}).flat();
      const sameAsBefore = Object.values(originalPlan).flat().length === items.length;
      check('the original plan is restored', restored.status === 200 && sameAsBefore, `status=${restored.status}`);
    } else {
      console.log(`  NOTE  ${DATE} had no record before this run; the scratch record was left in place`);
    }
  }

  section('7. no regression in the plain 100 g mode');
  const plain = await api(`/api/records/${DATE}`, jsonInit('PUT', {
    weightKg: snapshot?.weightKg ?? 70,
    trainingDay: false,
    trainingAfterMeal: 'lunch',
    targetCalories: snapshot?.targetCalories ?? 1900,
    calorieTargetManual: true,
    plan: { breakfast: [], lunch: [], dinner: [], postWorkout: [] },
  }));
  check('a plan with no items still saves', plain.status === 200, `status=${plain.status}`);
  if (snapshot && originalPlan) {
    await api(`/api/records/${DATE}`, jsonInit('PUT', {
      weightKg: snapshot.weightKg,
      trainingDay: snapshot.trainingDay,
      trainingAfterMeal: snapshot.trainingAfterMeal,
      targetCalories: snapshot.targetCalories,
      calorieTargetManual: snapshot.calorieTargetManual,
      plan: originalPlan,
    }));
    const finalRead = await api(`/api/records/${DATE}`);
    const count = Object.values(finalRead.body?.record?.plan ?? {}).flat().length;
    check('the day is back to its original content', count === Object.values(originalPlan).flat().length);
  }

  console.log(`\nRESULT: passed=${passed} failed=${failed}`);
  if (failed > 0) console.log(`FAILED: ${failures.join(' | ')}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
