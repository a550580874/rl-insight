import { useState } from 'react';
import type { ModuleResult, QuantityType } from '../../shared/types';
import { Button } from './ui';

const MODULE_TITLES: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  postWorkout: '训练后补充',
};

function formatError(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

/** Grams input that only commits on blur so typing "250" is not clamped mid-way. */
function NumberInput({
  value,
  step,
  disabled,
  onCommit,
}: {
  value: number;
  step: number;
  disabled: boolean;
  onCommit: (grams: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null) {
          const parsed = Number(draft);
          if (Number.isFinite(parsed)) onCommit(parsed);
        }
        setDraft(null);
      }}
      className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm font-medium tabular-nums outline-none focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-400"
    />
  );
}

export function MealCard({
  moduleKey,
  result,
  disabled,
  onOpenPicker,
  onChangeGrams,
  onChangeServings,
  onChangeQuantityType,
  onToggleLock,
  onRemove,
  onRebalance,
}: {
  moduleKey: 'breakfast' | 'lunch' | 'dinner' | 'postWorkout';
  result: ModuleResult;
  disabled: boolean;
  onOpenPicker: () => void;
  onChangeGrams: (foodId: number, grams: number) => void;
  onChangeServings: (foodId: number, servings: number) => void;
  onChangeQuantityType: (foodId: number, quantityType: QuantityType) => void;
  onToggleLock: (foodId: number) => void;
  onRemove: (foodId: number) => void;
  onRebalance: () => void;
}) {
  const lockedCount = result.items.filter((item) => item.locked).length;
  const hasItems = result.items.length > 0;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-800">{MODULE_TITLES[moduleKey] ?? moduleKey}</h2>
        <span className="text-[11px] tabular-nums text-slate-400">
          目标 {Math.round(result.target.carbs)}C / {Math.round(result.target.protein)}P /{' '}
          {Math.round(result.target.fat)}F
        </span>
      </header>

      {hasItems ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {result.items.map((item) => {
            const byServing = item.quantityType === 'servings';
            const unit = item.unitLabel ?? '份';
            const step = item.servingStep > 0 ? item.servingStep : 1;
            return (
              <li key={item.foodId} className="flex items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={() => onToggleLock(item.foodId)}
                  aria-label={item.locked ? `解锁 ${item.name}` : `锁定 ${item.name}`}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
                    item.locked ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {item.locked ? '🔒' : '🔓'}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-700">{item.name}</div>
                  <div className="text-[11px] tabular-nums text-slate-400">
                    {item.macros.carbs}C · {item.macros.protein}P · {item.macros.fat}F ·{' '}
                    {Math.round(item.macros.calories)} kcal
                    {byServing
                      ? ` · ${item.servings}${unit}`
                      : item.units !== null && item.unitLabel
                        ? ` · 约 ${item.units}${item.unitLabel}`
                        : ''}
                  </div>
                  {item.servingEnabled ? (
                    <div className="mt-1 flex items-center gap-1">
                      {(['grams', 'servings'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          disabled={disabled}
                          onClick={() => onChangeQuantityType(item.foodId, mode)}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                            item.quantityType === mode
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {mode === 'grams' ? '重量' : '份'}
                        </button>
                      ))}
                      {byServing ? <span className="text-[10px] text-slate-400">1{unit}</span> : null}
                    </div>
                  ) : null}
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  className="!px-2"
                  disabled={disabled}
                  onClick={() =>
                    byServing
                      ? onChangeServings(item.foodId, Math.max(item.servings - step, 0))
                      : onChangeGrams(item.foodId, Math.max(item.grams - (item.unitGrams ?? 5), 0))
                  }
                  ariaLabel="减少"
                >
                  −
                </Button>
                {byServing ? (
                  <NumberInput
                    value={item.servings}
                    step={step}
                    disabled={disabled}
                    onCommit={(servings) => onChangeServings(item.foodId, servings)}
                  />
                ) : (
                  <NumberInput
                    value={item.grams}
                    step={item.unitGrams ?? 5}
                    disabled={disabled}
                    onCommit={(grams) => onChangeGrams(item.foodId, grams)}
                  />
                )}
                <span className="w-14 shrink-0 text-[10px] text-slate-400">
                  {byServing ? unit : 'g'}
                  {byServing && item.grams > 0 ? ` · ${item.grams}g` : ''}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="!px-2"
                  disabled={disabled}
                  onClick={() =>
                    byServing
                      ? onChangeServings(item.foodId, item.servings + step)
                      : onChangeGrams(item.foodId, item.grams + (item.unitGrams ?? 5))
                  }
                  ariaLabel="增加"
                >
                  +
                </Button>
                <button
                  type="button"
                  onClick={() => onRemove(item.foodId)}
                  aria-label={`删除 ${item.name}`}
                  className="shrink-0 px-1 text-slate-300"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">
          {moduleKey === 'postWorkout' ? '训练日默认补充香蕉与蛋白粉' : '还没有选择食物'}
        </p>
      )}

      {hasItems ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] tabular-nums">
          <div className="flex justify-between">
            <dt className="text-slate-400">实际碳水</dt>
            <dd className="text-slate-700">
              {result.actual.carbs} <span className="text-slate-400">({formatError(result.error.carbs)})</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">实际蛋白</dt>
            <dd className="text-slate-700">
              {result.actual.protein} <span className="text-slate-400">({formatError(result.error.protein)})</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">实际脂肪</dt>
            <dd className="text-slate-700">
              {result.actual.fat} <span className="text-slate-400">({formatError(result.error.fat)})</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">热量</dt>
            <dd className="text-slate-700">{Math.round(result.actual.calories)} kcal</dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onOpenPicker} disabled={disabled}>
          + 选择食物
        </Button>
        {hasItems ? (
          <Button size="sm" variant="ghost" onClick={onRebalance} disabled={disabled}>
            重新平衡{lockedCount > 0 ? `（保留 ${lockedCount} 项锁定）` : ''}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
