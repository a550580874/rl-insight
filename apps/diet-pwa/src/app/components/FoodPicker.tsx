import { useMemo, useState } from 'react';
import type { Food, FoodRole } from '../../shared/types';
import { EmptyState, Sheet } from './ui';

const ROLE_LABELS: Record<FoodRole, string> = {
  carb: '碳水',
  protein: '蛋白',
  fat: '脂肪',
  vegetable: '蔬菜',
  mixed: '综合',
};

const ROLE_TONES: Record<FoodRole, string> = {
  carb: 'bg-amber-50 text-amber-700',
  protein: 'bg-sky-50 text-sky-700',
  fat: 'bg-rose-50 text-rose-700',
  vegetable: 'bg-emerald-50 text-emerald-700',
  mixed: 'bg-slate-100 text-slate-600',
};

export function FoodPicker({
  open,
  title,
  foods,
  excludeIds,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  foods: readonly Food[];
  excludeIds: readonly number[];
  onClose: () => void;
  onSelect: (foodId: number) => void;
}) {
  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    const excluded = new Set(excludeIds);
    const keyword = query.trim().toLowerCase();
    return foods
      .filter((food) => food.enabled && !excluded.has(food.id))
      .filter((food) =>
        keyword.length === 0
          ? true
          : food.name.toLowerCase().includes(keyword) || food.category.toLowerCase().includes(keyword),
      );
  }, [excludeIds, foods, query]);

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索食物名称或分类"
        className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
      />

      {candidates.length === 0 ? (
        <EmptyState>没有匹配的食物，可到「食物」页新增或启用。</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {candidates.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(food.id);
                  onClose();
                }}
                className="flex w-full items-center gap-3 py-2.5 text-left active:bg-slate-50"
              >
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${ROLE_TONES[food.role]}`}>
                  {ROLE_LABELS[food.role]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-700">{food.name}</span>
                  <span className="block text-[11px] tabular-nums text-slate-400">
                    每100g {food.carbsPer100g}C / {food.proteinPer100g}P / {food.fatPer100g}F ·{' '}
                    {food.kcalPer100g} kcal
                  </span>
                  {food.servingEnabled ? (
                    <span className="block text-[11px] tabular-nums text-emerald-600">
                      按份 1{food.unitLabel ?? '份'} = {food.kcalPerServing ?? 0} kcal
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-slate-300">＋</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export { ROLE_LABELS, ROLE_TONES };
