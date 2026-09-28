-- MING-22 / diet-pwa seed food library.
--
-- These are common publicly available reference values per 100 g, rounded.
-- They are NOT precise lab measurements and every one of them can be edited or
-- deleted in the 食物 page - the app treats this file as "sensible defaults",
-- not as truth.
--
-- 鸡蛋 is shown as 个 (1 个 = 50 g edible portion) but is always stored and
-- optimised in grams. 牛奶 is shown in ml with 1 ml = 1 g.
--
-- Re-runnable: INSERT OR IGNORE keeps existing user edits untouched.

INSERT OR IGNORE INTO foods
  (name, category, role, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
   enabled, min_grams, max_grams, step_grams, unit_label, unit_grams, is_seed, sort_order)
VALUES
  -- 蛋白质类 ---------------------------------------------------------------
  ('鸡胸肉',   '肉类', 'protein', 165, 31.0,  3.6,  0.0, 1,  50, 300, 10, NULL, NULL, 1, 100),
  ('鸡腿肉',   '肉类', 'protein', 209, 26.0, 10.9,  0.0, 1,  50, 300, 10, NULL, NULL, 1, 101),
  ('瘦牛肉',   '肉类', 'protein', 250, 26.0, 15.0,  0.0, 1,  50, 300, 10, NULL, NULL, 1, 102),
  ('猪里脊',   '肉类', 'protein', 143, 21.0,  6.3,  0.0, 1,  50, 250, 10, NULL, NULL, 1, 103),
  ('鱼肉',     '肉类', 'protein', 105, 20.0,  2.5,  0.0, 1,  50, 300, 10, NULL, NULL, 1, 104),
  ('虾',       '肉类', 'protein',  99, 24.0,  0.3,  0.2, 1,  50, 300, 10, NULL, NULL, 1, 105),
  ('鸡蛋',     '蛋类', 'mixed',   143, 12.6,  9.5,  0.7, 1,  50, 300, 50, '个', 50.0, 1, 106),
  ('牛奶',     '奶类', 'mixed',    61,  3.2,  3.3,  4.8, 1, 100, 500, 50, 'ml',  1.0, 1, 107),
  ('无糖酸奶', '奶类', 'mixed',    61,  3.5,  3.3,  4.7, 1, 100, 400, 50, NULL, NULL, 1, 108),
  ('蛋白粉',   '补剂', 'protein', 400, 80.0,  5.0,  8.0, 1,   0, 100,  5, NULL, NULL, 1, 109),

  -- 碳水类 -----------------------------------------------------------------
  ('熟米饭',   '主食', 'carb', 130,  2.7,  0.3, 28.1, 1,  50, 500, 10, NULL, NULL, 1, 200),
  ('馒头',     '主食', 'carb', 223,  7.0,  1.1, 47.0, 1,  30, 300, 10, NULL, NULL, 1, 201),
  ('面条',     '主食', 'carb', 138,  4.5,  0.9, 28.0, 1,  50, 500, 10, NULL, NULL, 1, 202),
  ('燕麦',     '主食', 'carb', 389, 16.9,  6.9, 66.3, 1,  20, 150,  5, NULL, NULL, 1, 203),
  ('红薯',     '主食', 'carb',  86,  1.6,  0.1, 20.1, 1,  50, 500, 10, NULL, NULL, 1, 204),
  ('土豆',     '主食', 'carb',  77,  2.0,  0.1, 17.5, 1,  50, 500, 10, NULL, NULL, 1, 205),
  ('玉米',     '主食', 'carb',  96,  3.4,  1.5, 21.0, 1,  50, 400, 10, NULL, NULL, 1, 206),
  ('全麦面包', '主食', 'carb', 247, 13.0,  3.4, 41.0, 1,  30, 200, 10, NULL, NULL, 1, 207),
  ('香蕉',     '水果', 'carb',  89,  1.1,  0.3, 22.8, 1,  50, 400, 10, NULL, NULL, 1, 208),

  -- 脂肪类 -----------------------------------------------------------------
  ('橄榄油',   '油脂', 'fat',  884,  0.0, 100.0, 0.0, 1,   0,  30,  5, NULL, NULL, 1, 300),
  ('坚果',     '坚果', 'fat',  607, 20.0,  54.0, 21.0, 1,   0,  60,  5, NULL, NULL, 1, 301),
  ('花生酱',   '坚果', 'fat',  588, 25.0,  50.0, 20.0, 1,   0,  50,  5, NULL, NULL, 1, 302),
  ('牛油果',   '水果', 'fat',  160,  2.0,  14.7,  8.5, 1,   0, 200, 10, NULL, NULL, 1, 303),

  -- 蔬菜示例 ---------------------------------------------------------------
  ('西兰花',   '蔬菜', 'vegetable', 34, 2.8, 0.4, 6.6, 1, 50, 400, 10, NULL, NULL, 1, 400),
  ('菠菜',     '蔬菜', 'vegetable', 23, 2.9, 0.4, 3.6, 1, 50, 400, 10, NULL, NULL, 1, 401),
  ('生菜',     '蔬菜', 'vegetable', 15, 1.4, 0.2, 2.9, 1, 50, 300, 10, NULL, NULL, 1, 402),
  ('番茄',     '蔬菜', 'vegetable', 18, 0.9, 0.2, 3.9, 1, 50, 400, 10, NULL, NULL, 1, 403),
  ('黄瓜',     '蔬菜', 'vegetable', 15, 0.7, 0.1, 3.6, 1, 50, 300, 10, NULL, NULL, 1, 404);
