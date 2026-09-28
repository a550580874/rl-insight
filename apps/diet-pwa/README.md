# diet-pwa

Personal, mobile-first diet management PWA (MING-22 / MING-21 stage 1).

You pick the foods you want for each meal; the app works out **how many grams of
each food** to eat so that the meal lands close to its carbohydrate, protein, fat
and calorie targets.

The app lives entirely under `apps/diet-pwa/`. It does not touch, import or
replace anything in the existing Python `rl-insight` project.

This is intentionally a personal, single-user app. It has no account system or
access control; anyone with the deployed URL can access the same data.

## Stack

| Layer     | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Frontend  | React 19 + TypeScript (strict) + Tailwind CSS 4 + Vite 8      |
| Runtime   | Cloudflare Workers (API) + Workers static assets (SPA shell)  |
| Database  | Cloudflare D1 (SQLite) with SQL migrations                     |
| Tests     | Vitest (algorithm unit tests)                                  |
| PWA       | manifest + service worker + icons, installable / standalone    |

## Layout

```
apps/diet-pwa/
├── migrations/             D1 SQL migrations (schema + seed foods)
├── public/                 manifest, service worker, generated icons
├── src/
│   ├── shared/             code shared by the browser and the Worker
│   │   ├── types.ts
│   │   └── nutrition/
│   │       ├── config.ts   every tunable number (no scattered magic numbers)
│   │       ├── targets.ts  weight -> daily macros -> per-meal targets
│   │       ├── optimizer.ts constrained weighted least squares solver
│   │       └── mealPlan.ts day-plan orchestration
│   ├── worker/             API: http helpers, D1 access layer and routes
│   └── app/                React UI (pages, components, state, api client)
├── tests/                  algorithm unit tests (contract §32 cases 1-8)
├── tools/generate-icons.mjs
└── wrangler.toml
```

## The algorithm (`src/shared/nutrition`)

1. **Daily targets** — training day `3.0/1.6/0.6 g per kg` of carbs/protein/fat;
   rest day `160 x weight / 70` g carbs, `1.6 g/kg` protein, `0.65 g/kg` fat.
2. **Meal split** — dinner keeps ~20 g of carbohydrate; the rest is split
   between breakfast and lunch using the reference ratio from the config.
   Protein and fat use configurable shares. The post-workout module
   (banana + protein powder) is subtracted from the daily budget *first*, so it
   genuinely counts towards the daily totals.
3. **Optimizer** — constrained weighted least squares over
   carbs/protein/fat/calories with the contract priority order
   (protein > carbs > fat > calories). Each food is optimised along its own axis
   using the closed-form 1-D optimum, snapped to its `min/max/step` grid. Two
   extra penalty terms keep results realistic:
   - **role guards** so a `protein` food never becomes the main carb source and a
     `fat` food never becomes the main protein source;
   - **anchors** so `vegetable` foods stay near a normal serving.
4. **Locks and rebalancing** — locked foods are removed from the search space and
   contribute a fixed amount, so "lock chicken at 150 g" and "I changed rice to
   250 g, rebalance the rest" are the same code path. Editing a weight in the UI
   locks that item automatically; tap the lock to release it.
5. **按份 (per serving)** — a food may additionally be managed by the piece
   (`2 个鸡蛋`, `1 勺蛋白粉`). `src/shared/nutrition/serving.ts` owns the maths:

   | item mode                | nutrition                           |
   | ------------------------ | ----------------------------------- |
   | `quantity_type=grams`    | `per100g x grams / 100` (unchanged) |
   | `quantity_type=servings` | `perServing x servings`             |

   The database row is the only source of truth: `resolveServingNutrition()` runs
   once on every food write (`POST`/`PUT /api/foods`) and *stores* the per-serving
   macros — an explicitly entered value wins, otherwise it is derived from
   `per100g x 每份重量`, otherwise the food has none. Readers never re-derive, so a
   food can never report two contradicting numbers at once, and a serving weight
   is optional (a 盒牛奶 can be "250 kcal / 盒" with no gram weight).

   Meal items store `quantity_type` **explicitly** next to `grams` (the effective
   weight, kept for the optimizer and the history) and `servings`; nothing is
   inferred from a null. Items in 份 mode are fixed contributions to the
   optimizer — it never turns "2 个鸡蛋" into grams, it just subtracts their
   macros. Foods without serving data (`serving_enabled = 0`, the default for
   everything that existed before) behave exactly as before.

All tunables live in `NUTRITION_CONFIG` (`src/shared/nutrition/config.ts`).
Seeded nutrition values are common public reference values per 100 g and are
editable in the 食物 page — they are not precise lab data.

## Local development

```bash
npm install
npm run db:migrate:local      # apply migrations to the local D1
npm run cf:dev                # Worker + D1 + built assets on http://127.0.0.1:8788
```

`wrangler dev` serves the Worker API *and* the `dist/` assets, so the whole app
is exercised on one port. Rebuild the frontend (`npm run build`) after UI changes.

For a Vite dev server with hot reload, run `npm run dev` (port 5199) — it proxies
`/api` to `wrangler dev` on 8788.

> In restricted environments where `~/Library/Preferences` is not writable,
> point wrangler's config/cache at the workspace:
> `XDG_CONFIG_HOME=./.wrangler-xdg/config XDG_CACHE_HOME=./.wrangler-xdg/cache`.

## Checks

```bash
npm run lint
npm run typecheck               # 4 tsconfigs: app / worker / node / tests
npm test                        # 90 unit tests
npm run build
npm run db:migrate:local
npm run smoke                   # 45 HTTP/API + PWA checks against wrangler dev
BASE=http://127.0.0.1:8788 node scripts/verify-serving.mjs      # 36 API checks for 按份
BASE=http://127.0.0.1:8788 node scripts/verify-serving-ui.mjs   # 34 real-browser checks
```

The unit tests cover the eight contract scenarios: 70 kg and 60 kg training-day
macros, 70 kg rest-day macros, the ~20 g dinner carbohydrate rule, the banana and
protein powder counting towards the daily totals, locking chicken at 150 g, and
rebalancing after a manual rice edit. They also pin the calorie profile rules
(`suggestedCaloriesFor` / `startingCaloriesFor`).

`tests/serving.test.ts` adds the 按份 contract: the 100 g mode is unchanged,
`2 个鸡蛋 = 144 kcal`, per-serving values derived from a serving weight, foods with
no serving data, `2 个` surviving a save/reload round trip as `2 个` (not `100 g`),
mixed grams+servings day totals, food CRUD persistence and validation, and
`serving_enabled = 0` behaving exactly as before.

`scripts/verify-serving.mjs` and `scripts/verify-serving-ui.mjs` are the
end-to-end acceptance for the 按份 feature against any `BASE` (local or the
deployed Worker). They snapshot the target day's record first and restore it
afterwards, so they are safe to point at production. The browser one needs
`playwright-core` (installed ad hoc, not a project dependency) plus a local
Chrome.

### Browser / mobile acceptance

`e2e/mobile-acceptance.mjs` drives the real UI in a 390x844 touch viewport and
checks the home summary, automatic grams, locking and rebalancing, the
training/rest switch, the post-workout module, auto save plus refresh
persistence, history and copy, food CRUD, settings and the PWA shell. It is kept
out of `npm test` because it needs a browser and a throwaway local D1 — see the
header of the file for the exact commands.

## API

All `/api/*` routes are directly accessible because this is a single-user
personal app. Keep the deployed URL private if the data should remain private.

| Method | Path                       | Purpose                              |
| ------ | -------------------------- | ------------------------------------ |
| GET    | `/api/health`              | liveness + seeded food count          |
| GET    | `/api/foods`               | food library                          |
| POST   | `/api/foods`               | create a food                         |
| PUT    | `/api/foods/:id`           | update a food                         |
| DELETE | `/api/foods/:id`           | delete a food                         |
| GET    | `/api/settings`            | profile settings                      |
| PUT    | `/api/settings`            | update settings                       |
| GET    | `/api/records?days=30`     | recent daily records                  |
| GET    | `/api/records/:date`       | one day + its meal items              |
| PUT    | `/api/records/:date`       | upsert a day (auto-save target)       |
| POST   | `/api/records/copy`        | copy one day's plan onto another      |

The client computes grams with the shared algorithm module and PUTs them; the
Worker validates the payload, re-checks every 按份 item against its food
(`resolvePlanQuantities`) and re-derives the effective grams from the serving
count so a client can never store a contradicting weight, recomputes `actual_*`
so the stored totals always match the stored plan, and writes `daily_records` +
`meal_items`.

A food payload with `servingEnabled: true` must carry a 份单位 and at least one
usable per-serving value (or a 每份重量 to derive them from); anything else is a
`400`. Serving counts must be `> 0`.

## Data notes

- There is no authentication or access control; anyone with the deployed URL can
  access the same personal data.
- Core data (weight, food library, daily plans, history, settings) only lives in
  D1. `localStorage` is not used for core data.
- `meal_items.quantity_type` is `'grams'` or `'servings'` and is always written
  explicitly. Migration `0003_food_servings.sql` adds the serving columns with
  defaults (`serving_enabled = 0`, `quantity_type = 'grams'`), so rows written
  before 按份 existed keep loading as plain weights; the migration is additive and
  never rewrites or drops existing data.

## Deployment (performed by the parent task after member confirmation)

```bash
npx wrangler d1 create diet-pwa          # prints the real database_id
# paste that id into wrangler.toml -> [[d1_databases]] database_id
npm run db:migrate:remote
npm run cf:deploy
```

`wrangler.toml` carries the real `database_id`; nothing in this repository creates
remote Cloudflare resources on its own. `npm run cf:deploy` builds and deploys the
Worker plus the `dist/` assets in one step.
