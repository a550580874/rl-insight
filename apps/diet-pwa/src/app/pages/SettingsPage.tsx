import { useEffect, useState } from 'react';
import type { SettingsInput, TrainingAfterMeal } from '../../shared/types';
import { suggestedCaloriesFor } from '../../shared/nutrition/targets';
import { Button, Card, Field, NumberField, SectionTitle, SegmentedControl, Toggle } from '../components/ui';
import { useApp } from '../state/AppContext';

export function SettingsPage() {
  const { settings, saveSettings } = useApp();
  const [draft, setDraft] = useState<SettingsInput | null>(null);
  const [defaultCaloriesTouched, setDefaultCaloriesTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDraft({
      currentWeightKg: settings.currentWeightKg,
      baseWeightKg: settings.baseWeightKg,
      baseCalories: settings.baseCalories,
      defaultCalories: settings.defaultCalories,
      defaultTrainingDay: settings.defaultTrainingDay,
      defaultTrainingAfterMeal: settings.defaultTrainingAfterMeal,
    });
    setDefaultCaloriesTouched(false);
  }, [settings]);

  if (!settings || !draft) return null;

  const update = (patch: Partial<SettingsInput>) => setDraft({ ...draft, ...patch });

  const submit = async () => {
    setBusy(true);
    try {
      // 默认热量目标 keeps following the suggestion until the user edits it, so
      // changing 基准体重 / 基准热量 also updates the target of new days (§3).
      const payload: SettingsInput = defaultCaloriesTouched
        ? draft
        : { ...draft, defaultCalories: suggestedCaloriesFor(draft.currentWeightKg, draft) };
      await saveSettings(payload);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 px-4 pb-4">
      <Card>
        <SectionTitle>身体与热量</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="当前体重"
            value={draft.currentWeightKg}
            onChange={(value) => update({ currentWeightKg: value })}
            step={0.1}
            suffix="kg"
          />
          <NumberField
            label="基准体重"
            value={draft.baseWeightKg}
            onChange={(value) => update({ baseWeightKg: value })}
            step={0.1}
            suffix="kg"
          />
          <NumberField
            label="基准热量"
            value={draft.baseCalories}
            onChange={(value) => update({ baseCalories: value })}
            step={10}
            suffix="kcal"
          />
          <NumberField
            label="默认热量目标"
            value={draft.defaultCalories}
            onChange={(value) => {
              setDefaultCaloriesTouched(true);
              update({ defaultCalories: value });
            }}
            step={10}
            suffix="kcal"
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          建议热量 = 基准热量 × 当前体重 ÷ 基准体重 = {settings.suggestedCalories} kcal。
          修改体重只会更新建议值，不会覆盖已记录的历史某天目标。
          「默认热量目标」默认跟随建议热量，改动后按你填写的值作为新一天的目标。
        </p>
      </Card>

      <Card>
        <SectionTitle>默认训练设置</SectionTitle>
        <Field label="新的一天默认是训练日">
          <Toggle
            checked={draft.defaultTrainingDay}
            onChange={(checked) => update({ defaultTrainingDay: checked })}
            label="默认训练日"
          />
        </Field>
        <div className="mt-2">
          <p className="mb-1 text-xs text-slate-500">默认训练时段</p>
          <SegmentedControl<TrainingAfterMeal>
            value={draft.defaultTrainingAfterMeal}
            onChange={(value) => update({ defaultTrainingAfterMeal: value })}
            options={[
              { value: 'breakfast', label: '早餐后' },
              { value: 'lunch', label: '午餐后' },
              { value: 'dinner', label: '晚餐后' },
            ]}
          />
        </div>
      </Card>

      <Button variant="primary" className="w-full" onClick={() => void submit()} disabled={busy}>
        {busy ? '保存中…' : '保存设置'}
      </Button>

      <Card>
        <SectionTitle>数据存储</SectionTitle>
        <p className="text-[11px] leading-relaxed text-slate-500">
          体重、食物库、每日饮食与历史全部保存在 Cloudflare D1；本地 localStorage 只用于临时 UI 状态。
        </p>
      </Card>
    </div>
  );
}
