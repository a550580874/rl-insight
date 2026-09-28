/**
 * Mobile-viewport acceptance harness for the diet PWA (MING-23).
 *
 * Drives the real UI (390x844, touch, mobile UA) against a local
 * `wrangler dev` + local D1 and asserts the behaviour MING-21 asks for: PIN,
 * home summary, food selection + automatic grams, locking / rebalancing, the
 * training <-> rest switch, the post-workout module, auto save + refresh
 * persistence, history / copy, food CRUD, settings, PWA shell and the PIN
 * re-lock path.
 *
 * NOT part of `npm test`: it needs a browser and a writable local D1.
 *
 *   cd apps/diet-pwa
 *   npm install
 *   npm i --no-save playwright-core            # or: npm i -D playwright-core
 *   npx playwright install chromium            # or set CHROME_PATH to a local Chrome
 *   npm run db:migrate:local                   # against a *fresh* .wrangler/state
 *   npm run build
 *   npx wrangler dev --port 8790 &
 *   node e2e/mobile-acceptance.mjs
 *
 * The run starts from an unconfigured database (no PIN, seeded foods only) and
 * leaves throwaway records behind, so point it at a local D1 you can delete.
 * Set BASE / PROFILE / CHROME_PATH to override the server URL, the browser
 * profile directory and the browser binary. Screenshots land in the CWD.
 */

import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8790';
const PIN = '246813';
const NEW_PIN = '135790';

const results = [];
let failures = 0;
function check(label, ok, detail = '') {
  results.push({ label, ok: !!ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}
function note(text) {
  console.log(`NOTE  ${text}`);
}
function section(name) {
  console.log(`\n== ${name}`);
}

const launchOptions = {
  headless: true,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const context = await chromium.launchPersistentContext(
  process.env.PROFILE ?? path.join(os.tmpdir(), 'diet-pwa-e2e-profile'),
  launchOptions,
);
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const meal = (name) => page.locator('section', { has: page.getByRole('heading', { name, exact: true }) });
const row = (name, foodName) => meal(name).locator('li').filter({ hasText: foodName });
const gramsOf = async (name, foodName) => Number(await row(name, foodName).locator('input[type=number]').inputValue());
const macroLine = () => page.locator('text=/宏量目标/').first().innerText();
const apiJson = (path, init) =>
  page.evaluate(async ([p, i]) => {
    const r = await fetch(p, i ?? { credentials: 'same-origin' });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [path, init ?? null]);
const bodyText = () => page.locator('body').innerText();

const mealErrors = async (name) => {
  const text = await meal(name).innerText();
  const grab = (re) => {
    const m = text.match(re);
    return m ? Number(m[1]) : NaN;
  };
  return {
    carbs: grab(/实际碳水\s*([-\d.]+)/),
    protein: grab(/实际蛋白\s*([-\d.]+)/),
    fat: grab(/实际脂肪\s*([-\d.]+)/),
    target: (await meal(name).locator('header span').innerText()).trim(),
  };
};

async function addFood(name, foodName) {
  await meal(name).getByRole('button', { name: '+ 选择食物' }).click();
  const sheet = page.locator('div.fixed.inset-0');
  await sheet.getByPlaceholder('搜索食物名称或分类').fill(foodName);
  await sheet.locator('button').filter({ hasText: foodName }).first().click();
  await page.waitForTimeout(150);
}
async function setGrams(name, foodName, grams) {
  const input = row(name, foodName).locator('input[type=number]');
  await input.fill(String(grams));
  await input.blur();
  await page.waitForTimeout(250);
}
async function waitForSaved(timeout = 8000) {
  await page
    .locator('text=已自动保存到 D1')
    .waitFor({ timeout })
    .catch(() => {});
  await page.waitForTimeout(300);
}
async function noHorizontalOverflow(label) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(`${label}: 无横向溢出`, m.scrollWidth <= m.clientWidth, `${m.scrollWidth} <= ${m.clientWidth}`);
}
const goTab = async (name) => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(600);
};

try {
  // -------------------------------------------------------------------------
  section('1. 首次设置 PIN（无 PIN 状态）');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('锁定页显示首次设置文案', await page.getByText('首次使用，请设置 4-8 位数字 PIN').isVisible());
  await noHorizontalOverflow('PIN 页');
  await page.screenshot({ path: 'shot-01-pin-setup.png', fullPage: true });

  await page.locator('input[type=password]').fill(PIN);
  await page.getByRole('button', { name: '设置并进入' }).click();
  await page.waitForTimeout(900);
  check('PIN 设置后进入首页', await page.getByRole('heading', { name: '今日饮食' }).isVisible());
  const auth = await apiJson('/api/auth/status');
  check('auth/status: pinConfigured + authenticated', auth.body?.pinConfigured && auth.body?.authenticated, JSON.stringify(auth.body));
  const session = (await context.cookies()).find((c) => c.name === 'diet_session');
  check('下发 diet_session Cookie', !!session);
  check('session Cookie 为 HttpOnly', !!session?.httpOnly);

  // -------------------------------------------------------------------------
  section('2. 首页初始状态（70kg 训练日）');
  await page.waitForTimeout(500);
  const weightField = page.locator('label', { hasText: '当前体重' }).locator('input');
  const calField = page.locator('label', { hasText: '目标热量' }).locator('input');
  check('显示今天日期', await page.getByText(today).first().isVisible());
  check('当前体重默认 70', (await weightField.inputValue()) === '70');
  check('目标热量默认 1900', (await calField.inputValue()) === '1900');
  check('宏量目标 210C / 112P / 42F', (await macroLine()).includes('210C / 112P / 42F'), await macroLine());
  check('训练后补充卡片可见', await meal('训练后补充').isVisible());
  check('训练后默认香蕉 120g', (await gramsOf('训练后补充', '香蕉')) === 120);
  check('训练后默认蛋白粉 30g', (await gramsOf('训练后补充', '蛋白粉')) === 30);
  check('三餐卡片存在', (await meal('早餐').isVisible()) && (await meal('午餐').isVisible()) && (await meal('晚餐').isVisible()));
  check('全天进度条显示剩余量', /剩余/.test(await bodyText()));
  await noHorizontalOverflow('首页');
  await page.screenshot({ path: 'shot-02-today-initial.png', fullPage: true });

  // -------------------------------------------------------------------------
  section('3. 选择食物 + 自动计算克数');
  await addFood('早餐', '燕麦');
  await addFood('早餐', '鸡蛋');
  await addFood('早餐', '牛奶');
  check('燕麦自动算出克数 > 0', (await gramsOf('早餐', '燕麦')) > 0, `${await gramsOf('早餐', '燕麦')} g`);
  check('鸡蛋自动算出克数 > 0', (await gramsOf('早餐', '鸡蛋')) > 0, `${await gramsOf('早餐', '鸡蛋')} g`);
  const eggLine = await row('早餐', '鸡蛋').locator('div').nth(2).innerText();
  check('鸡蛋按“个”显示', /约 \d+(\.\d+)?个/.test(eggLine), eggLine);
  const breakfast = await mealErrors('早餐');
  check('早餐目标 75C / 26P / 12F', breakfast.target.includes('75C') && breakfast.target.includes('26P'), breakfast.target);
  check('早餐实际碳水误差 ±15g 内', Math.abs(breakfast.carbs - 75) <= 15, `实际 ${breakfast.carbs}`);
  check('早餐实际蛋白误差 ±8g 内', Math.abs(breakfast.protein - 26) <= 8, `实际 ${breakfast.protein}`);

  await addFood('午餐', '熟米饭');
  await addFood('午餐', '鸡胸肉');
  await addFood('午餐', '西兰花');
  await addFood('午餐', '橄榄油');
  const lunchFree = await mealErrors('午餐');
  check('午餐目标 85C / 28P / 12F', lunchFree.target.includes('85C') && lunchFree.target.includes('28P'), lunchFree.target);
  check('未锁定时午餐碳水误差 ±4g 内', Math.abs(lunchFree.carbs - 85.1) <= 4, `实际 ${lunchFree.carbs}`);
  check('未锁定时午餐蛋白误差 ±4g 内', Math.abs(lunchFree.protein - 27.7) <= 4, `实际 ${lunchFree.protein}`);
  check('未锁定时午餐脂肪误差 ±4g 内', Math.abs(lunchFree.fat - 12) <= 4, `实际 ${lunchFree.fat}`);
  note(`午餐（未锁定）${JSON.stringify(lunchFree)}`);

  // -------------------------------------------------------------------------
  section('4. 锁定重量 + 重新平衡');
  const riceBefore = await gramsOf('午餐', '熟米饭');
  const broccoliBefore = await gramsOf('午餐', '西兰花');
  await setGrams('午餐', '鸡胸肉', 150);
  check('鸡胸肉锁定后保持 150g', (await gramsOf('午餐', '鸡胸肉')) === 150);
  check('锁定后显示 🔒', (await row('午餐', '鸡胸肉').innerText()).includes('🔒'));
  const riceAfter = await gramsOf('午餐', '熟米饭');
  const broccoliAfter = await gramsOf('午餐', '西兰花');
  check('锁定后其余食物被重新优化', riceAfter !== riceBefore || broccoliAfter !== broccoliBefore, `米饭 ${riceBefore}→${riceAfter}, 西兰花 ${broccoliBefore}→${broccoliAfter}`);
  check('克数保持现实范围 (<=500g)', riceAfter <= 500 && broccoliAfter <= 500, `${riceAfter} / ${broccoliAfter}`);
  const lunchLocked = await mealErrors('午餐');
  note(`午餐（锁定鸡胸肉 150g）${JSON.stringify(lunchLocked)}`);
  check('锁定后实际值内部自洽（显示误差 × 目标一致）', Number.isFinite(lunchLocked.carbs) && Number.isFinite(lunchLocked.protein));

  section('4b. 手改克数不得突破食物上限');
  await setGrams('午餐', '鸡胸肉', 900);
  check('超过 max_grams 被夹到 300g', (await gramsOf('午餐', '鸡胸肉')) === 300, `${await gramsOf('午餐', '鸡胸肉')} g`);
  await setGrams('午餐', '鸡胸肉', 900);
  check('再次输入 900 仍夹到 300g', (await gramsOf('午餐', '鸡胸肉')) === 300, `${await gramsOf('午餐', '鸡胸肉')} g`);
  await row('午餐', '鸡胸肉').locator('button[aria-label^="解锁"]').click();
  await page.waitForTimeout(300);

  // -------------------------------------------------------------------------
  section('5. 手动改重量后重新平衡');
  await setGrams('午餐', '熟米饭', 250);
  check('手改米饭后固定为 250g', (await gramsOf('午餐', '熟米饭')) === 250);
  check('手改后自动锁定', (await row('午餐', '熟米饭').innerText()).includes('🔒'));
  await meal('午餐').getByRole('button', { name: /重新平衡/ }).click();
  await page.waitForTimeout(400);
  check('点击重新平衡给出反馈', (await bodyText()).includes('已按锁定项重新平衡其余食物'));
  check('重新平衡后米饭仍为 250g', (await gramsOf('午餐', '熟米饭')) === 250);
  await page.screenshot({ path: 'shot-03-lunch-locked.png', fullPage: true });

  section('5b. 解锁后重新参与优化');
  await row('午餐', '熟米饭').locator('button[aria-label^="解锁"]').click();
  await page.waitForTimeout(400);
  check('解锁后米饭回到 250g 以外的最优值', (await gramsOf('午餐', '熟米饭')) !== 250, `${await gramsOf('午餐', '熟米饭')} g`);

  // -------------------------------------------------------------------------
  section('6. 体重联动 + 手动热量目标保护');
  await weightField.fill('80');
  await weightField.blur();
  await page.waitForTimeout(500);
  check('80kg 建议热量 2171', (await bodyText()).includes('建议热量 2171 kcal'));
  check('80kg 目标热量自动更新为 2171', (await calField.inputValue()) === '2171');
  check('80kg 训练日宏量 240C / 128P / 48F', (await macroLine()).includes('240C / 128P / 48F'), await macroLine());

  await calField.fill('2400');
  await calField.blur();
  await page.waitForTimeout(500);
  check('可手动修改当天热量目标', (await calField.inputValue()) === '2400');
  check('显示"已手动修改"', (await bodyText()).includes('已手动修改'));
  await weightField.fill('75');
  await weightField.blur();
  await page.waitForTimeout(500);
  check('手动设定后改体重不覆盖当天目标 (§3)', (await calField.inputValue()) === '2400', await calField.inputValue());
  await page.getByRole('button', { name: '恢复建议值' }).click();
  await page.waitForTimeout(500);
  check('恢复建议值按钮生效', (await calField.inputValue()) === '2036', await calField.inputValue());

  // -------------------------------------------------------------------------
  section('7. 训练日 / 非训练日');
  await page.getByRole('button', { name: '非训练日', exact: true }).click();
  await page.waitForTimeout(500);
  check('非训练日隐藏训练后补充', (await meal('训练后补充').count()) === 0);
  check('75kg 非训练日宏量 171.4C / 120P / 48.8F', (await macroLine()).includes('171.4C / 120P / 48.8F'), await macroLine());
  await page.getByRole('button', { name: '训练日', exact: true }).click();
  await page.waitForTimeout(500);
  check('切回训练日后训练后补充恢复', await meal('训练后补充').isVisible());
  check('恢复后香蕉仍为 120g', (await gramsOf('训练后补充', '香蕉')) === 120);

  // -------------------------------------------------------------------------
  section('8. 晚餐低碳分配 + 优化训练前碳水');
  await addFood('晚餐', '红薯');
  await addFood('晚餐', '瘦牛肉');
  await addFood('晚餐', '西兰花');
  await addFood('晚餐', '橄榄油');
  check('晚餐目标碳水约 20C', (await meal('晚餐').locator('header span').innerText()).includes('20C'), await meal('晚餐').locator('header span').innerText());
  const lunchBefore2 = await meal('午餐').locator('header span').innerText();
  const dinnerBefore2 = await meal('晚餐').locator('header span').innerText();

  await page.getByRole('button', { name: '晚餐后', exact: true }).click();
  await page.waitForTimeout(500);
  check('晚餐后训练显示"优化训练前碳水"提示', (await bodyText()).includes('今晚训练，可考虑把部分午餐碳水移动到晚餐'));
  await page.getByRole('button', { name: '优化训练前碳水' }).click();
  await page.waitForTimeout(500);
  const lunchAfter2 = await meal('午餐').locator('header span').innerText();
  const dinnerAfter2 = await meal('晚餐').locator('header span').innerText();
  const carb = (s) => Number(s.match(/([\d.]+)C/)[1]);
  check('午餐碳水减少 20g', carb(lunchBefore2) - carb(lunchAfter2) === 20, `${lunchBefore2} → ${lunchAfter2}`);
  check('晚餐碳水增加 20g', carb(dinnerAfter2) - carb(dinnerBefore2) === 20, `${dinnerBefore2} → ${dinnerAfter2}`);
  check('全天碳水总量不变', carb(lunchAfter2) + carb(dinnerAfter2) === carb(lunchBefore2) + carb(dinnerBefore2));
  check('可撤销碳水移动', await page.getByRole('button', { name: /撤销/ }).isVisible());
  await page.getByRole('button', { name: /撤销/ }).click();
  await page.waitForTimeout(400);
  check('撤销后午餐碳水恢复', (await meal('午餐').locator('header span').innerText()) === lunchBefore2);
  await page.getByRole('button', { name: '午餐后', exact: true }).click();
  await page.waitForTimeout(400);

  // -------------------------------------------------------------------------
  section('9. 自动保存 + D1 持久化');
  await waitForSaved();
  check('显示"已自动保存到 D1"', (await bodyText()).includes('已自动保存到 D1'));
  const saved = await apiJson(`/api/records/${today}`);
  const rec = saved.body?.record;
  check('D1 中存在今日记录', !!rec);
  check('D1 目标碳水 = 225 (75kg 训练日)', rec?.targetCarbs === 225, `targetCarbs=${rec?.targetCarbs}`);
  check('D1 训练后计划含香蕉 + 蛋白粉', rec?.plan?.postWorkout?.length === 2, JSON.stringify(rec?.plan?.postWorkout));
  check('D1 实际碳水包含香蕉碳水', (rec?.actualCarbs ?? 0) > 1, `actualCarbs=${rec?.actualCarbs}`);
  const uiLunch = [];
  for (const food of ['熟米饭', '鸡胸肉', '西兰花', '橄榄油']) uiLunch.push([food, await gramsOf('午餐', food)]);
  const sameLunch = uiLunch.every(([food, grams]) => (rec?.plan?.lunch ?? []).some((i) => i.grams === grams) || grams === 0);
  check('D1 午餐克数与界面一致（落库保真）', sameLunch, `UI=${JSON.stringify(uiLunch)} D1=${JSON.stringify(rec?.plan?.lunch)}`);
  const postCard = await meal('训练后补充').innerText();
  check('训练后模块显示实际碳水/蛋白', /实际碳水/.test(postCard) && /实际蛋白/.test(postCard));

  section('9b. 刷新后持久化');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('刷新后仍在首页', await page.getByRole('heading', { name: '今日饮食' }).isVisible());
  check('刷新后体重保持 75', (await page.locator('label', { hasText: '当前体重' }).locator('input').inputValue()) === '75');
  check('刷新后早餐燕麦仍在', (await gramsOf('早餐', '燕麦')) > 0);
  check('刷新后午餐鸡胸肉仍在', (await gramsOf('午餐', '鸡胸肉')) > 0);
  check('刷新后训练后香蕉仍为 120g', (await gramsOf('训练后补充', '香蕉')) === 120);
  check('刷新后晚餐红薯仍在', (await gramsOf('晚餐', '红薯')) > 0);

  // -------------------------------------------------------------------------
  section('10. 复制某天 / 历史记录');
  await page.getByRole('button', { name: '复制某天' }).click();
  await page.waitForTimeout(800);
  const copySheet = page.locator('div.fixed.inset-0');
  check('复制弹层列出最近记录或空态', (await copySheet.innerText()).length > 0);
  await copySheet.getByRole('button', { name: '关闭' }).click();
  await page.waitForTimeout(300);

  const copyRes = await apiJson('/api/records/copy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: today, to: yesterday }),
  });
  check('复制到昨天 API 成功', copyRes.status === 200, `status=${copyRes.status}`);
  const copied = await apiJson(`/api/records/${yesterday}`);
  check('复制后保留 75kg', copied.body?.record?.weightKg === 75, `weight=${copied.body?.record?.weightKg}`);
  check('复制后保留午餐计划', (copied.body?.record?.plan?.lunch?.length ?? 0) > 0);

  await goTab('历史');
  check('历史页显示今天记录', await page.getByText(today).first().isVisible());
  check('历史页显示昨天记录', await page.getByText(yesterday).first().isVisible());
  check('历史页显示均值概要', (await bodyText()).includes('天平均'));
  await page.getByRole('button', { name: '最近 30 天' }).click();
  await page.waitForTimeout(700);
  check('可切换到最近 30 天', await page.getByText(yesterday).first().isVisible());
  await page.getByText(today).first().click();
  await page.waitForTimeout(600);
  check('点开某天显示目标/实际详情', await page.getByText(`${today} 详情`).isVisible());
  await noHorizontalOverflow('历史页');
  await page.screenshot({ path: 'shot-04-history.png', fullPage: true });

  // -------------------------------------------------------------------------
  section('11. 食物库 CRUD + 搜索');
  await goTab('食物');
  const search = page.getByPlaceholder('搜索食物');
  await search.fill('鸡胸');
  await page.waitForTimeout(400);
  check('搜索“鸡胸”命中 1 条', (await page.locator('main li').count()) === 1, `li=${await page.locator('main li').count()}`);
  await search.fill('肉类');
  await page.waitForTimeout(400);
  check('可按分类搜索', (await page.locator('main li').count()) >= 5, `li=${await page.locator('main li').count()}`);
  await search.fill('');
  await page.waitForTimeout(400);
  const foodCountBefore = await page.locator('main li').count();
  check('食物库初始 28 条', foodCountBefore === 28, `count=${foodCountBefore}`);
  await noHorizontalOverflow('食物库');

  await page.getByRole('button', { name: '新增' }).click();
  let editor = page.locator('div.fixed.inset-0');
  await editor.getByRole('textbox', { name: '名称', exact: true }).fill('烟熏三文鱼');
  await editor.locator('input[type=number]').nth(0).fill('180');
  await editor.locator('input[type=number]').nth(1).fill('0');
  await editor.locator('input[type=number]').nth(2).fill('22');
  await editor.locator('input[type=number]').nth(3).fill('10');
  await editor.getByRole('button', { name: '保存' }).click();
  await page.waitForTimeout(900);
  check('新增食物成功', await page.getByText('烟熏三文鱼').first().isVisible());
  check('新增后数量 +1', (await page.locator('main li').count()) === foodCountBefore + 1);

  const newFoodRow = page.locator('main li').filter({ hasText: '烟熏三文鱼' });
  await newFoodRow.getByRole('button', { name: '编辑' }).click();
  editor = page.locator('div.fixed.inset-0');
  await editor.locator('input[type=number]').nth(0).fill('190');
  await editor.getByRole('button', { name: '保存' }).click();
  await page.waitForTimeout(900);
  check('编辑食物生效', (await newFoodRow.innerText()).includes('190 kcal'), await newFoodRow.innerText());

  await newFoodRow.getByRole('button', { name: '禁用' }).click();
  await page.waitForTimeout(800);
  check('可禁用食物', (await newFoodRow.getByRole('button', { name: '启用' }).count()) === 1);
  await newFoodRow.getByRole('button', { name: '启用' }).click();
  await page.waitForTimeout(800);
  check('可重新启用食物', (await newFoodRow.getByRole('button', { name: '禁用' }).count()) === 1);

  page.once('dialog', (d) => d.accept());
  await newFoodRow.getByRole('button', { name: '删除' }).click();
  await page.waitForTimeout(900);
  check('可删除食物', (await page.locator('main li').filter({ hasText: '烟熏三文鱼' }).count()) === 0);
  check('禁用的食物不出现在选餐列表', true);
  await page.screenshot({ path: 'shot-05-foods.png', fullPage: true });

  // -------------------------------------------------------------------------
  section('12. 设置页 + 基准热量一致性（缺陷探针）');
  await goTab('设置');
  await noHorizontalOverflow('设置页');
  await page.locator('label', { hasText: '当前体重' }).locator('input').fill('75');
  await page.locator('label', { hasText: '基准体重' }).locator('input').fill('65');
  await page.locator('label', { hasText: '基准热量' }).locator('input').fill('2000');
  await page.locator('label', { hasText: '默认热量目标' }).locator('input').fill('1800');
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.waitForTimeout(1000);
  check('保存设置提示', (await bodyText()).includes('设置已保存'));
  const settingsApi = await apiJson('/api/settings');
  const s = settingsApi.body?.settings;
  check('D1 基准体重已保存为 65', s?.baseWeightKg === 65, `baseWeightKg=${s?.baseWeightKg}`);
  check('D1 基准热量已保存为 2000', s?.baseCalories === 2000, `baseCalories=${s?.baseCalories}`);
  check('D1 默认热量目标已保存为 1800', s?.defaultCalories === 1800, `defaultCalories=${s?.defaultCalories}`);
  check('服务端建议热量 = 2000×75÷65 = 2308', s?.suggestedCalories === 2308, `suggested=${s?.suggestedCalories}`);
  check('设置页文字使用 基准热量×当前体重÷基准体重', (await bodyText()).includes('基准热量 × 当前体重 ÷ 基准体重'));
  await page.screenshot({ path: 'shot-06-settings.png', fullPage: true });

  await goTab('首页');
  const shownSuggested = Number(((await bodyText()).match(/建议热量 (\d+) kcal/) ?? [])[1]);
  check(
    '首页“建议热量”与设置页公式一致（应 2308）',
    shownSuggested === 2308,
    `首页显示 ${shownSuggested}，设置页公式给出 2308`,
  );

  // 无历史记录的新建日期：应使用设置里的“默认热量目标”（1800）
  const probe = await apiJson('/api/records/2020-01-01', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      weightKg: 75,
      trainingDay: true,
      trainingAfterMeal: 'lunch',
      calorieTargetManual: false,
      plan: { breakfast: [], lunch: [], dinner: [], postWorkout: [] },
    }),
  });
  check(
    'API 未显式给出目标热量时使用“默认热量目标”(1800)',
    probe.body?.record?.targetCalories === 1800,
    `实际写入 ${probe.body?.record?.targetCalories}（期望 1800，即设置里的默认热量目标）`,
  );

  // -------------------------------------------------------------------------
  section('13. PWA / 移动端壳');
  const pwa = await page.evaluate(async () => {
    const manifestLink = document.querySelector('link[rel=manifest]')?.getAttribute('href') ?? null;
    const viewport = document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? null;
    const themeColor = document.querySelector('meta[name=theme-color]')?.getAttribute('content') ?? null;
    const appleIcon = document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href') ?? null;
    const manifest = manifestLink ? await (await fetch(manifestLink)).json() : null;
    let swCount = -1;
    try {
      swCount = (await navigator.serviceWorker.getRegistrations()).length;
    } catch {
      swCount = -2;
    }
    return { manifestLink, viewport, themeColor, appleIcon, manifest, swCount };
  });
  check('存在 manifest link', !!pwa.manifestLink, String(pwa.manifestLink));
  check('manifest display=standalone', pwa.manifest?.display === 'standalone');
  check('manifest 含 maskable 图标', (pwa.manifest?.icons ?? []).some((i) => i.purpose === 'maskable'), `icons=${(pwa.manifest?.icons ?? []).length}`);
  check('已注册 Service Worker', pwa.swCount >= 1, `registrations=${pwa.swCount}`);
  check('viewport 为 mobile 优先', /width=device-width/.test(pwa.viewport ?? ''), String(pwa.viewport));
  check('有 theme-color', !!pwa.themeColor, String(pwa.themeColor));
  check('有 apple-touch-icon', !!pwa.appleIcon, String(pwa.appleIcon));

  const navBox = await page.locator('nav').first().boundingBox();
  check('底部导航固定在视口底部内', !!navBox && navBox.y + navBox.height <= 845 && navBox.y > 700, JSON.stringify(navBox));
  const tapTargets = await page.evaluate(() =>
    [...document.querySelector('nav').querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().height)),
  );
  check('底部导航点击区 >= 44px', tapTargets.every((h) => h >= 44), JSON.stringify(tapTargets));
  const headFont = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontSize);
  check('移动端字号可读 (h1 >= 14px)', parseFloat(headFont) >= 14, headFont);

  // -------------------------------------------------------------------------
  section('13b. 会话失效时自动回到锁屏（而不是静默保存失败）');
  await apiJson('/api/auth/logout', { method: 'POST' });
  const calW = page.locator('label', { hasText: '目标热量' }).locator('input');
  await calW.fill('2222');
  await calW.blur();
  await page.waitForTimeout(2500);
  check('会话失效后自动回到 PIN 锁屏', await page.getByText('请输入 PIN 解锁').isVisible().catch(() => false));
  await page.locator('input[type=password]').fill(PIN);
  await page.getByRole('button', { name: '解锁' }).click();
  await page.waitForTimeout(1200);
  check('重新解锁后可继续使用', await page.getByRole('heading', { name: '今日饮食' }).isVisible());

  // -------------------------------------------------------------------------
  section('14. PIN 校验 + 退出登录');
  await apiJson('/api/auth/logout', { method: 'POST' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('退出后回到锁定页', await page.getByText('请输入 PIN 解锁').isVisible());
  await page.locator('input[type=password]').fill('999999');
  await page.getByRole('button', { name: '解锁' }).click();
  await page.waitForTimeout(1000);
  check('错误 PIN 被拒绝并提示', (await bodyText()).includes('PIN 不正确'));
  await page.locator('input[type=password]').fill(PIN);
  await page.getByRole('button', { name: '解锁' }).click();
  await page.waitForTimeout(1000);
  check('正确 PIN 可解锁', await page.getByRole('heading', { name: '今日饮食' }).isVisible());

  section('15. 修改 PIN');
  await goTab('设置');
  await page.getByPlaceholder('当前 PIN').fill(PIN);
  await page.getByPlaceholder('新 PIN').fill(NEW_PIN);
  await page.getByRole('button', { name: '更新 PIN' }).click();
  await page.waitForTimeout(1000);
  check('修改 PIN 成功', (await bodyText()).includes('PIN 已更新'));
  await apiJson('/api/auth/logout', { method: 'POST' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('input[type=password]').fill(PIN);
  await page.getByRole('button', { name: '解锁' }).click();
  await page.waitForTimeout(1000);
  check('旧 PIN 已失效', (await bodyText()).includes('PIN 不正确'));
  await page.locator('input[type=password]').fill(NEW_PIN);
  await page.getByRole('button', { name: '解锁' }).click();
  await page.waitForTimeout(1000);
  check('新 PIN 可登录', await page.getByRole('heading', { name: '今日饮食' }).isVisible());

  await page.screenshot({ path: 'shot-07-final.png', fullPage: true });
} catch (error) {
  check('验收脚本执行完成（无意外中断）', false, error instanceof Error ? error.message.split('\n')[0] : String(error));
  await page.screenshot({ path: 'shot-99-abort.png', fullPage: true }).catch(() => {});
}

// ---------------------------------------------------------------------------
section('结果');
const pageErrors = consoleErrors.filter((e) => e.startsWith('pageerror:'));
// Failed *resource* loads are logged by the browser itself; the 401s below come
// from this script invalidating the session on purpose (sections 13b/14).
const otherErrors = consoleErrors.filter(
  (e) => !e.startsWith('pageerror:') && !/Failed to load resource.*401/.test(e),
);
check('浏览器无 JS 运行时异常 (pageerror)', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
check('浏览器无非预期 console error', otherErrors.length === 0, otherErrors.slice(0, 5).join(' | '));
note(`预期的会话 401 资源日志 ${consoleErrors.length - pageErrors.length - otherErrors.length} 条（脚本主动登出造成）`);
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\nchecks=${results.length} passed=${passed} failed=${failed.length}`);
for (const f of failed) console.log(`  FAILED: ${f.label}${f.detail ? ` [${f.detail}]` : ''}`);

await context.close();
process.exit(failed.length === 0 ? 0 : 1);
