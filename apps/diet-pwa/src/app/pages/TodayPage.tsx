import { useCallback, useEffect, useMemo, useState } from 'react';
import { NUTRITION_CONFIG } from '../../shared/nutrition/config';
import { computeDayPlan, emptyPlan, optimizePreWorkoutCarbs } from '../../shared/nutrition/mealPlan';
import { computeDefaultCalories } from '../../shared/nutrition/targets';
import {
  MEAL_KEYS,
  type ComputedMealItem,
  type DailyRecord,
  type DailyRecordWithPlan,
  type Food,
  type MealItem,
  type MealKey,
  type MealPlan,
  type ModuleKey,
  type TrainingAfterMeal,
} from '../../shared/types';
import { api } from '../api';
import { FoodPicker } from '../components/FoodPicker';
import { MealCard } from '../components/MealCard';
import { Button, Card, EmptyState, NumberField, ProgressBar, SegmentedControl, Sheet, Spinner } from '../components/ui';
import { useDebouncedEffect } from '../hooks/useDebouncedEffect';
import { useApp } from '../state/AppContext';

export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function defaultServing(food: Food, module: ModuleKey): number {
  const reference =
    module === 'postWorkout' ? 100 : (NUTRITION_CONFIG.defaults.servingGramsByRole[food.role] ?? 100);
  const clamped = Math.min(Math.max(reference, food.minGrams), food.maxGrams);
  const step = food.stepGrams > 0 ? food.stepGrams : 5;
  const snapped = food.minGrams + Math.round((clamped - food.minGrams) / step) * step;
  return Math.round(Math.min(Math.max(snapped, food.minGrams), food.maxGrams) * 10) / 10;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function TodayPage() {
  const { foods, settings, notify } = useApp();

  const date = useMemo(() => todayIso(), []);
  const [plan, setPlan] = useState<MealPlan>(emptyPlan);
  const [weightKg, setWeightKg] = useState(settings?.currentWeightKg ?? 70);
  const [trainingDay, setTrainingDay] = useState(settings?.defaultTrainingDay ?? true);
  const [trainingAfterMeal, setTrainingAfterMeal] = useState<TrainingAfterMeal>(
    settings?.defaultTrainingAfterMeal ?? 'lunch',
  );
  const [targetCalories, setTargetCalories] = useState(() => computeDefaultCalories(settings?.currentWeightKg ?? 70));
  const [calorieManual, setCalorieManual] = useState(false);
  const [carbShift, setCarbShift] = useState(0);

  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [pickerModule, setPickerModule] = useState<ModuleKey | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [recentRecords, setRecentRecords] = useState<DailyRecord[]>([]);

  const touch = useCallback(() => setRevision((value) => value + 1), []);

  /** Default post-workout supplements: banana + protein powder (§10). */
  const defaultPostWorkout = useCallback(
    (availableFoods: readonly Food[]): MealItem[] => {
      const config = NUTRITION_CONFIG.postWorkout;
      const items: MealItem[] = [];
      const banana = availableFoods.find((food) => food.name === config.bananaName && food.enabled);
      const powder = availableFoods.find((food) => food.name === config.proteinPowderName && food.enabled);
      if (banana) items.push({ foodId: banana.id, grams: config.bananaDefaultGrams, locked: false });
      if (powder) items.push({ foodId: powder.id, grams: config.proteinPowderDefaultGrams, locked: false });
      return items;
    },
    [],
  );

  const hydrate = useCallback((record: DailyRecordWithPlan) => {
    setWeightKg(record.weightKg);
    setTrainingDay(record.trainingDay);
    setTrainingAfterMeal(record.trainingAfterMeal);
    setTargetCalories(record.targetCalories);
    setCalorieManual(record.calorieTargetManual);
    setPlan(record.plan);
    setCarbShift(0);
  }, []);

  // Initial load for today's record (falls back to settings defaults).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await api.getRecord(date);
        if (cancelled) return;
        if (response.record) {
          hydrate(response.record);
        } else if (settings) {
          setWeightKg(settings.currentWeightKg);
          setTrainingDay(settings.defaultTrainingDay);
          setTrainingAfterMeal(settings.defaultTrainingAfterMeal);
          setTargetCalories(computeDefaultCalories(settings.currentWeightKg));
          setPlan({
            breakfast: [],
            lunch: [],
            dinner: [],
            postWorkout: settings.defaultTrainingDay ? defaultPostWorkout(foods) : [],
          });
        }
      } catch (error) {
        if (!cancelled) notify(error instanceof Error ? error.message : '读取今日记录失败');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // Intentionally keyed on the date only: settings and foods are already
    // loaded by the provider before this page mounts, and re-running the load
    // on every food edit would clobber the user's in-progress plan.
  }, [date]);

  const computeParams = useMemo(
    () => ({ date, weightKg, trainingDay, trainingAfterMeal, targetCalories, plan, foods }),
    [date, weightKg, trainingDay, trainingAfterMeal, targetCalories, plan, foods],
  );

  const baseDayPlan = useMemo(() => computeDayPlan(computeParams), [computeParams]);

  const dayPlan = useMemo(() => {
    if (carbShift <= 0 || trainingAfterMeal !== 'dinner') return baseDayPlan;
    const overrides = optimizePreWorkoutCarbs(baseDayPlan.modules, 'dinner', carbShift);
    return computeDayPlan({ ...computeParams, mealTargetOverrides: overrides });
  }, [baseDayPlan, carbShift, trainingAfterMeal, computeParams]);

  const planForSave = useMemo<MealPlan>(() => {
    const toItems = (items: readonly ComputedMealItem[]): MealItem[] =>
      items.map((item) => ({ foodId: item.foodId, grams: item.grams, locked: item.locked }));
    return {
      breakfast: toItems(dayPlan.modules.breakfast.items),
      lunch: toItems(dayPlan.modules.lunch.items),
      dinner: toItems(dayPlan.modules.dinner.items),
      // Persist the supplements even on a rest day so they survive a toggle.
      postWorkout: trainingDay ? toItems(dayPlan.modules.postWorkout.items) : plan.postWorkout,
    };
  }, [dayPlan, plan.postWorkout, trainingDay]);

  // Auto save (§30) - debounced, only after a user edit.
  useDebouncedEffect(
    () => {
      const persist = async () => {
        setSaveState('saving');
        try {
          await api.saveRecord(date, {
            weightKg,
            trainingDay,
            trainingAfterMeal,
            targetCalories,
            calorieTargetManual: calorieManual,
            plan: planForSave,
          });
          setSaveState('saved');
        } catch {
          setSaveState('error');
        }
      };
      void persist();
    },
    [revision],
    900,
    loaded && revision > 0,
  );

  const mutate = useCallback(
    (module: ModuleKey, update: (items: MealItem[]) => MealItem[]) => {
      setPlan((previous) => ({ ...previous, [module]: update(previous[module]) }));
      touch();
    },
    [touch],
  );

  const addFood = (module: ModuleKey, foodId: number) => {
    const food = foods.find((candidate) => candidate.id === foodId);
    if (!food) return;
    mutate(module, (items) => [...items, { foodId, grams: defaultServing(food, module), locked: false }]);
  };

  const changeGrams = (module: ModuleKey, foodId: number, grams: number) => {
    // A hand edited weight is treated as a decision: lock it and rebalance the rest (§19).
    mutate(module, (items) =>
      items.map((item) =>
        item.foodId === foodId ? { ...item, grams: Math.max(Math.round(grams * 10) / 10, 0), locked: true } : item,
      ),
    );
  };

  const toggleLock = (module: ModuleKey, foodId: number) => {
    mutate(module, (items) =>
      items.map((item) => (item.foodId === foodId ? { ...item, locked: !item.locked } : item)),
    );
  };

  const removeItem = (module: ModuleKey, foodId: number) => {
    mutate(module, (items) => items.filter((item) => item.foodId !== foodId));
  };

  const rebalance = (module: ModuleKey) => {
    touch();
    notify(
      module === 'postWorkout'
        ? '训练后补充按当前克数计入全天'
        : '已按锁定项重新平衡其余食物',
    );
  };

  const changeWeight = (next: number) => {
    setWeightKg(next);
    // Changing body weight refreshes the suggestion unless the day was overridden (§3).
    if (!calorieManual) setTargetCalories(computeDefaultCalories(next));
    touch();
  };

  const openCopy = async () => {
    setCopyOpen(true);
    try {
      const response = await api.listRecords(14);
      setRecentRecords(response.records.filter((record) => record.date !== date));
    } catch {
      setRecentRecords([]);
    }
  };

  const copyFrom = async (from: string) => {
    try {
      const response = await api.copyRecord(from, date);
      hydrate(response.record);
      setCopyOpen(false);
      touch();
      notify(`已复制 ${from} 的计划`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '复制失败');
    }
  };

  if (!loaded) return <Spinner label="正在读取今日记录…" />;

  const suggested = computeDefaultCalories(weightKg);
  const totals = dayPlan.totals;
  const dailyTarget = dayPlan.dailyTarget;

  return (
    <div className="space-y-3 px-4 pb-4">
      <Card>
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[11px] text-slate-400">今天</p>
            <p className="text-lg font-semibold text-slate-800">{date}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={openCopy}>
            复制某天
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="当前体重" value={weightKg} onChange={changeWeight} step={0.1} min={20} max={400} suffix="kg" />
          <NumberField
            label="目标热量"
            value={targetCalories}
            onChange={(value) => {
              setTargetCalories(value);
              setCalorieManual(true);
              touch();
            }}
            step={10}
            min={500}
            max={8000}
            suffix="kcal"
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            建议热量 {suggested} kcal{calorieManual ? '（已手动修改）' : ''}
          </span>
          {calorieManual ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTargetCalories(suggested);
                setCalorieManual(false);
                touch();
              }}
            >
              恢复建议值
            </Button>
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
          <div>
            <p className="mb-1 text-[11px] text-slate-400">训练状态</p>
            <SegmentedControl
              value={trainingDay ? 'training' : 'rest'}
              onChange={(value) => {
                const next = value === 'training';
                setTrainingDay(next);
                if (next) {
                  setPlan((previous) =>
                    previous.postWorkout.length > 0
                      ? previous
                      : { ...previous, postWorkout: defaultPostWorkout(foods) },
                  );
                }
                touch();
              }}
              options={[
                { value: 'training', label: '训练日' },
                { value: 'rest', label: '非训练日' },
              ]}
            />
          </div>

          {trainingDay ? (
            <div>
              <p className="mb-1 text-[11px] text-slate-400">训练时段（哪一餐之后训练）</p>
              <SegmentedControl<MealKey>
                value={trainingAfterMeal}
                onChange={(value) => {
                  setTrainingAfterMeal(value);
                  if (value !== 'dinner') setCarbShift(0);
                  touch();
                }}
                options={[
                  { value: 'breakfast', label: '早餐后' },
                  { value: 'lunch', label: '午餐后' },
                  { value: 'dinner', label: '晚餐后' },
                ]}
              />
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <ProgressBar label="热量" actual={totals.calories} target={targetCalories} unit="kcal" tone="bg-emerald-500" />
          <ProgressBar label="蛋白质" actual={totals.protein} target={dailyTarget.protein} unit="g" tone="bg-sky-500" />
          <ProgressBar label="碳水" actual={totals.carbs} target={dailyTarget.carbs} unit="g" tone="bg-amber-500" />
          <ProgressBar label="脂肪" actual={totals.fat} target={dailyTarget.fat} unit="g" tone="bg-rose-400" />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400 tabular-nums">
          <span>
            宏量目标 {dailyTarget.carbs}C / {dailyTarget.protein}P / {dailyTarget.fat}F
          </span>
          <span>理论热量 {dayPlan.macroTargetCalories} kcal</span>
        </div>

        {Math.abs(dayPlan.calorieDelta) > 0 ? (
          <p className={`mt-1 text-[11px] ${Math.abs(dayPlan.calorieDelta) / Math.max(dayPlan.macroTargetCalories, 1) > 0.08 ? 'text-amber-600' : 'text-slate-400'}`}>
            宏量目标与当日热量目标相差 {dayPlan.calorieDelta > 0 ? '+' : ''}
            {dayPlan.calorieDelta} kcal（不会强行破坏宏量比例）
          </p>
        ) : null}
      </Card>

      {trainingDay && trainingAfterMeal === 'dinner' ? (
        <Card className="!bg-amber-50 !ring-amber-100">
          <p className="text-xs text-amber-800">
            今晚训练，可考虑把部分午餐碳水移动到晚餐（全天总碳水不变）。
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setCarbShift(20); touch(); }} disabled={carbShift > 0}>
              优化训练前碳水
            </Button>
            {carbShift > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => { setCarbShift(0); touch(); }}>
                撤销（已移动 {carbShift}g）
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {MEAL_KEYS.map((key) => (
        <MealCard
          key={key}
          moduleKey={key}
          result={dayPlan.modules[key]}
          disabled={false}
          onOpenPicker={() => setPickerModule(key)}
          onChangeGrams={(foodId, grams) => changeGrams(key, foodId, grams)}
          onToggleLock={(foodId) => toggleLock(key, foodId)}
          onRemove={(foodId) => removeItem(key, foodId)}
          onRebalance={() => rebalance(key)}
        />
      ))}

      {trainingDay ? (
        <MealCard
          moduleKey="postWorkout"
          result={dayPlan.modules.postWorkout}
          disabled={false}
          onOpenPicker={() => setPickerModule('postWorkout')}
          onChangeGrams={(foodId, grams) => changeGrams('postWorkout', foodId, grams)}
          onToggleLock={(foodId) => toggleLock('postWorkout', foodId)}
          onRemove={(foodId) => removeItem('postWorkout', foodId)}
          onRebalance={() => rebalance('postWorkout')}
        />
      ) : null}

      <p className="pt-1 text-center text-[11px] text-slate-400">
        {saveState === 'saving'
          ? '保存中…'
          : saveState === 'saved'
            ? '已自动保存到 D1'
            : saveState === 'error'
              ? '保存失败，将在下次修改时重试'
              : '修改会自动保存'}
      </p>

      <FoodPicker
        open={pickerModule !== null}
        title={pickerModule ? `选择食物 · ${pickerModule === 'postWorkout' ? '训练后补充' : pickerModule}` : ''}
        foods={foods}
        excludeIds={pickerModule ? plan[pickerModule].map((item) => item.foodId) : []}
        onClose={() => setPickerModule(null)}
        onSelect={(foodId) => {
          if (pickerModule) addFood(pickerModule, foodId);
        }}
      />

      <Sheet open={copyOpen} title="复制某一天的饮食" onClose={() => setCopyOpen(false)}>
        {recentRecords.length === 0 ? (
          <EmptyState>最近 14 天还没有其它记录</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentRecords.map((record) => (
              <li key={record.date}>
                <button
                  type="button"
                  onClick={() => void copyFrom(record.date)}
                  className="flex w-full items-center justify-between py-3 text-left active:bg-slate-50"
                >
                  <span>
                    <span className="block text-sm text-slate-700">{record.date}</span>
                    <span className="block text-[11px] text-slate-400">
                      {record.trainingDay ? '训练日' : '非训练日'} · {record.weightKg} kg
                    </span>
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-400">
                    {Math.round(record.actualCalories)} kcal · {Math.round(record.actualCarbs)}C /{' '}
                    {Math.round(record.actualProtein)}P / {Math.round(record.actualFat)}F
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
