import { useMemo, useState } from 'react';
import { FOOD_CATEGORIES, FOOD_ROLES, type Food, type FoodInput, type FoodRole } from '../../shared/types';
import { resolveServingNutrition } from '../../shared/nutrition/serving';
import { Button, Card, EmptyState, Sheet } from '../components/ui';
import { ROLE_LABELS, ROLE_TONES } from '../components/FoodPicker';
import { useApp } from '../state/AppContext';

function toInput(food: Food): FoodInput {
  return {
    name: food.name,
    category: food.category,
    role: food.role,
    kcalPer100g: food.kcalPer100g,
    proteinPer100g: food.proteinPer100g,
    fatPer100g: food.fatPer100g,
    carbsPer100g: food.carbsPer100g,
    enabled: food.enabled,
    minGrams: food.minGrams,
    maxGrams: food.maxGrams,
    stepGrams: food.stepGrams,
    servingEnabled: food.servingEnabled,
    unitLabel: food.unitLabel,
    unitGrams: food.unitGrams,
    kcalPerServing: food.kcalPerServing,
    proteinPerServing: food.proteinPerServing,
    fatPerServing: food.fatPerServing,
    carbsPerServing: food.carbsPerServing,
    servingStep: food.servingStep,
  };
}

const EMPTY_FOOD: FoodInput = {
  name: '',
  category: '其他',
  role: 'mixed',
  kcalPer100g: 0,
  proteinPer100g: 0,
  fatPer100g: 0,
  carbsPer100g: 0,
  enabled: true,
  minGrams: 0,
  maxGrams: 300,
  stepGrams: 5,
  servingEnabled: false,
  unitLabel: null,
  unitGrams: null,
  kcalPerServing: null,
  proteinPerServing: null,
  fatPerServing: null,
  carbsPerServing: null,
  servingStep: 1,
};

function NumberRow({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-600">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-emerald-400"
      />
    </label>
  );
}

/** Number input for an optional value: an empty field means "not set" (null). */
function NullableNumberRow({
  label,
  value,
  onChange,
  step = 0.1,
  placeholder = '留空',
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-600">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value === null ? '' : value}
        placeholder={placeholder}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.trim() === '') {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-emerald-400"
      />
    </label>
  );
}

export function FoodsPage() {
  const { foods, createFood, updateFood, removeFood, notify } = useApp();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: number | null; input: FoodInput } | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return foods;
    return foods.filter(
      (food) => food.name.toLowerCase().includes(keyword) || food.category.toLowerCase().includes(keyword),
    );
  }, [foods, query]);

  const save = async () => {
    if (!editing) return;
    if (editing.input.name.trim().length === 0) {
      notify('请填写食物名称');
      return;
    }
    setBusy(true);
    try {
      if (editing.id === null) {
        await createFood(editing.input);
      } else {
        await updateFood(editing.id, editing.input);
      }
      setEditing(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (food: Food) => {
    if (!window.confirm(`删除「${food.name}」？该食物会从历史餐次中一并移除。`)) return;
    try {
      await removeFood(food.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败');
    }
  };

  const toggleEnabled = async (food: Food) => {
    try {
      await updateFood(food.id, { ...toInput(food), enabled: !food.enabled });
    } catch (error) {
      notify(error instanceof Error ? error.message : '更新失败');
    }
  };

  return (
    <div className="space-y-3 px-4 pb-4">
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索食物"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
        <Button variant="primary" onClick={() => setEditing({ id: null, input: { ...EMPTY_FOOD } })}>
          新增
        </Button>
      </div>

      <p className="text-[11px] text-slate-400">
        营养值是常见公开参考值（每 100g），可随时修改为你自己使用的数据。
      </p>

      {visible.length === 0 ? (
        <Card>
          <EmptyState>没有匹配的食物</EmptyState>
        </Card>
      ) : (
        <ul className="space-y-2">
          {visible.map((food) => (
            <li key={food.id}>
              <Card className={food.enabled ? '' : 'opacity-60'}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">{food.name}</span>
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${ROLE_TONES[food.role]}`}>
                        {ROLE_LABELS[food.role]}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{food.category}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                      每100g {food.carbsPer100g}C / {food.proteinPer100g}P / {food.fatPer100g}F · {food.kcalPer100g} kcal
                    </p>
                    <p className="text-[11px] tabular-nums text-slate-400">
                      份量 {food.minGrams}-{food.maxGrams}g · 步长 {food.stepGrams}g
                      {!food.servingEnabled && food.unitLabel && food.unitGrams
                        ? ` · 1${food.unitLabel}=${food.unitGrams}g`
                        : ''}
                    </p>
                    {food.servingEnabled ? (
                      <p className="text-[11px] tabular-nums text-emerald-600">
                        按份：1{food.unitLabel ?? '份'}
                        {food.unitGrams ? ` ≈ ${food.unitGrams}g` : ''} ·{' '}
                        {food.kcalPerServing ?? 0} kcal / {food.carbsPerServing ?? 0}C /{' '}
                        {food.proteinPerServing ?? 0}P / {food.fatPerServing ?? 0}F
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => setEditing({ id: food.id, input: toInput(food) })}>
                    编辑
                  </Button>
                  <Button size="sm" onClick={() => void toggleEnabled(food)}>
                    {food.enabled ? '禁用' : '启用'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void remove(food)}>
                    删除
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        title={editing?.id === null ? '新增食物' : '编辑食物'}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <div className="space-y-2">
            <label className="block">
              <span className="text-xs text-slate-500">名称</span>
              <input
                value={editing.input.name}
                onChange={(event) => setEditing({ ...editing, input: { ...editing.input, name: event.target.value } })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-slate-500">分类</span>
                <select
                  value={editing.input.category}
                  onChange={(event) =>
                    setEditing({ ...editing, input: { ...editing.input, category: event.target.value } })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm outline-none"
                >
                  {FOOD_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">角色</span>
                <select
                  value={editing.input.role}
                  onChange={(event) =>
                    setEditing({ ...editing, input: { ...editing.input, role: event.target.value as FoodRole } })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm outline-none"
                >
                  {FOOD_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-xl bg-slate-50 px-3 py-1">
              <p className="pt-1 text-[11px] font-medium text-slate-500">每 100g 营养</p>
              <NumberRow
                label="热量 kcal"
                value={editing.input.kcalPer100g}
                onChange={(value) => setEditing({ ...editing, input: { ...editing.input, kcalPer100g: value } })}
                step={1}
              />
              <NumberRow
                label="碳水 g"
                value={editing.input.carbsPer100g}
                onChange={(value) => setEditing({ ...editing, input: { ...editing.input, carbsPer100g: value } })}
              />
              <NumberRow
                label="蛋白质 g"
                value={editing.input.proteinPer100g}
                onChange={(value) => setEditing({ ...editing, input: { ...editing.input, proteinPer100g: value } })}
              />
              <NumberRow
                label="脂肪 g"
                value={editing.input.fatPer100g}
                onChange={(value) => setEditing({ ...editing, input: { ...editing.input, fatPer100g: value } })}
              />
            </div>

            <div className="rounded-xl bg-slate-50 px-3 py-1">
              <p className="pt-1 text-[11px] font-medium text-slate-500">份量约束</p>
              <NumberRow
                label="最少 g"
                value={editing.input.minGrams}
                onChange={(value) => setEditing({ ...editing, input: { ...editing.input, minGrams: value } })}
                step={1}
              />
              <NumberRow
                label="最多 g"
                value={editing.input.maxGrams}
                onChange={(value) => setEditing({ ...editing, input: { ...editing.input, maxGrams: value } })}
                step={1}
              />
              <NumberRow
                label="步长 g"
                value={editing.input.stepGrams}
                onChange={(value) => setEditing({ ...editing, input: { ...editing.input, stepGrams: value } })}
                step={1}
              />
            </div>

            <div className="rounded-xl bg-slate-50 px-3 py-1">
              <p className="pt-1 text-[11px] font-medium text-slate-500">按份管理</p>
              <label className="flex items-center justify-between py-1.5">
                <span className="text-xs text-slate-600">启用按份</span>
                <input
                  type="checkbox"
                  checked={editing.input.servingEnabled}
                  onChange={(event) =>
                    setEditing({ ...editing, input: { ...editing.input, servingEnabled: event.target.checked } })
                  }
                  className="h-4 w-4"
                />
              </label>

              {editing.input.servingEnabled ? (
                <>
                  <p className="pb-1 text-[10px] text-slate-400">
                    按份后可以直接记录「2 个鸡蛋」，每 100g 的数据继续保留，随时可切回重量。
                  </p>
                  <label className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-xs text-slate-600">份单位</span>
                    <input
                      value={editing.input.unitLabel ?? ''}
                      placeholder="个 / 根 / 片 / 勺"
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          input: { ...editing.input, unitLabel: event.target.value.trim() || null },
                        })
                      }
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-emerald-400"
                    />
                  </label>
                  <NullableNumberRow
                    label="每份重量 g（可选）"
                    value={editing.input.unitGrams}
                    onChange={(value) =>
                      setEditing({
                        ...editing,
                        input: { ...editing.input, unitGrams: value !== null && value > 0 ? value : null },
                      })
                    }
                    step={1}
                  />
                  <NullableNumberRow
                    label="每份热量 kcal"
                    value={editing.input.kcalPerServing}
                    onChange={(value) =>
                      setEditing({ ...editing, input: { ...editing.input, kcalPerServing: value } })
                    }
                    step={1}
                  />
                  <NullableNumberRow
                    label="每份碳水 g"
                    value={editing.input.carbsPerServing}
                    onChange={(value) =>
                      setEditing({ ...editing, input: { ...editing.input, carbsPerServing: value } })
                    }
                  />
                  <NullableNumberRow
                    label="每份蛋白质 g"
                    value={editing.input.proteinPerServing}
                    onChange={(value) =>
                      setEditing({ ...editing, input: { ...editing.input, proteinPerServing: value } })
                    }
                  />
                  <NullableNumberRow
                    label="每份脂肪 g"
                    value={editing.input.fatPerServing}
                    onChange={(value) =>
                      setEditing({ ...editing, input: { ...editing.input, fatPerServing: value } })
                    }
                  />
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-[10px] text-slate-400">
                      {editing.input.unitGrams
                        ? '按每100g × 每份重量换算'
                        : '填写每份重量后才能自动换算'}
                    </span>
                    <Button
                      size="sm"
                      disabled={!editing.input.unitGrams}
                      onClick={() => {
                        const derived = resolveServingNutrition({
                          servingEnabled: true,
                          unitGrams: editing.input.unitGrams,
                          kcalPer100g: editing.input.kcalPer100g,
                          proteinPer100g: editing.input.proteinPer100g,
                          fatPer100g: editing.input.fatPer100g,
                          carbsPer100g: editing.input.carbsPer100g,
                          kcalPerServing: null,
                          proteinPerServing: null,
                          fatPerServing: null,
                          carbsPerServing: null,
                        });
                        setEditing({ ...editing, input: { ...editing.input, ...derived } });
                      }}
                    >
                      按每100g自动计算每份
                    </Button>
                  </div>
                  <NumberRow
                    label="份数步长"
                    value={editing.input.servingStep}
                    onChange={(value) =>
                      setEditing({
                        ...editing,
                        input: { ...editing.input, servingStep: value > 0 ? value : 1 },
                      })
                    }
                    step={0.5}
                  />
                </>
              ) : (
                <>
                  <p className="pb-1 text-[10px] text-slate-400">显示单位（可选，底层仍按克计算）</p>
                  <label className="flex items-center justify-between gap-3 py-1.5">
                    <span className="text-xs text-slate-600">单位名称</span>
                    <input
                      value={editing.input.unitLabel ?? ''}
                      placeholder="如 个 / ml"
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          input: { ...editing.input, unitLabel: event.target.value.trim() || null },
                        })
                      }
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-emerald-400"
                    />
                  </label>
                  <NumberRow
                    label="每单位克数"
                    value={editing.input.unitGrams ?? 0}
                    onChange={(value) =>
                      setEditing({ ...editing, input: { ...editing.input, unitGrams: value > 0 ? value : null } })
                    }
                    step={1}
                  />
                </>
              )}
            </div>

            <label className="flex items-center justify-between py-1">
              <span className="text-xs text-slate-600">启用</span>
              <input
                type="checkbox"
                checked={editing.input.enabled}
                onChange={(event) =>
                  setEditing({ ...editing, input: { ...editing.input, enabled: event.target.checked } })
                }
                className="h-4 w-4"
              />
            </label>

            <div className="flex gap-2 pt-1">
              <Button variant="primary" onClick={() => void save()} disabled={busy} className="flex-1">
                {busy ? '保存中…' : '保存'}
              </Button>
              <Button onClick={() => setEditing(null)}>取消</Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
