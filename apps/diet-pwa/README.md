# diet-pwa

Personal, mobile-first diet management PWA (MING-22 / MING-21 stage 1).

You pick the foods you want for each meal; the app works out **how many grams of
each food** to eat so that the meal lands close to its carbohydrate, protein, fat
and calorie targets.

The app lives entirely under `apps/diet-pwa/`. It does not touch, import or
replace anything in the existing Python `rl-insight` project.

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
│   ├── worker/             API: http helpers, D1 access layer, PIN auth, routes
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
npm test                        # 40 unit tests
npm run build
npm run db:migrate:local
```

The unit tests cover the eight contract scenarios: 70 kg and 60 kg training-day
macros, 70 kg rest-day macros, the ~20 g dinner carbohydrate rule, the banana and
protein powder counting towards the daily totals, locking chicken at 150 g, and
rebalancing after a manual rice edit.

## API

All `/api/*` routes require an unlocked session except `/api/health` and the
`/api/auth/*` endpoints.

| Method | Path                       | Purpose                              |
| ------ | -------------------------- | ------------------------------------ |
| GET    | `/api/health`              | liveness + seeded food count          |
| GET    | `/api/auth/status`         | is a PIN configured / am I unlocked   |
| POST   | `/api/auth/pin`            | first call sets the PIN, later unlocks |
| POST   | `/api/auth/pin/change`     | change the PIN                        |
| POST   | `/api/auth/logout`         | drop the session                      |
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
Worker validates the payload, recomputes `actual_*` from `foods x grams` so the
stored totals always match the stored plan, and writes `daily_records` +
`meal_items`.

## Security notes

- The PIN is never stored: PBKDF2-SHA256, 210 000 iterations, random 16-byte salt.
- Sessions are random 32-byte tokens stored only as SHA-256 hashes, delivered as
  an HttpOnly / SameSite=Lax cookie, valid 30 days.
- Eight wrong PINs lock the endpoint for 15 minutes.
- Core data (weight, food library, daily plans, history, settings) only lives in
  D1. `localStorage` is not used for core data.

## Deployment (performed by the parent task after member confirmation)

```bash
npx wrangler d1 create diet-pwa          # prints the real database_id
# paste that id into wrangler.toml -> [[d1_databases]] database_id
npm run db:migrate:remote
npm run cf:deploy
```

`wrangler.toml` currently carries the placeholder id
`00000000-0000-0000-0000-000000000000`; nothing in this repository creates or
touches remote Cloudflare resources on its own.
