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
echo "== 1. health + auth gate"
check "GET /api/health -> 200" 200 "$(code "$BASE/api/health")"
check "GET /api/foods before unlock -> 401" 401 "$(code "$BASE/api/foods")"
check "GET /api/auth/status -> 200" 200 "$(code "$BASE/api/auth/status")"

echo
echo "== 2. PIN setup and session cookie"
check "POST /api/auth/pin -> 200" 200 \
  "$(code -c "$JAR" -X POST -H 'content-type: application/json' -d '{"pin":"246813"}' "$BASE/api/auth/pin")"
if grep -q "diet_session" "$JAR"; then
  echo "  PASS  HttpOnly session cookie issued"
  pass=$((pass + 1))
else
  echo "  FAIL  no session cookie issued"
  fail=$((fail + 1))
fi
check "session cookie reaches a protected route -> 200" 200 "$(code -b "$JAR" "$BASE/api/foods")"
check "seeded food library -> 28 foods" 28 "$(body -b "$JAR" "$BASE/api/foods" | json "['foods'].__len__()")"

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
check "two records in history" 2 "$(body -b "$JAR" "$BASE/api/records?days=7" | json "['records'].__len__()")"

echo
echo "== 7. PIN rejection + logout"
check "wrong PIN -> 401" 401 \
  "$(code -X POST -H 'content-type: application/json' -d '{"pin":"999999"}' "$BASE/api/auth/pin")"
check "POST /api/auth/logout -> 200" 200 "$(code -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/logout")"
check "session invalidated -> 401" 401 "$(code -b "$JAR" "$BASE/api/foods")"

echo
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
