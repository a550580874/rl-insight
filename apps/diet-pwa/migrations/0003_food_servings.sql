-- MING-21 / diet-pwa: "按份管理" (per-serving food management).
--
-- Additive only. Nothing is dropped, renamed or rewritten, so the existing
-- per-100g behaviour and every historical row keep working unchanged.
--
--   foods.serving_enabled = 0  -> legacy food: nutrition comes from per 100 g,
--                                 the plan stores grams only.
--   foods.serving_enabled = 1  -> the food also declares one serving
--                                 (unit_label = 个/根/片/勺…, optional
--                                 unit_grams = weight of one serving) and its
--                                 per-serving macros in kcal_per_serving ….
--
--   meal_items.quantity_type   -> 'grams' (default) or 'servings'. Explicit, so
--                                 a 2 个 egg row is never guessed from a null.
--   meal_items.servings        -> the raw serving count the user entered, kept
--                                 alongside grams so a reload shows 2 个 again.
--
-- The per-serving macro columns are resolved once, when the food is written
-- through the API (see src/shared/nutrition/serving.ts): an explicit value wins,
-- otherwise it is derived from the per-100g values and the serving weight. That
-- keeps exactly one truth per mode instead of re-deriving at read time.
--
-- SQLite cannot add a CHECK constraint through ALTER TABLE, so the allowed
-- values are enforced in the API layer (src/worker/handlers).

ALTER TABLE foods ADD COLUMN serving_enabled     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE foods ADD COLUMN kcal_per_serving    REAL;
ALTER TABLE foods ADD COLUMN protein_per_serving REAL;
ALTER TABLE foods ADD COLUMN fat_per_serving     REAL;
ALTER TABLE foods ADD COLUMN carbs_per_serving   REAL;
ALTER TABLE foods ADD COLUMN serving_step        REAL    NOT NULL DEFAULT 1;

ALTER TABLE meal_items ADD COLUMN quantity_type TEXT NOT NULL DEFAULT 'grams';
ALTER TABLE meal_items ADD COLUMN servings      REAL NOT NULL DEFAULT 0;
