import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SettingsInput, TrainingAfterMeal } from '../../shared/types';
import { Button, Card, Field, NumberField, SectionTitle, SegmentedControl, Toggle } from '../components/ui';
import { useApp } from '../state/AppContext';

export function SettingsPage() {
  const { settings, saveSettings, logout, notify } = useApp();
  const [draft, setDraft] = useState<SettingsInput | null>(null);
  const [pinForm, setPinForm] = useState({ current: '', next: '' });
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
  }, [settings]);

  if (!settings || !draft) return null;

  const update = (patch: Partial<SettingsInput>) => setDraft({ ...draft, ...patch });

  const submit = async () => {
    setBusy(true);
    try {
      await saveSettings(draft);
    } finally {
      setBusy(false);
    }
  };

  const changePin = async () => {
    if (!/^\d{4,8}$/.test(pinForm.current) || !/^\d{4,8}$/.test(pinForm.next)) {
      notify('PIN 必须是 4-8 位数字');
      return;
    }
    setBusy(true);
    try {
      await api.changePin(pinForm.current, pinForm.next);
      setPinForm({ current: '', next: '' });
      notify('PIN 已更新');
    } catch (error) {
      notify(error instanceof Error ? error.message : '修改失败');
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
            onChange={(value) => update({ defaultCalories: value })}
            step={10}
            suffix="kcal"
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          建议热量 = 基准热量 × 当前体重 ÷ 基准体重 = {settings.suggestedCalories} kcal（1900 × 体重 ÷ 70）。
          修改体重只会更新建议值，不会覆盖已记录的历史某天目标。
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
        <SectionTitle>修改 PIN</SectionTitle>
        <div className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            placeholder="当前 PIN"
            value={pinForm.current}
            onChange={(event) => setPinForm({ ...pinForm, current: event.target.value.replace(/\D/g, '').slice(0, 8) })}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
          <input
            type="password"
            inputMode="numeric"
            placeholder="新 PIN"
            value={pinForm.next}
            onChange={(event) => setPinForm({ ...pinForm, next: event.target.value.replace(/\D/g, '').slice(0, 8) })}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </div>
        <Button className="mt-2" onClick={() => void changePin()} disabled={busy}>
          更新 PIN
        </Button>
      </Card>

      <Card>
        <SectionTitle>数据与登录</SectionTitle>
        <p className="text-[11px] leading-relaxed text-slate-500">
          体重、食物库、每日饮食与历史全部保存在 Cloudflare D1；本地 localStorage 只用于临时 UI 状态。
          PIN 仅以 PBKDF2-SHA256 哈希保存，登录状态使用 HttpOnly Cookie，有效期 30 天。
        </p>
        <Button
          variant="danger"
          className="mt-3"
          onClick={() => {
            void logout();
          }}
        >
          退出登录
        </Button>
      </Card>
    </div>
  );
}
