#!/usr/bin/env bash
#
# Local HTTP/API smoke test for the diet PWA (MING-22 acceptance step 7).
#
# Starts `wrangler dev` against the local D1 database, exercises the whole API
# surface plus the PWA assets, then shuts the server down again.
#
#   ./scripts/smoke.sh
#
# Requires a prior `npm run db:migrate:local` and `npm run build`.

set -u

cd "$(dirname "$0")/.."

PORT="${PORT:-8788}"
BASE="http://127.0.0.1:${PORT}"
WORK=".wrangler-smoke"
JAR="$WORK/cookies.txt"
LOG="$WORK/dev.log"

export npm_config_cache="${npm_config_cache:-$PWD/.npm-cache}"
export WRANGLER_LOG_PATH="${WRANGLER_LOG_PATH:-$PWD/.wrangler-logs}"
# Keep wrangler's global config/cache inside the workspace so the test also runs
# in sandboxes where ~/Library is not writable.
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$PWD/.wrangler-xdg/config}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$PWD/.wrangler-xdg/cache}"

mkdir -p "$WORK" "$WRANGLER_LOG_PATH" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
rm -f "$JAR"

pass=0
fail=0
check() { # label expected actual
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1 (=$3)"
    pass=$((pass + 1))
  else
    echo "  FAIL  $1 (expected $2, got $3)"
    fail=$((fail + 1))
  fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -s "$@"; }
json() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

echo "== starting wrangler dev on port $PORT"
npx wrangler dev --port "$PORT" --ip 127.0.0.1 >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    pkill -TERM -P "$SERVER_PID" 2>/dev/null
    kill -TERM "$SERVER_PID" 2>/dev/null
    sleep 2
    kill -KILL "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if [ "$(code "$BASE/api/health")" = "200" ]; then break; fi
  sleep 1
done

if [ "$(code "$BASE/api/health")" != "200" ]; then
  echo "server did not become ready; last log lines:"
  tail -20 "$LOG"
  exit 1
fi

echo
echo "== 1. health"
check "GET /api/health -> 200" 200 "$(code "$BASE/api/health")"
# The single-user PIN gate was removed, so the API is open by design.
check "GET /api/foods -> 200 (no auth gate)" 200 "$(code "$BASE/api/foods")"

echo
echo "== 2. seeded food library"
check "seeded food library -> 28 foods" 28 "$(body "$BASE/api/foods" | json "['foods'].__len__()")"
check "foods expose the serving fields" "False" \
  "$(body "$BASE/api/foods" | python3 -c "import sys,json;print(any('kcalPerServing' not in f for f in json.load(sys.stdin)['foods']))")"

echo
echo "== 3. settings / weight linkage"
body -b "$JAR" "$BASE/api/settings" | json "['settings']" | sed 's/^/  /'
check "PUT /api/settings -> 200" 200 \
  "$(code -b "$JAR" -X PUT -H 'content-type: application/json' \
    -d '{"currentWeightKg":80,"baseWeightKg":70,"baseCalories":1900,"defaultCalories":2171,"defaultTrainingDay":true,"defaultTrainingAfterMeal":"lunch"}' \
    "$BASE/api/settings")"
check "80 kg -> suggested 2171 kcal" 2171 "$(body -b "$JAR" "$BASE/api/settings" | json "['settings']['suggestedCalories']")"

echo
echo "== 4. food CRUD"
NEW_FOOD=$(body -b "$JAR" -X POST -H 'content-type: application/json' \
  -d '{"name":"烟熏三文鱼","category":"肉类","role":"protein","kcalPer100g":180,"proteinPer100g":22,"fatPer100g":10,"carbsPer100g":0,"enabled":true,"minGrams":30,"maxGrams":200,"stepGrams":10,"unitLabel":null,"unitGrams":null}' \
  "$BASE/api/foods")
FOOD_ID=$(echo "$NEW_FOOD" | json "['food']['id']")
check "POST /api/foods -> non-zero id" "true" "$([ "${FOOD_ID:-0}" -gt 0 ] && echo true || echo false)"
check "PUT /api/foods/:id -> 200" 200 \
  "$(code -b "$JAR" -X PUT -H 'content-type: application/json' \
    -d '{"name":"烟熏三文鱼","category":"肉类","role":"protein","kcalPer100g":190,"proteinPer100g":23,"fatPer100g":11,"carbsPer100g":0,"enabled":false,"minGrams":30,"maxGrams":200,"stepGrams":10,"unitLabel":null,"unitGrams":null}' \
    "$BASE/api/foods/$FOOD_ID")"
check "duplicate name -> 409" 409 \
  "$(code -b "$JAR" -X POST -H 'content-type: application/json' \
    -d '{"name":"烟熏三文鱼","category":"肉类","role":"protein","kcalPer100g":1,"proteinPer100g":0,"fatPer100g":0,"carbsPer100g":0,"enabled":true,"minGrams":0,"maxGrams":10,"stepGrams":5,"unitLabel":null,"unitGrams":null}' \
    "$BASE/api/foods")"
check "DELETE /api/foods/:id -> 200" 200 "$(code -b "$JAR" -X DELETE "$BASE/api/foods/$FOOD_ID")"

echo
echo "== 5. daily record, locked weight, persistence"
ID_OF=$(body -b "$JAR" "$BASE/api/foods" | python3 -c "
import sys, json
foods = {f['name']: f['id'] for f in json.load(sys.stdin)['foods']}
print(foods['熟米饭'], foods['鸡胸肉'], foods['香蕉'], foods['蛋白粉'])
")
read -r RICE CHICKEN BANANA POWDER <<<"$ID_OF"
PAYLOAD=$(python3 - "$RICE" "$CHICKEN" "$BANANA" "$POWDER" <<'PY'
import json, sys
rice, chicken, banana, powder = (int(value) for value in sys.argv[1:5])
print(json.dumps({
    "weightKg": 70, "trainingDay": True, "trainingAfterMeal": "lunch",
    "targetCalories": 1900, "calorieTargetManual": False,
    "plan": {
        "breakfast": [],
        "lunch": [{"foodId": rice, "grams": 300, "locked": False},
                  {"foodId": chicken, "grams": 150, "locked": True}],
        "dinner": [],
        "postWorkout": [{"foodId": banana, "grams": 120, "locked": False},
                        {"foodId": powder, "grams": 30, "locked": False}],
    },
}))
PY
)
SAVED=$(body -b "$JAR" -X PUT -H 'content-type: application/json' -d "$PAYLOAD" "$BASE/api/records/2026-09-28")
echo "$SAVED" | json "['record']" | sed 's/^/  /'
check "70 kg training day target carbs = 210" 210 "$(echo "$SAVED" | json "['record']['targetCarbs']")"
check "70 kg training day target protein = 112" 112 "$(echo "$SAVED" | json "['record']['targetProtein']")"
check "70 kg training day target fat = 42" 42 "$(echo "$SAVED" | json "['record']['targetFat']")"
check "locked chicken persisted at 150 g" 150 "$(echo "$SAVED" | json "['record']['plan']['lunch'][1]['grams']")"
check "post-workout banana passed through" 120 "$(echo "$SAVED" | json "['record']['plan']['postWorkout'][0]['grams']")"
check "record survives a fresh read" 210 "$(body -b "$JAR" "$BASE/api/records/2026-09-28" | json "['record']['targetCarbs']")"

echo
echo "== 6. copy a day + history"
check "POST /api/records/copy -> 200" 200 \
  "$(code -b "$JAR" -X POST -H 'content-type: application/json' -d '{"from":"2026-09-28","to":"2026-09-29"}' "$BASE/api/records/copy")"
check "copied day keeps the target carbs" 210 "$(body -b "$JAR" "$BASE/api/records/2026-09-29" | json "['record']['targetCarbs']")"
check "GET /api/records?days=7 -> 200" 200 "$(code -b "$JAR" "$BASE/api/records?days=7")"
# Both days the script wrote must appear. The local D1 keeps records between
# runs, so this asserts containment instead of an exact count.
cat > "$WORK/dates_in_history.py" <<'PYEOF'
import json, sys

dates = [record["date"] for record in json.load(sys.stdin)["records"]]
print("true" if "2026-09-28" in dates and "2026-10-05" in dates else "false")
PYEOF
check "both smoke columns are in history" "true" \
  "$(body -b "$JAR" "$BASE/api/records?days=7" | python3 "$WORK/dates_in_history.py")"

echo
echo "== 6b. new day without an explicit target uses the stored 默认热量目标"
check "PUT /api/settings 默认热量目标 1800 -> 200" 200 \
  "$(code -b "$JAR" -X PUT -H 'content-type: application/json' \
    -d '{"currentWeightKg":80,"baseWeightKg":70,"baseCalories":1900,"defaultCalories":1800,"defaultTrainingDay":true,"defaultTrainingAfterMeal":"lunch"}' \
    "$BASE/api/settings")"
check "settings keeps defaultCalories = 1800" 1800 "$(body -b "$JAR" "$BASE/api/settings" | json "['settings']['defaultCalories']")"
check "record without targetCalories -> 200" 200 \
  "$(code -b "$JAR" -X PUT -H 'content-type: application/json' \
    -d '{"weightKg":75,"trainingDay":true,"trainingAfterMeal":"lunch","calorieTargetManual":false,"plan":{"breakfast":[],"lunch":[],"dinner":[],"postWorkout":[]}}' \
    "$BASE/api/records/2026-10-05")"
check "falls back to 默认热量目标 1800 (not 1900 x w / 70)" 1800 \
  "$(body -b "$JAR" "$BASE/api/records/2026-10-05" | json "['record']['targetCalories']")"
check "explicit targetCalories still wins" 2500 \
  "$(body -b "$JAR" -X PUT -H 'content-type: application/json' \
    -d '{"weightKg":75,"trainingDay":true,"trainingAfterMeal":"lunch","targetCalories":2500,"calorieTargetManual":true,"plan":{"breakfast":[],"lunch":[],"dinner":[],"postWorkout":[]}}' \
    "$BASE/api/records/2026-10-05" | json "['record']['targetCalories']")"

echo
echo "== 7. 按份 (per-serving) food + meal item"
# The payloads go through files: the JSON is full of quotes and braces, and
# inline `-d "{\"...\"}"` nesting is easy to get subtly wrong.
EGG_ID="$(body "$BASE/api/foods" | python3 -c "import sys,json;print([f['id'] for f in json.load(sys.stdin)['foods'] if f['name']=='鸡蛋'][0])")"
RICE_ID="$(body "$BASE/api/foods" | python3 -c "import sys,json;print([f['id'] for f in json.load(sys.stdin)['foods'] if f['name']=='熟米饭'][0])")"
DAY=2026-10-06

cat > "$WORK/egg.json" <<JSON
{"name":"鸡蛋","category":"蛋类","role":"mixed","kcalPer100g":143,"proteinPer100g":12.6,"fatPer100g":9.5,"carbsPer100g":0.7,"enabled":true,"minGrams":50,"maxGrams":300,"stepGrams":50,"servingEnabled":true,"unitLabel":"个","unitGrams":50,"kcalPerServing":72,"proteinPerServing":6.3,"fatPerServing":4.8,"carbsPerServing":0.4,"servingStep":1}
JSON
check "PUT /api/foods/:id 启用按份 -> 200" 200 \
  "$(code -X PUT -H 'content-type: application/json' --data-binary @"$WORK/egg.json" "$BASE/api/foods/$EGG_ID")"
check "每份热量 stored as 72" 72 \
  "$(body "$BASE/api/foods" | python3 -c "import sys,json;print([f['kcalPerServing'] for f in json.load(sys.stdin)['foods'] if f['name']=='鸡蛋'][0])")"

# 启用按份 without a unit name must be rejected, and must not half-write.
python3 - "$WORK/egg.json" "$WORK/egg-no-unit.json" <<'PYEOF'
import json, sys
food = json.load(open(sys.argv[1]))
food['unitLabel'] = None
json.dump(food, open(sys.argv[2], 'w'), ensure_ascii=False)
PYEOF
check "启用按份 without 份单位 -> 400" 400 \
  "$(code -X PUT -H 'content-type: application/json' --data-binary @"$WORK/egg-no-unit.json" "$BASE/api/foods/$EGG_ID")"
check "…and the rejected write left 份单位 alone" "个" \
  "$(body "$BASE/api/foods" | python3 -c "import sys,json;print([f['unitLabel'] for f in json.load(sys.stdin)['foods'] if f['name']=='鸡蛋'][0])")"

cat > "$WORK/egg-record.json" <<JSON
{"weightKg":70,"trainingDay":false,"trainingAfterMeal":"lunch","targetCalories":1900,"calorieTargetManual":false,"plan":{"breakfast":[{"foodId":$EGG_ID,"grams":100,"quantityType":"servings","servings":2,"locked":true}],"lunch":[],"dinner":[],"postWorkout":[]}}
JSON
check "PUT /api/records/:date with 2 个鸡蛋 -> 200" 200 \
  "$(code -X PUT -H 'content-type: application/json' --data-binary @"$WORK/egg-record.json" "$BASE/api/records/$DAY")"
check "the item is stored as servings (not grams)" "servings" \
  "$(body "$BASE/api/records/$DAY" | json "['record']['plan']['breakfast'][0]['quantityType']")"
check "the serving count is kept as 2" 2 \
  "$(body "$BASE/api/records/$DAY" | json "['record']['plan']['breakfast'][0]['servings']")"
check "the effective weight is stored as 100 g" 100 \
  "$(body "$BASE/api/records/$DAY" | json "['record']['plan']['breakfast'][0]['grams']")"
check "2 个鸡蛋 = 144 kcal" 144 \
  "$(body "$BASE/api/records/$DAY" | json "['record']['actualCalories']")"
check "a second read still shows 2 个 (refresh)" "servings" \
  "$(body "$BASE/api/records/$DAY" | json "['record']['plan']['breakfast'][0]['quantityType']")"

cat > "$WORK/rice-servings.json" <<JSON
{"weightKg":70,"trainingDay":false,"trainingAfterMeal":"lunch","targetCalories":1900,"plan":{"breakfast":[{"foodId":$RICE_ID,"quantityType":"servings","servings":1}],"lunch":[],"dinner":[],"postWorkout":[]}}
JSON
check "按份 item on a food without serving data -> 400" 400 \
  "$(code -X PUT -H 'content-type: application/json' --data-binary @"$WORK/rice-servings.json" "$BASE/api/records/$DAY")"
check "…and the rejected payload changed nothing" "7:servings" \
  "$(body "$BASE/api/records/$DAY" | python3 -c "import sys,json;i=json.load(sys.stdin)['record']['plan']['breakfast'];print(f\"{i[0]['foodId']}:{i[0]['quantityType']}\" if len(i)==1 else 'changed')")"

cat > "$WORK/empty-record.json" <<JSON
{"weightKg":70,"trainingDay":false,"trainingAfterMeal":"lunch","targetCalories":1900,"plan":{"breakfast":[],"lunch":[],"dinner":[],"postWorkout":[]}}
JSON
body -X PUT -H 'content-type: application/json' --data-binary @"$WORK/empty-record.json" "$BASE/api/records/$DAY" >/dev/null

echo "== 8. SPA shell + PWA assets"
check "GET / -> 200" 200 "$(code "$BASE/")"
check "GET /manifest.webmanifest -> 200" 200 "$(code "$BASE/manifest.webmanifest")"
check "GET /sw.js -> 200" 200 "$(code "$BASE/sw.js")"
check "GET /icons/icon-192.png -> 200" 200 "$(code "$BASE/icons/icon-192.png")"
check "GET /icons/icon-512.png -> 200" 200 "$(code "$BASE/icons/icon-512.png")"
check "SPA fallback /history -> 200" 200 "$(code "$BASE/history")"
check "manifest display=standalone" "standalone" "$(body "$BASE/manifest.webmanifest" | json "['display']")"
check "manifest has a maskable icon" "true" \
  "$(body "$BASE/manifest.webmanifest" | json "['icons']" | grep -q maskable && echo true || echo false)"

echo
echo "RESULT: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
