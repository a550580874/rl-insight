/**
 * Browser-level acceptance for MING-21 "按份管理": the real mobile-sized UI,
 * driven end to end against a running diet-pwa Worker.
 *
 *   BASE=http://127.0.0.1:8788 node scripts/verify-serving-ui.mjs
 *
 * Verifies the checklist the API test cannot: 鸡蛋 shows up as 个 in the meal
 * card, 2 个 survives a real page reload, the 重量/份 switch works, and a plain
 * 100 g food (熟米饭) still behaves exactly as before.
 *
 * Safety: the day's record is snapshotted through the API first and restored
 * afterwards, so the check can be pointed at production.
 *
 * Requires `playwright-core` (not a project dependency) and a local Chrome:
 *   CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
 */

import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8788';
const CHROME_PATH = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
  return { status: response.status, body: text.length > 0 ? JSON.parse(text) : null };
}

const jsonInit = (method, payload) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

/** The meal card is the <section> that owns the module heading. */
function mealCard(page, title) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).last();
}

/**
 * Wait until the debounced autosave has actually landed in D1 (900 ms debounce,
 * so waiting on the UI text alone can race a still-pending write).
 */
async function waitForServer(describe, predicate) {
  const deadline = Date.now() + 20000;
  let last = null;
  while (Date.now() < deadline) {
    const { body } = await api(`/api/records/${DATE}`);
    last = body?.record?.plan ?? {};
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${describe}; server has ${JSON.stringify(last)}`);
}

const breakfastItems = (plan) => plan?.breakfast ?? [];
const lunchItems = (plan) => plan?.lunch ?? [];

/** The 鸡蛋 the acceptance flow uses, with 按份 enabled (idempotent). */
async function ensureEggServing() {
  const { body } = await api('/api/foods');
  const egg = (body?.foods ?? []).find((food) => food.name === '鸡蛋');
  if (!egg) throw new Error('the seeded 鸡蛋 food is missing');
  const saved = await api(`/api/foods/${egg.id}`, jsonInit('PUT', {
    name: egg.name,
    category: egg.category,
    role: egg.role,
    kcalPer100g: egg.kcalPer100g,
    proteinPer100g: egg.proteinPer100g,
    fatPer100g: egg.fatPer100g,
    carbsPer100g: egg.carbsPer100g,
    enabled: true,
    minGrams: egg.minGrams,
    maxGrams: egg.maxGrams,
    stepGrams: egg.stepGrams,
    servingEnabled: true,
    unitLabel: '个',
    unitGrams: 50,
    kcalPerServing: 72,
    proteinPerServing: 6.3,
    fatPerServing: 4.8,
    carbsPerServing: 0.4,
    servingStep: 1,
  }));
  if (saved.status !== 200) throw new Error(`could not enable 按份 on 鸡蛋: ${saved.status}`);
  return egg.id;
}

/** Start from an empty day so the run is repeatable (restored at the end). */
async function clearDay(snapshot) {
  const payload = {
    weightKg: snapshot?.weightKg ?? 70,
    trainingDay: snapshot?.trainingDay ?? false,
    trainingAfterMeal: snapshot?.trainingAfterMeal ?? 'lunch',
    targetCalories: snapshot?.targetCalories ?? 1900,
    calorieTargetManual: snapshot?.calorieTargetManual ?? false,
    plan: { breakfast: [], lunch: [], dinner: [], postWorkout: [] },
  };
  const { status } = await api(`/api/records/${DATE}`, jsonInit('PUT', payload));
  if (status !== 200) throw new Error(`could not reset ${DATE}: ${status}`);
}

async function addFood(page, moduleKey, heading, foodName) {
  const card = mealCard(page, heading);
  await card.getByRole('button', { name: '+ 选择食物' }).click();
  // The picker sheet title uses the raw module key (选择食物 · breakfast).
  const sheet = page.locator('div.fixed').filter({ hasText: `选择食物 · ${moduleKey}` });
  await sheet.getByPlaceholder('搜索食物名称或分类').fill(foodName);
  await sheet.getByRole('button', { name: new RegExp(foodName) }).first().click();
  return card;
}

function itemRow(card, foodName) {
  return card.locator('li').filter({ hasText: foodName }).first();
}

async function main() {
  console.log(`verify-serving-ui against ${BASE} (record date ${DATE})`);

  const original = await api(`/api/records/${DATE}`);
  const snapshot = original.body?.record ?? null;
  const originalPlan = snapshot
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

  const eggId = await ensureEggServing();
  console.log(`  鸡蛋 (id=${eggId}) has 按份 enabled`);
  await clearDay(snapshot);

  const browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    section('1. 首页 opens and the existing UI still renders');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    check('the home page renders 早餐 / 午餐 / 晚餐', await page.getByRole('heading', { name: '早餐' }).isVisible());
    check('the daily progress card is there', await page.getByText('宏量目标').first().isVisible());
    check(
      'the bottom navigation still renders',
      await page.getByRole('button', { name: /食物/ }).first().isVisible(),
    );

    section('2. 新增 鸡蛋 到早餐 — it starts at 1 个');
    const breakfast = await addFood(page, 'breakfast', '早餐', '鸡蛋');
    await waitForServer('鸡蛋 to be stored as 1 份', (plan) => breakfastItems(plan)[0]?.servings === 1);
    check(
      'D1 stores the item as 按份 (not a made-up gram amount)',
      (await api(`/api/records/${DATE}`)).body?.record?.plan?.breakfast?.[0]?.quantityType === 'servings',
    );
    const eggRow = itemRow(breakfast, '鸡蛋');
    let text = await eggRow.innerText();
    check('the breakfast row shows 鸡蛋', /鸡蛋/.test(text), text.replace(/\s+/g, ' '));
    check('the row offers the 重量 / 份 switch', /重量/.test(text) && /份/.test(text));
    check('the amount is shown in 个, not grams', /1个/.test(text.replace(/\s/g, '')), text.replace(/\s+/g, ' '));
    check('1 个 = 72 kcal', /72 kcal/.test(text), text.replace(/\s+/g, ' '));

    section('3. 2 个 via the + button (鸡蛋 × 2)');
    await eggRow.getByRole('button', { name: '增加' }).click();
    const stored = await waitForServer('2 个鸡蛋 to be saved', (plan) => breakfastItems(plan)[0]?.servings === 2);
    check(
      'D1 keeps servings=2 with the effective weight 100 g',
      stored.breakfast[0].servings === 2 && stored.breakfast[0].grams === 100,
      JSON.stringify(stored.breakfast[0]),
    );
    text = await itemRow(breakfast, '鸡蛋').innerText();
    check('the row shows 2 个', /2个/.test(text.replace(/\s/g, '')), text.replace(/\s+/g, ' '));
    check('2 个 = 144 kcal', /144 kcal/.test(text), text.replace(/\s+/g, ' '));
    check(
      'the macros double to 12.6P / 9.6F / 0.8C',
      /12\.6P/.test(text) && /9\.6F/.test(text) && /0\.8C/.test(text),
      text.replace(/\s+/g, ' '),
    );

    section('4. refresh the browser — 2 个 is still there');
    await page.reload({ waitUntil: 'networkidle' });
    const afterReload = itemRow(mealCard(page, '早餐'), '鸡蛋');
    text = await afterReload.innerText();
    check('after F5 the row still shows 2 个', /2个/.test(text.replace(/\s/g, '')), text.replace(/\s+/g, ' '));
    check('after F5 the calories are still 144 kcal', /144 kcal/.test(text), text.replace(/\s+/g, ' '));
    check(
      'the amount is still expressed in 个 (with the derived 100 g alongside)',
      /2个/.test(text.replace(/\s/g, '')) && /100g/.test(text.replace(/\s/g, '')),
      text.replace(/\s+/g, ' '),
    );

    section('5. switching this item back to 重量');
    await afterReload.getByRole('button', { name: '重量', exact: true }).click();
    await waitForServer('the 份 item to become grams', (plan) => breakfastItems(plan)[0]?.quantityType === 'grams');
    text = await itemRow(mealCard(page, '早餐'), '鸡蛋').innerText();
    check('the row is now a gram amount (100 g = 2 个)', /约 2个/.test(text.replace(/\s+/g, ' ')), text.replace(/\s+/g, ' '));
    // 100 g of 鸡蛋 is 143 kcal from the per-100g numbers; the 144 kcal of 2 个
    // comes from the per-serving values the user entered for the label.
    check('…and it reports 143 kcal from the per-100g numbers', /143 kcal/.test(text), text.replace(/\s+/g, ' '));

    section('6. switching back to 份 keeps the same amount');
    await itemRow(mealCard(page, '早餐'), '鸡蛋').getByRole('button', { name: '份', exact: true }).click();
    await waitForServer('the item to go back to 份', (plan) => breakfastItems(plan)[0]?.quantityType === 'servings');
    const restoredText = await itemRow(mealCard(page, '早餐'), '鸡蛋').innerText();
    check(
      'back on 份 the row shows 2 个 again',
      /2个/.test(restoredText.replace(/\s/g, '')),
      restoredText.replace(/\s+/g, ' '),
    );

    section('6b. the 食物 page form manages 按份');
    await page.getByRole('button', { name: /^食物$/ }).click();
    const eggCard = page.locator('section').filter({ hasText: '鸡蛋' }).first();
    await eggCard.getByRole('button', { name: '编辑' }).click();
    const form = page.locator('div.fixed').filter({ hasText: '按份管理' });
    check('the editor shows a 按份管理 block', await form.getByText('按份管理').first().isVisible());
    check('启用按份 is already on for 鸡蛋', await form.getByRole('checkbox', { name: '启用按份' }).isChecked());
    const unitInput = form.locator('input[placeholder="个 / 根 / 片 / 勺"]');
    check('份单位 keeps the custom unit 个', (await unitInput.inputValue()) === '个', await unitInput.inputValue());
    const servingRows = form.locator('label', { hasText: '每份热量 kcal' }).locator('input');
    check('每份热量 is 72 kcal', (await servingRows.inputValue()) === '72', await servingRows.inputValue());
    const weightRow = form.locator('label', { hasText: '每份重量 g（可选）' }).locator('input');
    check('每份重量 is 50 g', (await weightRow.inputValue()) === '50', await weightRow.inputValue());

    await form.getByRole('button', { name: '按每100g自动计算每份' }).click();
    check(
      '自动计算 turns 143 kcal / 100 g x 50 g into 71.5 kcal',
      (await servingRows.inputValue()) === '71.5',
      await servingRows.inputValue(),
    );

    // Unchecking 按份 falls back to the legacy display-only unit, unchecked-safe.
    await form.getByRole('checkbox', { name: '启用按份' }).uncheck();
    check('turning 按份 off reveals the legacy 显示单位 block', await form.getByText('显示单位（可选，底层仍按克计算）').isVisible());
    await form.getByRole('checkbox', { name: '启用按份' }).check();
    check('turning 按份 back on restores the 按份 fields', await form.getByText('份数步长').isVisible());

    await form.getByRole('button', { name: '取消' }).click();
    check('取消 closes the editor without saving', !(await form.isVisible()));

    section('7. a plain 100 g food is unaffected (熟米饭 250 g)');
    await page.getByRole('button', { name: /^首页$/ }).click();
    await page.getByRole('heading', { name: '早餐' }).waitFor();
    const lunch = await addFood(page, 'lunch', '午餐', '熟米饭');
    await waitForServer('熟米饭 to be stored as grams', (plan) => lunchItems(plan).length === 1);
    const riceRow = itemRow(lunch, '熟米饭');
    let riceText = await riceRow.innerText();
    check('米饭 has no 重量/份 switch (serving disabled)', !/重量/.test(riceText), riceText.replace(/\s+/g, ' '));
    check('米饭 is shown in grams', /g/.test(riceText), riceText.replace(/\s+/g, ' '));

    const gramsInput = riceRow.locator('input[type=number]');
    await gramsInput.fill('250');
    await gramsInput.blur();
    await waitForServer('250 g 米饭 to be saved', (plan) => lunchItems(plan)[0]?.grams === 250);
    riceText = await itemRow(lunch, '熟米饭').innerText();
    const riceInput = await itemRow(lunch, '熟米饭').locator('input[type=number]').inputValue();
    check('米饭 accepts 250 g', riceInput === '250', `input=${riceInput}`);
    check('250 g 米饭 = 325 kcal', /325 kcal/.test(riceText), riceText.replace(/\s+/g, ' '));

    section('8. the day total mixes both modes');
    const total = await page.locator('body').innerText();
    check('the daily total includes 144 + 325 = 469 kcal', /469/.test(total), 'expected 469 kcal in the day summary');
    check('no uncaught JS error on the page', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    section('9. the other tabs still work (no regression)');
    await page.getByRole('button', { name: /^历史$/ }).click();
    await page.getByRole('heading', { name: '历史记录' }).waitFor();
    // The list is fetched after mount, so wait for the row itself.
    await page.getByText(DATE).first().waitFor({ timeout: 15000 });
    const historyText = await page.locator('body').innerText();
    check('历史记录 lists the saved day', historyText.includes(DATE), DATE);
    check('历史记录 still shows the macro breakdown', /热量/.test(historyText) && /蛋白质/.test(historyText));

    await page.getByRole('button', { name: /^设置$/ }).click();
    await page.getByRole('heading', { name: '设置' }).waitFor();
    await page.getByText('新的一天默认是训练日').waitFor({ timeout: 15000 });
    check('设置 still renders the profile fields', await page.getByText('默认热量目标', { exact: true }).isVisible());
    check('设置 still renders the storage note', await page.getByText(/Cloudflare D1/).first().isVisible());

    await page.getByRole('button', { name: /^食物$/ }).click();
    await page.getByRole('heading', { name: '食物库' }).waitFor();
    await page.getByText('按份：1个 ≈ 50g').waitFor({ timeout: 15000 });
    const foodText = await page.locator('body').innerText();
    check('食物库 lists the whole food library', (foodText.match(/编辑/g) ?? []).length >= 20);
    check('食物库 shows the 按份 summary for 鸡蛋', /按份：1个 ≈ 50g/.test(foodText.replace(/\s+/g, ' ')));
    // Only 鸡蛋 has 按份 enabled, so exactly one 按份 summary line exists.
    check(
      'only 鸡蛋 is managed 按份 in the saved library',
      (foodText.match(/按份：/g) ?? []).length === 1,
      `按份 lines=${(foodText.match(/按份：/g) ?? []).length}`,
    );
    check('no uncaught JS error after visiting every tab', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  } finally {
    section('10. restore the original day (production safety)');
    if (snapshot && originalPlan) {
      const restored = await api(`/api/records/${DATE}`, jsonInit('PUT', {
        weightKg: snapshot.weightKg,
        trainingDay: snapshot.trainingDay,
        trainingAfterMeal: snapshot.trainingAfterMeal,
        targetCalories: snapshot.targetCalories,
        calorieTargetManual: snapshot.calorieTargetManual,
        plan: originalPlan,
      }));
      check('the original plan is restored', restored.status === 200, `status=${restored.status}`);
    } else {
      console.log(`  NOTE  ${DATE} had no record before this run; the scratch record was left in place`);
    }
    await context.close();
    await browser.close();
  }

  console.log(`\nRESULT: passed=${passed} failed=${failed}`);
  if (failed > 0) console.log(`FAILED: ${failures.join(' | ')}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
